import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const shops = await pool.query('SELECT id, name, location_type FROM shops');
    console.log("Shops in DB:", shops.rows);

    const products = await pool.query('SELECT id, name, brand, category, model FROM products');
    console.log("Products in DB:", products.rows);

    const batches = await pool.query('SELECT id, shop_id, product_id, quantity_received, quantity_remaining, colour, assigned_user_id FROM inventory_batches');
    console.log("Inventory Batches in DB:", batches.rows);

    const stock = await pool.query('SELECT id, shop_id, product_id, quantity FROM stock');
    console.log("Stock in DB:", stock.rows);
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    pool.end();
  }
}

check();
