import pg from 'pg';
const { Pool } = pg;
const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const shopScopes = [null, 1, 2];

    for (const shopId of shopScopes) {
      console.log(`\n=== SQL results for brands summary with shopId = ${shopId} ===`);
      const joinClauses = [];
      const joinParams = [];

      if (shopId) {
        joinClauses.push('ib.shop_id = ?');
        joinParams.push(shopId);
      }
      const joinSql = joinClauses.length ? ` AND ${joinClauses.join(' AND ')}` : '';
      
      const sql = `
        SELECT b.id, b.name AS brand,
          COUNT(DISTINCT p.id) AS product_count,
          COALESCE(SUM(ib.quantity_remaining), 0) AS quantity,
          COALESCE(SUM(ib.quantity_remaining * COALESCE(p.sale_price, p.retail_price, p.official_price, 0)), 0) AS stock_value,
          COUNT(DISTINCT p.id) FILTER (WHERE ib.quantity_remaining > 0 AND ib.quantity_remaining <= sh.low_stock_threshold) AS low_stock_products,
          MAX(ib.received_date) AS last_stocked_at
        FROM brands b
        LEFT JOIN products p ON LOWER(TRIM(p.brand)) = LOWER(TRIM(b.name)) AND p.is_active = 1
        LEFT JOIN inventory_batches ib ON ib.product_id = p.id ${joinSql.replace(/\?/g, '$' + (joinParams.length))}
        LEFT JOIN shops sh ON sh.id = ib.shop_id
        WHERE b.is_active = TRUE
        GROUP BY b.id, b.name
        ORDER BY b.name
      `;

      const params = [];
      if (shopId) params.push(shopId);

      const res = await pool.query(sql, params);
      console.log(`Returned ${res.rows.length} rows:`);
      console.log(res.rows.map(r => ({ brand: r.brand, count: r.product_count, qty: r.quantity, val: r.stock_value })));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
