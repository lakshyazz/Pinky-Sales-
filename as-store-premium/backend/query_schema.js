import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'products'")
  .then(res => {
    console.table(res.rows);
    pool.end();
  })
  .catch(err => {
    console.error(err);
    pool.end();
  });
