import pg from '../../backend/node_modules/pg/lib/index.js';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const resProducts = await pool.query('SELECT COUNT(*) FROM products');
    const resBatches = await pool.query('SELECT COUNT(*) FROM inventory_batches');
    const resStock = await pool.query('SELECT COUNT(*) FROM stock');
    const resLogs = await pool.query('SELECT COUNT(*) FROM import_logs');
    
    console.log('Products:', resProducts.rows[0].count);
    console.log('Inventory Batches:', resBatches.rows[0].count);
    console.log('Stock Rows:', resStock.rows[0].count);
    console.log('Import Logs Rows:', resLogs.rows[0].count);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
