import { allRecords, getRecord } from '../database.js';

async function runAudit() {
  console.log('=== 1. DIAGNOSTICS: CUSTOMER RECORDS ===');
  const customers = await allRecords("SELECT id, name, mobile FROM customers WHERE name ILIKE '%Neeraj%' OR id = 1");
  console.log(JSON.stringify(customers, null, 2));

  console.log('\n=== 2. DIAGNOSTICS: ALL SALES RECORDS ===');
  const sales = await allRecords(`
    SELECT sa.id, sa.customer_id, c.name AS customer_name, sa.product_id, p.name AS product_name,
           sa.quantity, sa.total_amount, sa.paid_amount, sa.pending_amount,
           sa.sale_date, sa.invoice_date, sa.due_date, sa.created_at
    FROM sales sa
    LEFT JOIN customers c ON c.id = sa.customer_id
    LEFT JOIN products p ON p.id = sa.product_id
    ORDER BY sa.id ASC
  `);
  console.log(JSON.stringify(sales, null, 2));

  console.log('\n=== 3. DIAGNOSTICS: ALL SALE_ITEMS RECORDS ===');
  const items = await allRecords("SELECT * FROM sale_items ORDER BY id ASC");
  console.log(JSON.stringify(items, null, 2));

  console.log('\n=== 4. DIAGNOSTICS: SALE_ITEMS COUNT PER SALE_ID ===');
  const itemsPerSale = await allRecords("SELECT sale_id, COUNT(*) as items_count FROM sale_items GROUP BY sale_id");
  console.log(JSON.stringify(itemsPerSale, null, 2));

  process.exit(0);
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
