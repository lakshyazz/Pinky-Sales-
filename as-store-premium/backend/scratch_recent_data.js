import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('--- Last 5 products ---');
    const products = await pool.query('SELECT id, name, short_name, brand, model, part_category, official_price, purchase_price, sale_price, is_active, updated_at, shop_id, branch_id, scope, company_brand_id, manufacturing_brand_id, supplier_id, part_category_id, product_variant_id FROM products ORDER BY id DESC LIMIT 5');
    console.log(JSON.stringify(products.rows, null, 2));

    console.log('--- Last 5 audit logs ---');
    const audits = await pool.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 10');
    console.log(JSON.stringify(audits.rows, null, 2));

    console.log('--- Last 5 inventory batches ---');
    const batches = await pool.query('SELECT * FROM inventory_batches ORDER BY id DESC LIMIT 5');
    console.log(JSON.stringify(batches.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
