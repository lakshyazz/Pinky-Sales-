const { pool, getWarehouse } = require('./server');

async function testStockAndProduct() {
  console.log('Testing Product Creation and Stock Adjustment...');

  // 1. Get warehouse or branch
  const warehouse = await getWarehouse();
  console.log('Found warehouse:', warehouse?.id, warehouse?.name);

  // 2. Test inserting a unique test product
  const testBarcode = 'TEST-PROD-' + Date.now();
  const testName = 'Test Product ' + Date.now();
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Simulate what POST /api/products does
    const insertRes = await client.query(
      `INSERT INTO products (
        name, barcode, category, brand, model, retail_price, wholesale_price, purchase_price, stock_quantity, shop_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [testName, testBarcode, 'Testing', 'TestBrand', 'TestModel', 500, 450, 400, 10, warehouse.id]
    );
    const product = insertRes.rows[0];
    console.log('✔ Product created successfully:', product.id, product.name);

    // Simulate stock adjustment (adding stock)
    const stockRow = await client.query(
      `INSERT INTO stock (product_id, shop_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, shop_id)
       DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity
       RETURNING *`,
      [product.id, warehouse.id, 5]
    );
    console.log('✔ Stock adjusted successfully. New stock quantity:', stockRow.rows[0].quantity);

    // Clean up test data
    await client.query('DELETE FROM stock WHERE product_id = $1', [product.id]);
    await client.query('DELETE FROM products WHERE id = $1', [product.id]);
    await client.query('COMMIT');
    console.log('✔ Cleaned up test product.');
    console.log('ALL CHECKS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

testStockAndProduct();
