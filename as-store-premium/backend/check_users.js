import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const res = await pool.query('SELECT id, username, role, name FROM users');
    console.log("Users in DB:", res.rows);
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    pool.end();
  }
}

check();
