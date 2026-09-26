import { allRecords, getRecord } from '../database.js';

async function check() {
  console.log('--- Searching for customer jagdishbhai ---');
  const customers = await allRecords("SELECT id, name, phone, email, address, opening_balance, current_balance, shop_id FROM customers WHERE LOWER(name) LIKE '%jagdish%'");
  console.log('Customers found:', customers);

  for (const c of customers) {
    console.log(`\n================ CUSTOMER ${c.id}: ${c.name} (shop_id: ${c.shop_id}) ================`);
    console.log(`Opening balance in DB: ${c.opening_balance}, Current balance in DB: ${c.current_balance}`);

    // Sales
    const sales = await allRecords(`
      SELECT id, invoice_number, sale_date, total_amount, current_invoice_total, paid_amount, status, payment_mode, notes, created_at
      FROM sales 
      WHERE customer_id = ?
      ORDER BY sale_date ASC, id ASC
    `, [c.id]);
    console.log(`\nSales (${sales.length}):`);
    sales.forEach(s => console.log(s));

    // Payments
    const payments = await allRecords(`
      SELECT id, sale_id, payment_date, amount, payment_mode, reference_number, notes, created_at
      FROM payments
      WHERE customer_id = ?
      ORDER BY payment_date ASC, id ASC
    `, [c.id]);
    console.log(`\nPayments (${payments.length}):`);
    payments.forEach(p => console.log(p));

    // Credit notes
    const creditNotes = await allRecords(`
      SELECT id, note_number, return_id, original_sale_id, issue_date, total_amount, balance_amount, status, notes, created_at
      FROM credit_notes
      WHERE customer_id = ?
      ORDER BY issue_date ASC, id ASC
    `, [c.id]);
    console.log(`\nCredit Notes (${creditNotes.length}):`);
    creditNotes.forEach(cn => console.log(cn));

    // Sales returns
    const returns = await allRecords(`
      SELECT id, return_number, sale_id, return_date, refund_amount, status, reason, created_at
      FROM sales_returns
      WHERE customer_id = ?
      ORDER BY return_date ASC, id ASC
    `, [c.id]);
    console.log(`\nSales Returns (${returns.length}):`);
    returns.forEach(r => console.log(r));

    // Credit note redemptions
    const redemptions = await allRecords(`
      SELECT cnr.* 
      FROM credit_note_redemptions cnr
      JOIN credit_notes cn ON cn.id = cnr.credit_note_id
      WHERE cn.customer_id = ?
    `, [c.id]);
    console.log(`\nCredit Note Redemptions (${redemptions.length}):`);
    redemptions.forEach(r => console.log(r));
  }

  process.exit(0);
}

check().catch(err => {
  console.error('Error running check:', err);
  process.exit(1);
});
