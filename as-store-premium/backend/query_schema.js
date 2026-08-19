import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory_batches' ORDER BY ordinal_position")
  .then(res => {
    console.table(res.rows);
    pool.end();
  })
  .catch(err => {
    console.error(err);
    pool.end();
  });
