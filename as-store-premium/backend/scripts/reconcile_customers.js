import 'dotenv/config';
import { runQuery, getRecord, allRecords, pool } from '../database.js';
import { getCustomerTotalOutstanding, getCustomerLedger } from '../ledgerEngine.js';

const money = (val) => Math.round(Number(val || 0) * 100) / 100;

async function reconcileAndAuditCustomers() {
  console.log('===============================================================');
  console.log('   CUSTOMER BALANCES & LEDGER RECONCILIATION AUDIT            ');
  console.log('===============================================================\n');

  try {
    // 1. Reconcile Customer 21: JAYSANKAR MOBILE VIKASHBHAI
    console.log('1. Reconciling Customer 21 (JAYSANKAR MOBILE VIKASHBHAI)...');
    await runQuery(`UPDATE customers SET opening_balance = 201098.00 WHERE id = 21`);

    // Ensure payment of 39500 exists
    let p21 = await getRecord(`SELECT id FROM payments WHERE customer_id = 21 AND amount = 39500.00 AND reversed_at IS NULL LIMIT 1`);
    let p21Id = p21?.id;
    if (!p21Id) {
      const pNumRow = await getRecord(`SELECT 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0') AS num`);
      const insRes = await runQuery(
        `INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, notes, unallocated_amount, shop_id, created_at)
         VALUES (?, 21, 39500.00, '2026-08-31', 'cash', 'Repayment applied towards Opening Balance', 0.00, 2, '2026-08-31 16:00:00')`,
        [pNumRow.num]
      );
      p21Id = insRes.id;
    }

    const alloc21 = await getRecord(
      `SELECT id FROM payment_allocations WHERE customer_id = 21 AND allocation_type = 'opening_balance' AND reversed_at IS NULL LIMIT 1`
    );
    if (!alloc21) {
      await runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, allocation_type, amount_applied, notes, created_at)
         VALUES (?, 21, 'opening_balance', 39500.00, 'Settlement towards Opening Balance', '2026-08-31 16:00:00')`,
        [p21Id]
      );
    }

    await runQuery(`DELETE FROM ledger_entries WHERE customer_id = 21 AND entry_type = 'OPENING_BALANCE'`);
    await runQuery(
      `INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
       VALUES (2, 21, 'OPENING_BALANCE', 'OB-000021', '2026-08-01', 201098.00, 0.00, 'Opening Balance for JAYSANKAR MOBILE VIKASHBHAI', '2026-08-01 00:00:00')`
    );

    // 2. Reconcile Customer 26 (JJ MOBILE)
    console.log('2. Reconciling Customer 26 (JJ MOBILE)...');
    await runQuery(`UPDATE customers SET opening_balance = 1762570.00 WHERE id = 26`);
    await runQuery(`DELETE FROM ledger_entries WHERE customer_id = 26 AND entry_type = 'OPENING_BALANCE'`);
    await runQuery(
      `INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
       VALUES (2, 26, 'OPENING_BALANCE', 'OB-000026', '2026-08-01', 1762570.00, 0.00, 'Opening Balance for JJ MOBILE', '2026-08-01 00:00:00')`
    );

    // 3. Reconcile Customer 31 (K UNIC HIRABHAI)
    console.log('3. Reconciling Customer 31 (K UNIC HIRABHAI)...');
    await runQuery(`UPDATE customers SET opening_balance = 748343.00 WHERE id = 31`);
    await runQuery(`DELETE FROM ledger_entries WHERE customer_id = 31 AND entry_type = 'OPENING_BALANCE'`);
    await runQuery(
      `INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
       VALUES (2, 31, 'OPENING_BALANCE', 'OB-000031', '2026-08-01', 748343.00, 0.00, 'Opening Balance for K UNIC HIRABHAI', '2026-08-01 00:00:00')`
    );

    // 4. Reconcile Customer 36 (OM SATGURU MOBILE)
    console.log('4. Reconciling Customer 36 (OM SATGURU MOBILE)...');
    await runQuery(`UPDATE customers SET opening_balance = 300300.00 WHERE id = 36`);
    await runQuery(`DELETE FROM ledger_entries WHERE customer_id = 36 AND entry_type = 'OPENING_BALANCE'`);
    await runQuery(
      `INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
       VALUES (2, 36, 'OPENING_BALANCE', 'OB-000036', '2026-08-01', 300300.00, 0.00, 'Opening Balance for OM SATGURU MOBILE', '2026-08-01 00:00:00')`
    );

    // 5. Backfill OPENING_BALANCE ledger_entries for all customers with opening_balance > 0
    await runQuery(`
      INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
      SELECT 
          COALESCE(c.shop_id, 2),
          c.id,
          'OPENING_BALANCE',
          'OB-' || LPAD(c.id::text, 6, '0'),
          COALESCE(c.opening_balance_date, '2026-08-01'::DATE),
          c.opening_balance,
          0.00,
          'Opening Balance for ' || c.name,
          COALESCE(c.opening_balance_date::timestamp, c.created_at, CURRENT_TIMESTAMP)
      FROM customers c
      WHERE c.opening_balance > 0
        AND NOT EXISTS (
          SELECT 1 FROM ledger_entries le 
          WHERE le.customer_id = c.id AND le.entry_type = 'OPENING_BALANCE'
        )
    `);

    // 6. Update current_balance on all customers
    await runQuery(`
      UPDATE customers c
      SET current_balance = (
        COALESCE(c.opening_balance, 0)
        + COALESCE((SELECT SUM(COALESCE(NULLIF(s.current_invoice_total, 0), s.total_amount)) FROM sales s WHERE s.customer_id = c.id), 0)
        - COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.customer_id = c.id AND pm.reversed_at IS NULL AND COALESCE(pm.payment_mode, '') != 'credit_note'), 0)
        - COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn WHERE cn.customer_id = c.id AND cn.status != 'cancelled'), 0)
      )
    `);

    console.log('\n✔ Data synchronization complete!\n');

    // 7. Audit & Verify all customers
    console.log('Auditing customer balances across all accounts:\n');
    const customers = await allRecords(`SELECT id, name, mobile, opening_balance FROM customers ORDER BY id ASC`);

    const auditResults = [];
    let discrepancies = 0;

    for (const c of customers) {
      const dynamicTotal = await getCustomerTotalOutstanding(c.id);
      const ledger = await getCustomerLedger(c.id);
      const isMatch = Math.abs(money(dynamicTotal.total_outstanding) - Math.abs(money(ledger.closing_balance))) < 0.01;

      if (!isMatch) discrepancies++;

      auditResults.push({
        id: c.id,
        name: c.name,
        opening_balance: money(c.opening_balance),
        settled_ob: money(dynamicTotal.settled_opening_balance),
        total_invoiced: money(dynamicTotal.total_invoiced),
        total_paid: money(dynamicTotal.total_paid),
        outstanding_due: money(dynamicTotal.total_outstanding),
        ledger_closing: money(ledger.closing_balance),
        status: isMatch ? '✅ MATCH' : '❌ MISMATCH'
      });
    }

    console.table(auditResults);

    console.log('\n===============================================================');
    if (discrepancies === 0) {
      console.log(`✅ ALL ${customers.length} CUSTOMERS ARE 100% RECONCILED & IN BALANCE!`);
    } else {
      console.log(`⚠️ ${discrepancies} customers have discrepancies that need attention.`);
    }

    const c21Check = auditResults.find(r => r.id === 21);
    if (c21Check) {
      console.log('\n---------------------------------------------------------------');
      console.log('CUSTOMER 21 (JAYSANKAR MOBILE VIKASHBHAI) SUMMARY:');
      console.log(`- Opening Balance:         ₹${c21Check.opening_balance.toLocaleString('en-IN')}`);
      console.log(`- Settled Towards OB:      ₹${c21Check.settled_ob.toLocaleString('en-IN')}`);
      console.log(`- Remaining Opening Bal:   ₹${(c21Check.opening_balance - c21Check.settled_ob).toLocaleString('en-IN')}`);
      console.log(`- Total Invoiced:          ₹${c21Check.total_invoiced.toLocaleString('en-IN')}`);
      console.log(`- Total Paid:              ₹${c21Check.total_paid.toLocaleString('en-IN')}`);
      console.log(`- TOTAL OUTSTANDING DUE:   ₹${c21Check.outstanding_due.toLocaleString('en-IN')}`);
      console.log(`- Status:                  ${c21Check.outstanding_due === 215448 ? '✅ EXACT MATCH (₹2,15,448.00)' : '❌ Expected 215,448'}`);
      console.log('---------------------------------------------------------------\n');
    }
    console.log('===============================================================\n');

  } catch (err) {
    console.error('Error during reconciliation audit:', err);
  } finally {
    await pool.end();
  }
}

reconcileAndAuditCustomers();
