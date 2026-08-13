import pg from 'pg';
const { Pool } = pg;
const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log("=== Brands table ===");
    const res = await pool.query('SELECT * FROM brands');
    console.log(res.rows);

    console.log("\n=== Unique product brands in products table ===");
    const pBrands = await pool.query('SELECT DISTINCT brand FROM products WHERE is_active = 1');
    console.log(pBrands.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
