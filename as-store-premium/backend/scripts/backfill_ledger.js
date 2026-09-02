/**
 * backfill_ledger.js — Retroactively create journal entries for all existing data
 *
 * MANUAL RUN ONLY. Never auto-run during migration or server startup.
 * Run: node backend/scripts/backfill_ledger.js
 *
 * What it does:
 *   1. For every existing sale, create a journal entry (DR Cash/AR, CR Sales Revenue)
 *   2. For every existing payment, create a journal entry (DR Cash, CR AR)
 *   3. For every existing credit note, create a journal entry (DR Sales Returns, CR AR)
 *
 * Safety:
 *   - Idempotent: skips rows where journal_entries already exist for the ref
 *   - Runs in a single DB transaction per entity type — can be re-run safely
 *   - Dry-run mode: set DRY_RUN=1 to see what would be created without writing
 *
 * Environment: Reads DATABASE_URL from .env in the backend/ directory.
 */

import 'dotenv/config';
import pg from 'pg';

const DRY_RUN = process.env.DRY_RUN === '1';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

let inserted = 0;
let skipped = 0;

async function getAccountId(client, code) {
  const { rows } = await client.query('SELECT id FROM chart_of_accounts WHERE code = $1 AND is_active = TRUE', [code]);
  if (!rows[0]) throw new Error(`Account "${code}" not found — run migration 052 first.`);
  return rows[0].id;
}

async function entryExists(client, refType, refId) {
  const { rows } = await client.query(
    'SELECT 1 FROM journal_entries WHERE ref_type = $1 AND ref_id = $2 LIMIT 1',
    [refType, refId]
  );
  return rows.length > 0;
}

async function insertJE(client, { shopId, entryDate, narration, refType, refId, lines }) {
  if (DRY_RUN) {
    console.log(`  [DRY] Would insert JE: ${refType} ${refId} — ${narration}`);
    lines.forEach(l => console.log(`         ${l.side === 'debit' ? 'DR' : 'CR'} ${l.code} ${l.amount}`));
    inserted++;
    return;
  }
  const { rows: jeRows } = await client.query(
    `INSERT INTO journal_entries (shop_id, entry_date, narration, ref_type, ref_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [shopId, entryDate, narration, refType, refId]
  );
  const jeId = jeRows[0].id;
  for (const line of lines) {
    const accId = await getAccountId(client, line.code);
    await client.query(
      `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, entity_type, entity_id, narration)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        jeId, accId,
        line.side === 'debit' ? line.amount : 0,
        line.side === 'credit' ? line.amount : 0,
        line.entityType || null, line.entityId || null, line.narration || null
      ]
    );
  }
  inserted++;
}

async function backfillSales(client) {
  console.log('\n[1/3] Backfilling sales...');
  const { rows: sales } = await client.query(`
    SELECT s.id, s.shop_id, s.customer_id, s.total_amount, s.payment_mode, s.invoice_number,
           COALESCE(s.invoice_date, s.created_at::date) AS entry_date
    FROM sales s
    ORDER BY s.id ASC
  `);

  for (const sale of sales) {
    if (await entryExists(client, 'sale', sale.id)) { skipped++; continue; }
    const amount = money(sale.total_amount);
    if (amount <= 0) { skipped++; continue; }
    const isCash = !['credit', 'pending'].includes(String(sale.payment_mode || '').toLowerCase());
    const debitCode = isCash ? '1000' : '1020';
    const invRef = sale.invoice_number || `INV-${String(sale.id).padStart(6, '0')}`;
    await insertJE(client, {
      shopId: sale.shop_id,
      entryDate: sale.entry_date,
      narration: `[BACKFILL] Sale ${invRef}`,
      refType: 'sale',
      refId: sale.id,
      lines: [
        { code: debitCode, side: 'debit',  amount, entityType: 'sale', entityId: sale.id, narration: isCash ? 'Cash/Payment' : 'Accounts Receivable' },
        { code: '4000',    side: 'credit', amount, entityType: 'sale', entityId: sale.id, narration: 'Sales Revenue' },
      ],
    });
  }
  console.log(`  Processed ${sales.length} sales.`);
}

async function backfillPayments(client) {
  console.log('\n[2/3] Backfilling payments...');
  const { rows: payments } = await client.query(`
    SELECT p.id, p.sale_id, p.amount, p.payment_mode, p.payment_date,
           s.shop_id, s.invoice_number
    FROM payments p
    JOIN sales s ON s.id = p.sale_id
    ORDER BY p.id ASC
  `);

  for (const pmt of payments) {
    if (await entryExists(client, 'payment', pmt.id)) { skipped++; continue; }
    const amount = money(pmt.amount);
    if (amount <= 0) { skipped++; continue; }
    const invRef = pmt.invoice_number || `INV-${String(pmt.sale_id).padStart(6, '0')}`;
    await insertJE(client, {
      shopId: pmt.shop_id,
      entryDate: pmt.payment_date,
      narration: `[BACKFILL] Payment on ${invRef} via ${pmt.payment_mode}`,
      refType: 'payment',
      refId: pmt.id,
      lines: [
        { code: '1000', side: 'debit',  amount, entityType: 'payment', entityId: pmt.id, narration: `Payment via ${pmt.payment_mode}` },
        { code: '1020', side: 'credit', amount, entityType: 'sale',    entityId: pmt.sale_id, narration: 'AR settled' },
      ],
    });
  }
  console.log(`  Processed ${payments.length} payments.`);
}

async function backfillCreditNotes(client) {
  console.log('\n[3/3] Backfilling credit notes...');
  const { rows: cns } = await client.query(`
    SELECT cn.id, cn.shop_id, cn.customer_id, cn.amount, cn.credit_note_number,
           cn.return_date AS entry_date
    FROM credit_notes cn
    ORDER BY cn.id ASC
  `);

  for (const cn of cns) {
    if (await entryExists(client, 'credit_note', cn.id)) { skipped++; continue; }
    const amount = money(cn.amount);
    if (amount <= 0) { skipped++; continue; }
    await insertJE(client, {
      shopId: cn.shop_id,
      entryDate: cn.entry_date,
      narration: `[BACKFILL] Credit Note ${cn.credit_note_number}`,
      refType: 'credit_note',
      refId: cn.id,
      lines: [
        { code: '5020', side: 'debit',  amount, entityType: 'credit_note', entityId: cn.id, narration: 'Sales Returns' },
        { code: '1020', side: 'credit', amount, entityType: 'credit_note', entityId: cn.id, narration: 'AR reduced' },
      ],
    });
  }
  console.log(`  Processed ${cns.length} credit notes.`);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Ledger Backfill${DRY_RUN ? ' [DRY RUN — no writes]' : ''}`);
    console.log(`${'='.repeat(60)}`);

    // Verify migration 052 has been run
    const { rows: tableCheck } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries' LIMIT 1`
    );
    if (!tableCheck.length) {
      console.error('\n  ERROR: journal_entries table not found. Run migration 052 first.\n');
      process.exit(1);
    }

    if (!DRY_RUN) await client.query('BEGIN');

    await backfillSales(client);
    await backfillPayments(client);
    await backfillCreditNotes(client);

    if (!DRY_RUN) await client.query('COMMIT');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Done. Inserted: ${inserted}  Skipped (already existed): ${skipped}`);
    console.log(`${'='.repeat(60)}\n`);
  } catch (err) {
    if (!DRY_RUN) await client.query('ROLLBACK').catch(() => {});
    console.error('\n  BACKFILL FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
