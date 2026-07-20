import pg from '../../backend/node_modules/pg/lib/index.js';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const resProducts = await pool.query('SELECT id, name, brand, category, is_active FROM products WHERE is_active = 1');
    console.log('Total Active Products:', resProducts.rows.length);
    console.log('Brands breakdown:');
    const brands = {};
    resProducts.rows.forEach(r => {
      brands[r.brand] = (brands[r.brand] || 0) + 1;
    });
    console.log(brands);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
