import pg from 'pg';
const { Pool } = pg;
const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const brand = 'Vivo';
    const shopScopes = [null, 1, 2];

    for (const shopId of shopScopes) {
      console.log(`\n=== SQL results for shopId = ${shopId} ===`);
      const joinClauses = [];
      const joinParams = [];

      if (shopId) {
        joinClauses.push('ib.shop_id = ?');
        joinParams.push(shopId);
      }
      // Assuming isShopStaffRole is false (superuser scope)
      const joinSql = joinClauses.length ? ` AND ${joinClauses.join(' AND ')}` : '';
      
      const sql = `
        SELECT p.id, p.short_name, p.brand, p.category, p.model,
          COALESCE(SUM(ib.quantity_remaining), 0) AS quantity
        FROM products p
        LEFT JOIN brands b ON b.id = p.company_brand_id
        LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
        LEFT JOIN inventory_batches ib ON ib.product_id = p.id ${joinSql.replace(/\?/g, '$' + (joinParams.length))}
        WHERE p.is_active = 1 AND LOWER(TRIM(p.brand)) = LOWER(TRIM($1))
        GROUP BY p.id, b.id, mb.id
        ORDER BY COALESCE(p.short_name, p.name)
      `;

      const params = [brand];
      if (shopId) params.push(shopId);

      const res = await pool.query(sql, params);
      console.log(`Returned ${res.rows.length} rows:`);
      console.log(res.rows);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
