import 'dotenv/config';
import { pool, allRecords, getRecord, runQuery, runTransaction } from '../database.js';
import { getCustomerLedger, getCustomerTotalOutstanding } from '../ledgerEngine.js';

const money = (val) => Math.round(Number(val || 0) * 100) / 100;
const fmt = (val) => '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fixJagdishAccounting() {
  console.log('================================================================');
  console.log('   FIXING CUSTOMER 15 (JAGDISHBHAI) ACCOUNTING & LEDGER');
  console.log('================================================================\n');

  try {
    await runTransaction(async (tx) => {
      // 1. Check if cash payment for Invoice 36 exists in payments table
      const existingPay36 = await tx.getRecord(
        `SELECT id FROM payments WHERE customer_id = 15 AND sale_id = 36 LIMIT 1`
      );

      let pay36Id = existingPay36?.id;
      if (!pay36Id) {
        console.log('1. Inserting missing cash payment record for Invoice #INV-000036 (₹1,000.00)...');
        const pNumRow = await tx.getRecord(`SELECT 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0') AS num`);
        const insPay = await tx.runQuery(
          `INSERT INTO payments (payment_number, customer_id, sale_id, amount, payment_date, payment_mode, note, shop_id, created_at)
           VALUES (?, 15, 36, 1000.00, '2026-08-29', 'cash', 'Cash payment at checkout for INV-000036', 2, '2026-08-30 09:44:06')`,
          [pNumRow.num]
        );
        pay36Id = insPay.id;
        console.log(`   ✔ Created payment record: ${pNumRow.num} (ID: ${pay36Id})`);
      } else {
        console.log(`1. Payment record for Invoice #INV-000036 already exists (ID: ${pay36Id})`);
      }

      // 2. Clear corrupted payment allocations for customer 15
      console.log('2. Resetting and fixing payment allocations for Customer 15...');
      await tx.runQuery(
        `DELETE FROM payment_allocations WHERE customer_id = 15`
      );

      // 3. Define the exact clean 1-to-1 invoice-to-payment mappings
      const cleanAllocations = [
        { saleId: 36,  invoiceNum: 'INV-000036', amount: 1000.00,   payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND sale_id = 36 ORDER BY id ASC LIMIT 1` },
        { saleId: 100, invoiceNum: 'INV-000100', amount: 4300.00,   payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id = 21` },
        { saleId: 101, invoiceNum: 'INV-000101', amount: 11550.00,  payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id = 22` },
        { saleId: 161, invoiceNum: 'INV-000161', amount: 4080.00,   payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id = 68` },
        { saleId: 162, invoiceNum: 'INV-000162', amount: 126630.00, payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id = 69` },
        { saleId: 163, invoiceNum: 'INV-000163', amount: 5900.00,   payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id = 70` },
        { saleId: 164, invoiceNum: 'INV-000164', amount: 13600.00,  payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id = 71` },
        { saleId: 165, invoiceNum: 'INV-000165', amount: 16800.00,  payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id = 72` },
        { saleId: 166, invoiceNum: 'INV-000166', amount: 14000.00,  payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id = 73` },
        { saleId: 168, invoiceNum: 'INV-000168', amount: 4550.00,   payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id = 74` },
        { saleId: 183, invoiceNum: 'INV-000183', amount: 6880.00,   payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id IN (99, 100) ORDER BY id ASC LIMIT 1` },
        { saleId: 207, invoiceNum: 'INV-000207', amount: 1330.00,   payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id IN (131, 133) ORDER BY id ASC LIMIT 1` },
        { saleId: 262, invoiceNum: 'INV-000262', amount: 13450.00,  payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id IN (232, 234) ORDER BY id ASC LIMIT 1` },
        { saleId: 290, invoiceNum: 'INV-000290', amount: 5800.00,   payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id IN (270, 278) ORDER BY id ASC LIMIT 1` },
        { saleId: 367, invoiceNum: 'INV-000367', amount: 54950.00,  payQuery: `SELECT id FROM payments WHERE customer_id = 15 AND id IN (360, 394) ORDER BY id ASC LIMIT 1` },
      ];

      for (const item of cleanAllocations) {
        const pRow = await tx.getRecord(item.payQuery);
        if (!pRow) {
          throw new Error(`Could not find payment record for ${item.invoiceNum} (amount: ${item.amount})`);
        }
        await tx.runQuery(
          `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
           VALUES (?, 15, ?, 'invoice', ?, ?, CURRENT_TIMESTAMP)`,
          [pRow.id, item.saleId, item.amount, `Full settlement for ${item.invoiceNum}`]
        );
      }
      console.log('   ✔ All 15 invoices cleanly allocated 1-to-1!');

      // 4. Fix Invoice 367 status and paid_amount
      console.log('4. Restoring Invoice #INV-000367 to 100% Paid (pending: ₹0.00)...');
      await tx.runQuery(
        `UPDATE sales 
         SET paid_amount = 54950.00,
             pending_amount = 0.00,
             status = 'paid'
         WHERE id = 367`
      );

      // 5. Fix carry-forward previous_balance on subsequent invoices
      console.log('5. Correcting carry-forward previous balance on subsequent invoices...');
      // INV-000399 was ₹9,220 with no previous balance (since 367 was fully paid)
      await tx.runQuery(
        `UPDATE sales 
         SET previous_balance = 0.00,
             net_payable_amount = 9220.00,
             closing_balance = 9220.00
         WHERE id = 399`
      );

      // INV-000424 carries forward only INV-000399 (₹9,220) + itself (₹3,050) = ₹12,270
      await tx.runQuery(
        `UPDATE sales 
         SET previous_balance = 9220.00,
             net_payable_amount = 12270.00,
             closing_balance = 12270.00
         WHERE id = 424`
      );

      // INV-000461 carries forward ₹12,270 + itself (₹32,700) = ₹44,970
      await tx.runQuery(
        `UPDATE sales 
         SET previous_balance = 12270.00,
             net_payable_amount = 44970.00,
             closing_balance = 44970.00
         WHERE id = 461`
      );

      // 6. Update customer balance to true canonical balance
      console.log('6. Updating customers.current_balance to ₹44,970.00...');
      await tx.runQuery(
        `UPDATE customers 
         SET opening_balance = 0.00,
             current_balance = 44970.00,
             advance_balance = 0.00
         WHERE id = 15`
      );

      // 7. Synchronize current_balance dynamically
      await tx.runQuery(`
        UPDATE customers c
        SET current_balance = (
          COALESCE(c.opening_balance, 0)
          + COALESCE((SELECT SUM(COALESCE(NULLIF(s.current_invoice_total, 0), s.total_amount)) FROM sales s WHERE s.customer_id = c.id), 0)
          - COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.customer_id = c.id AND pm.reversed_at IS NULL AND COALESCE(pm.payment_mode, '') != 'credit_note'), 0)
          - COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn WHERE cn.customer_id = c.id AND cn.status != 'cancelled'), 0)
        )
        WHERE c.id = 15
      `);
    });

    console.log('\n✔ Database transaction committed successfully!\n');

    // 8. Verify with ledgerEngine
    console.log('================================================================');
    console.log('VERIFYING ACCOUNTING ENGINE & LEDGER AFTER REPAIR:');
    console.log('================================================================');
    const dynamicTotal = await getCustomerTotalOutstanding(15);
    const ledger = await getCustomerLedger(15);

    console.log(`Customer:              JAGDISHBHAI (ID 15)`);
    console.log(`Opening Balance:       ${fmt(dynamicTotal.opening_balance)}`);
    console.log(`Total Invoiced:        ${fmt(dynamicTotal.total_invoiced)}`);
    console.log(`Total Paid:            ${fmt(dynamicTotal.total_paid)}`);
    console.log(`Invoices Pending:      ${fmt(dynamicTotal.invoices_pending)}`);
    console.log(`Dynamic Outstanding:   ${fmt(dynamicTotal.total_outstanding)}`);
    console.log(`Ledger Closing Bal:    ${fmt(ledger.closing_balance)}`);

    const matches = (dynamicTotal.total_outstanding === 44970 && Number(ledger.closing_balance) === 44970);
    if (matches) {
      console.log('\n✅ 100% RECONCILED! Customer Jagdishbhai accounting is now completely accurate:');
      console.log('   - Invoice #INV-000367 is 100% PAID (₹0.00 pending).');
      console.log('   - Only the 3 recent open invoices remain due:');
      console.log('       1. #INV-000399: ₹9,220.00');
      console.log('       2. #INV-000424: ₹3,050.00');
      console.log('       3. #INV-000461: ₹32,700.00');
      console.log('       Total Due:      ₹44,970.00 (was incorrectly showing ₹45,970.00)');
    } else {
      console.log('\n⚠️ Warning: Values did not reach exact 44,970 target.');
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('Error fixing customer 15 accounting:', err);
  } finally {
    await pool.end();
  }
}

fixJagdishAccounting();
