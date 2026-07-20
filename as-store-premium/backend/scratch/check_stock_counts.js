import pg from '../../backend/node_modules/pg/lib/index.js';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const stockRes = await pool.query('SELECT COUNT(*) FROM stock');
    const batchRes = await pool.query('SELECT COUNT(*) FROM inventory_batches');
    console.log(`stock table count: ${stockRes.rows[0].count}`);
    console.log(`inventory_batches table count: ${batchRes.rows[0].count}`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
