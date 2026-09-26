import 'dotenv/config';
import { runQuery, getRecord, allRecords, pool } from '../database.js';
import { getCustomerTotalOutstanding, getCustomerLedger } from '../ledgerEngine.js';

const money = (val) => Math.round(Number(val || 0) * 100) / 100;

async function removeBothWrong19250Payments() {
  console.log('===============================================================');
  console.log('   REMOVING BOTH ERRONEOUS 19,250 PAYMENTS (CASH & UPI)       ');
  console.log('===============================================================\n');

  try {
    // 1. Locate both 19250 payments for customer 21
    const paymentsToRemove = await allRecords(
      `SELECT * FROM payments 
       WHERE customer_id = 21 
         AND (
           payment_number IN ('PAY-000017', 'PAY-000023') 
           OR (amount = 19250.00)
         )
       ORDER BY id ASC`
    );

    if (paymentsToRemove.length === 0) {
      console.log('⚠️ No 19,250 payments found for customer 21 (may already be removed).');
    } else {
      console.log(`Found ${paymentsToRemove.length} payment(s) to remove:`);
      for (const p of paymentsToRemove) {
        console.log(`  - [ID: ${p.id}] ${p.payment_number}: ₹${Number(p.amount).toLocaleString('en-IN')} via ${p.payment_mode} on ${p.payment_date}`);
        await runQuery(`DELETE FROM payment_allocations WHERE payment_id = ?`, [p.id]);
        await runQuery(`DELETE FROM payments WHERE id = ?`, [p.id]);
        console.log(`    ✔ Removed payment ${p.payment_number} and all its allocations.`);
      }
      console.log('\n✔ Erroneous payments removed successfully.\n');
    }

    // 2. Ensure customer opening_balance is 201,098.00
    await runQuery(`UPDATE customers SET opening_balance = 201098.00 WHERE id = 21`);

    // Ensure ledger_entries has OPENING_BALANCE of 201,098.00
    await runQuery(`DELETE FROM ledger_entries WHERE customer_id = 21 AND entry_type = 'OPENING_BALANCE'`);
    await runQuery(
      `INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
       VALUES (2, 21, 'OPENING_BALANCE', 'OB-000021', '2026-08-01', 201098.00, 0.00, 'Opening Balance for JAYSANKAR MOBILE VIKASHBHAI', '2026-08-01 00:00:00')`
    );

    // 3. Re-sync current_balance for Customer 21
    await runQuery(`
      UPDATE customers c
      SET current_balance = (
        COALESCE(c.opening_balance, 0)
        + COALESCE((SELECT SUM(COALESCE(NULLIF(s.current_invoice_total, 0), s.total_amount)) FROM sales s WHERE s.customer_id = c.id), 0)
        - COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.customer_id = c.id AND pm.reversed_at IS NULL AND COALESCE(pm.payment_mode, '') != 'credit_note'), 0)
        - COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn WHERE cn.customer_id = c.id AND cn.status != 'cancelled'), 0)
      )
      WHERE c.id = 21
    `);

    // 4. Print final verified customer status
    const dynamicTotal = await getCustomerTotalOutstanding(21);
    const ledger = await getCustomerLedger(21);

    console.log('===============================================================');
    console.log('FINAL RECONCILED ACCOUNT FOR JAYSANKAR MOBILE VIKASHBHAI:');
    console.log('===============================================================');
    console.log(`- Opening Balance:         ₹${Number(dynamicTotal.opening_balance).toLocaleString('en-IN')}`);
    console.log(`- Total Invoiced:          ₹${Number(dynamicTotal.total_invoiced).toLocaleString('en-IN')}`);
    console.log(`- Total Real Payments:     ₹${Number(dynamicTotal.total_paid).toLocaleString('en-IN')}`);
    console.log(`- TOTAL OUTSTANDING DUE:   ₹${Number(dynamicTotal.total_outstanding).toLocaleString('en-IN')}`);
    console.log(`- Ledger Closing Balance:  ₹${Number(ledger.closing_balance).toLocaleString('en-IN')}`);
    console.log('---------------------------------------------------------------');
    if (Number(dynamicTotal.total_outstanding) === 215448 && Number(ledger.closing_balance) === 215448) {
      console.log('✅ PERFECT MATCH! The customer balance is EXACTLY ₹2,15,448.00!');
    } else {
      console.log(`Current: ₹${dynamicTotal.total_outstanding} (Target: ₹215,448.00)`);
    }
    console.log('===============================================================\n');

  } catch (err) {
    console.error('Error removing payments:', err);
  } finally {
    await pool.end();
  }
}

removeBothWrong19250Payments();
