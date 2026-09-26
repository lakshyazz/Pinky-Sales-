import 'dotenv/config';
import { runQuery, getRecord, allRecords, pool } from '../database.js';

async function inspect() {
  try {
    const cust = await allRecords("SELECT id, name, mobile, opening_balance, current_balance FROM customers WHERE name ILIKE '%jaysankar%' OR mobile = '8401110101'");
    console.log('CUSTOMERS:', JSON.stringify(cust, null, 2));

    const sales = await allRecords("SELECT id, invoice_number, customer_id, total_amount, paid_amount, pending_amount, current_invoice_total FROM sales WHERE invoice_number = 'INV-000033' OR customer_id IN (SELECT id FROM customers WHERE name ILIKE '%jaysankar%')");
    console.log('SALES:', JSON.stringify(sales, null, 2));

    const payments = await allRecords("SELECT * FROM payments WHERE amount = 19250 OR customer_id IN (SELECT id FROM customers WHERE name ILIKE '%jaysankar%') ORDER BY id ASC");
    console.log('PAYMENTS:', JSON.stringify(payments, null, 2));

    const paymentIds = payments.map(p => p.id);
    if (paymentIds.length > 0) {
      const allocs = await allRecords(`SELECT * FROM payment_allocations WHERE payment_id IN (${paymentIds.join(',')})`);
      console.log('ALLOCATIONS for these payments:', JSON.stringify(allocs, null, 2));
    }

    const saleIds = sales.map(s => s.id);
    if (saleIds.length > 0) {
      const saleAllocs = await allRecords(`SELECT * FROM payment_allocations WHERE sale_id IN (${saleIds.join(',')})`);
      console.log('ALLOCATIONS for these sales:', JSON.stringify(saleAllocs, null, 2));
    }
  } catch (err) {
    console.error('Inspection error:', err);
  } finally {
    await pool.end();
  }
}

inspect();
