const { allRecords } = require('../db');

async function check() {
  const customers = await allRecords(`
    SELECT c.id, c.name, c.opening_balance,
      (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id) AS sales_by_id,
      (SELECT COUNT(*) FROM sales s WHERE s.mobile = c.mobile) AS sales_by_mobile,
      (SELECT COUNT(*) FROM sales s WHERE LOWER(s.customer_name) = LOWER(c.name)) AS sales_by_name
    FROM customers c
    LIMIT 20
  `);
  console.log(JSON.stringify(customers, null, 2));
  process.exit(0);
}

check().catch(console.error);
