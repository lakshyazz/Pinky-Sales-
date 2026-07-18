import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function clearData() {
  try {
    console.log('Starting data wipe...');
    await pool.query(`
      TRUNCATE TABLE 
        stock,
        customers,
        sales,
        stock_transfers,
        stock_requests,
        audit_logs,
        categories,
        colours,
        brands,
        inventory_batches,
        sale_batch_allocations,
        products,
        other_product_categories,
        other_products,
        payments
      CASCADE;
    `);
    
    console.log('Successfully wiped all tables except users, shops, settings, and migrations.');
    process.exit(0);
  } catch (err) {
    console.error('Error wiping data:', err);
    process.exit(1);
  }
}

clearData();
