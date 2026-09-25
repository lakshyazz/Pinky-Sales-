import { allRecords } from '../database.js';

async function check() {
  const salesCount = await allRecords(`
    SELECT c.id, c.name, COUNT(s.id) AS sales_count, SUM(COALESCE(NULLIF(s.current_invoice_total, 0), s.total_amount)) AS total_amount
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
    GROUP BY c.id, c.name
    HAVING COUNT(s.id) > 0
    ORDER BY COUNT(s.id) DESC
    LIMIT 10
  `);
  console.log('Customers with sales:', salesCount);

  // Check MADHAV SALES specifically
  const madhav = await allRecords("SELECT id, name FROM customers WHERE LOWER(name) LIKE '%madhav%'");
  console.log('Madhav sales:', madhav);
  if (madhav.length > 0) {
    const s = await allRecords('SELECT id, invoice_number, total_amount, current_invoice_total, shop_id FROM sales WHERE customer_id = ?', [madhav[0].id]);
    console.log('Sales for Madhav:', s);
  }

  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
