import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: './as-store-premium/backend/.env' });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query("DELETE FROM schema_migrations WHERE name = '025_add_suppliers.sql'");
    console.log("Deleted migration record from schema_migrations:", res.rowCount);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    pool.end();
  }
}

run();
