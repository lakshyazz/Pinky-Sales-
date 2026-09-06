import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'schema_migrations'`);
    console.log('Columns in schema_migrations:', cols.rows.map(r => r.column_name));
    const migs = await pool.query(`SELECT * FROM schema_migrations`);
    console.log('Migrations:', migs.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
