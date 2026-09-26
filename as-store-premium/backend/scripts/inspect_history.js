import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, allRecords, getRecord } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../../../');

async function inspectHistory() {
  console.log('--- Deep History Inspection for Customer 15 (JAGDISHBHAI) ---');
  const results = {};

  // 1. Audit logs for customer 15
  try {
    const auditLogs = await allRecords(`
      SELECT * FROM audit_logs 
      WHERE (entity_type = 'customer' AND entity_id = 15)
         OR details ILIKE '%jagdish%'
         OR details ILIKE '%9904888666%'
      ORDER BY id DESC LIMIT 50
    `);
    results.auditLogs = auditLogs;
    console.log(`Audit logs found: ${auditLogs.length}`);
  } catch (err) {
    console.log('Audit logs error:', err.message);
  }

  // 2. Any payments mentioning 9904888666 or jagdish across entire payments table
  try {
    const anyPayments = await allRecords(`
      SELECT p.*, c.name as customer_name
      FROM payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.customer_id = 15
         OR LOWER(COALESCE(p.notes, '')) LIKE '%jagdish%'
         OR LOWER(COALESCE(p.reference_number, '')) LIKE '%jagdish%'
         OR LOWER(COALESCE(p.note, '')) LIKE '%jagdish%'
      ORDER BY p.id ASC
    `);
    results.anyPayments = anyPayments;
    console.log(`Payments found: ${anyPayments.length}`);
  } catch (err) {
    console.log('Payments error:', err.message);
  }

  // 3. Any sales with mobile 9904888666 or customer_id = 15
  try {
    const anySales = await allRecords(`
      SELECT id, invoice_number, total_amount, paid_amount, pending_amount, 
             previous_balance, current_invoice_total, net_payable_amount, closing_balance,
             advance_applied, payment_mode, status, sale_date, invoice_date, created_at, notes
      FROM sales
      WHERE customer_id = 15
      ORDER BY id ASC
    `);
    results.anySales = anySales;
    console.log(`Sales found: ${anySales.length}`);
  } catch (err) {
    console.log('Sales error:', err.message);
  }

  // 4. Check journal entries for customer 15
  try {
    const journals = await allRecords(`
      SELECT je.id as journal_id, je.entry_date, je.narration, je.ref_type, je.ref_id,
             jel.debit, jel.credit, coa.code, coa.name as account_name
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      JOIN chart_of_accounts coa ON coa.id = jel.account_id
      WHERE jel.entity_type = 'customer' AND jel.entity_id = 15
      ORDER BY je.entry_date ASC, je.id ASC
    `);
    results.journals = journals;
    console.log(`Journals found: ${journals.length}`);
  } catch (err) {
    console.log('Journals error:', err.message);
  }

  // 5. Check if customer 15 was modified in customer table
  const cust = await getRecord(`SELECT * FROM customers WHERE id = 15`);
  results.customer = cust;

  const outPath = path.join(workspaceRoot, 'jagdish_history.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log('Written to ' + outPath);

  await pool.end();
}

inspectHistory().catch(err => {
  console.error(err);
  process.exit(1);
});
