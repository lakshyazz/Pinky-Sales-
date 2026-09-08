import { allRecords, getRecord, pool } from '../database.js';

async function inspect() {
  try {
    const customer = await getRecord(`SELECT * FROM customers WHERE id = 29`);
    console.log('Customer:', JSON.stringify(customer, null, 2));

    if (customer) {
      const sales = await allRecords(`SELECT id, invoice_number, sale_date, invoice_date, total_amount, paid_amount, pending_amount FROM sales WHERE customer_id = ? ORDER BY id ASC`, [customer.id]);
      console.log('\nSales:', JSON.stringify(sales, null, 2));

      const payments = await allRecords(`SELECT * FROM payments WHERE customer_id = ? ORDER BY payment_date ASC`, [customer.id]);
      console.log('\nPayments:', JSON.stringify(payments, null, 2));

      const allocations = await allRecords(`SELECT * FROM payment_allocations WHERE customer_id = ? ORDER BY id ASC`, [customer.id]);
      console.log('\nPayment Allocations:', JSON.stringify(allocations, null, 2));

      const ledgerEntries = await allRecords(`SELECT * FROM ledger_entries WHERE customer_id = ? ORDER BY id ASC`, [customer.id]);
      console.log('\nLedger Entries:', JSON.stringify(ledgerEntries, null, 2));
    }
  } catch (err) {
    console.error('Error inspecting:', err);
  } finally {
    await pool.end();
  }
}

inspect();
