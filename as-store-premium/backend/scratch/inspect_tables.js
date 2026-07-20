import pg from '../../backend/node_modules/pg/lib/index.js';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const tables = ['stock', 'inventory_batches', 'products', 'sales', 'sale_items', 'requests', 'audit_logs'];
    for (const t of tables) {
      try {
        const res = await pool.query(`SELECT COUNT(*) FROM ${t}`);
        console.log(`${t}: ${res.rows[0].count}`);
      } catch (err) {
        console.log(`${t}: error (${err.message})`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
