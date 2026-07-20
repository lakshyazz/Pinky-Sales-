import pg from '../../backend/node_modules/pg/lib/index.js';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resBatches = await client.query('DELETE FROM inventory_batches');
    console.log(`Deleted ${resBatches.rowCount} rows from inventory_batches`);

    const resStock = await client.query('DELETE FROM stock');
    console.log(`Deleted ${resStock.rowCount} rows from stock`);

    const resProducts = await client.query('DELETE FROM products');
    console.log(`Deleted ${resProducts.rowCount} rows from products`);

    await client.query('COMMIT');
    console.log('SUCCESS: All test stock and model data wiped successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Wipe failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
