import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: './as-store-premium/backend/.env' });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const res = await pool.query('SELECT id, name, is_active FROM manufacturing_brands ORDER BY id');
    console.log("Manufacturing Brands in DB:", res.rows);
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    pool.end();
  }
}

check();
