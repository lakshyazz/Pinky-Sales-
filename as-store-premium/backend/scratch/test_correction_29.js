import { runQuery, getRecord, allRecords, runTransaction, pool } from '../database.js';
import { getCustomerLedger } from '../ledgerEngine.js';

async function applyCorrection() {
  try {
    console.log('=== BEFORE CORRECTION ===');
    const ledgerBefore = await getCustomerLedger(29);
    console.log('Opening balance:', ledgerBefore.opening_balance);
    console.log('Closing balance:', ledgerBefore.closing_balance);
    console.log('Rows count:', ledgerBefore.rows.length);

    await runTransaction(async (tx) => {
      // 1. Update customer opening balance to 0.00
      await tx.runQuery(`UPDATE customers SET opening_balance = 0.00 WHERE id = 29`);

      // 2. Remove ledger entry for OPENING_BALANCE
      await tx.runQuery(`DELETE FROM ledger_entries WHERE customer_id = 29 AND entry_type = 'OPENING_BALANCE'`);

      // 3. Clear old payment allocations for payments 59, 60, 61
      await tx.runQuery(`DELETE FROM payment_allocations WHERE customer_id = 29 AND payment_id IN (59, 60, 61)`);

      // 4. Re-insert correct allocations for payments 59, 60, 61
      // Payment 59 (33,000.00):
      // - 25,820.00 to Sale 83 (completes 41,500 + 25,820 = 67,320)
      // - 7,180.00 to Sale 84
      await tx.runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
         VALUES (?, ?, ?, 'invoice', ?, 'Allocated to Invoice #INV-000083', '2026-09-08 08:25:44.707')`,
        [59, 29, 83, 25820.00]
      );
      await tx.runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
         VALUES (?, ?, ?, 'invoice', ?, 'Allocated to Invoice #INV-000084', '2026-09-08 08:25:44.707')`,
        [59, 29, 84, 7180.00]
      );

      // Payment 60 (17,000.00):
      // - 17,000.00 to Sale 84
      await tx.runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
         VALUES (?, ?, ?, 'invoice', ?, 'Allocated to Invoice #INV-000084', '2026-09-08 08:26:12.267')`,
        [60, 29, 84, 17000.00]
      );

      // Payment 61 (11,000.00):
      // - 10,740.00 to Sale 84 (completes 7,180 + 17,000 + 10,740 = 34,920)
      // - 260.00 to Sale 85
      await tx.runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
         VALUES (?, ?, ?, 'invoice', ?, 'Allocated to Invoice #INV-000084', '2026-09-08 08:26:34.719')`,
        [61, 29, 84, 10740.00]
      );
      await tx.runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
         VALUES (?, ?, ?, 'invoice', ?, 'Allocated to Invoice #INV-000085', '2026-09-08 08:26:34.719')`,
        [61, 29, 85, 260.00]
      );

      // 5. Update sales paid_amount and pending_amount
      // Sale 82: 29,000 / 0 pending
      await tx.runQuery(`UPDATE sales SET paid_amount = 29000.00, pending_amount = 0.00 WHERE id = 82`);
      // Sale 83: 67,320 / 0 pending
      await tx.runQuery(`UPDATE sales SET paid_amount = 67320.00, pending_amount = 0.00 WHERE id = 83`);
      // Sale 84: 34,920 / 0 pending
      await tx.runQuery(`UPDATE sales SET paid_amount = 34920.00, pending_amount = 0.00 WHERE id = 84`);
      // Sale 85: 260 paid / 26,240.00 pending
      await tx.runQuery(`UPDATE sales SET paid_amount = 260.00, pending_amount = 26240.00 WHERE id = 85`);
    });

    console.log('\n=== AFTER CORRECTION ===');
    const ledgerAfter = await getCustomerLedger(29);
    console.log('Customer:', ledgerAfter.customer.name);
    console.log('Opening balance:', ledgerAfter.opening_balance);
    console.log('Closing balance:', ledgerAfter.closing_balance);
    console.log('Rows count:', ledgerAfter.rows.length);
    console.log('\nLedger rows:');
    for (const r of ledgerAfter.rows) {
      console.log(`${r.entry_date} | ${r.ref_no} | ${r.entry_type} | ${r.description} | Dr: ${r.debit} | Cr: ${r.credit} | Bal: ${r.running_balance} | Alloc: ${JSON.stringify(r.allocation_breakdown)}`);
    }
  } catch (err) {
    console.error('Error in correction:', err);
  } finally {
    await pool.end();
  }
}

applyCorrection();
