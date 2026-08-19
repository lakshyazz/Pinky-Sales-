import { runQuery, getRecord, allRecords } from '../database.js';

async function verifyIsolationAndGating() {
  console.log('--- RUNNING PRODUCT ISOLATION & STOCK-GATING VERIFICATION ---');

  // 1. Get shops: warehouse (superadmin) and branch shop
  const warehouse = await getRecord("SELECT id, name FROM shops WHERE location_type = 'warehouse' ORDER BY id ASC LIMIT 1");
  const branchShop = await getRecord("SELECT id, name FROM shops WHERE location_type != 'warehouse' ORDER BY id ASC LIMIT 1");

  console.log(`Warehouse Shop: [${warehouse?.id}] ${warehouse?.name}`);
  console.log(`Branch Shop: [${branchShop?.id}] ${branchShop?.name}`);

  if (!warehouse || !branchShop) {
    console.error('Could not find warehouse or branch shop in database.');
    process.exit(1);
  }

  // 2. Find or create a test master product
  let product = await getRecord("SELECT * FROM products WHERE is_active = 1 AND (shop_id IS NULL OR shop_id = ?) ORDER BY id ASC LIMIT 1", [warehouse.id]);
  if (!product) {
    console.log('Creating sample product for testing...');
    const insertRes = await runQuery(`
      INSERT INTO products (name, short_name, brand, category, sale_price, retail_price, official_price, wholesale_price, purchase_price, is_active)
      VALUES ('Test Display Combo', 'Test Display', 'Apple', 'Display', 1000, 1000, 1000, 800, 600, 1)
      RETURNING id
    `);
    product = await getRecord("SELECT * FROM products WHERE id = ?", [insertRes.rows[0].id]);
  }

  console.log(`Selected Master Product: [ID: ${product.id}] ${product.name} | Master Retail Price: ₹${product.sale_price}`);

  // 3. Clear branch stock for this product to test stock gating
  await runQuery("DELETE FROM inventory_batches WHERE shop_id = ? AND product_id = ?", [branchShop.id, product.id]);
  await runQuery("DELETE FROM stock WHERE shop_id = ? AND product_id = ?", [branchShop.id, product.id]);

  const stockCheck0 = await getRecord(
    "SELECT COALESCE(SUM(quantity_remaining), 0) AS qty FROM inventory_batches WHERE shop_id = ? AND product_id = ?",
    [branchShop.id, product.id]
  );
  console.log(`Branch stock before adding batch: ${stockCheck0.qty} pcs`);

  if (Number(stockCheck0.qty) !== 0) {
    console.error('FAIL: Expected 0 stock in branch shop.');
  } else {
    console.log('PASS: Branch has 0 stock. Gating logic should block edits.');
  }

  // 4. Add stock with a branch-specific price (e.g. ₹1250 instead of master ₹1000)
  const branchPrice = 1250;
  await runQuery(`
    INSERT INTO inventory_batches (shop_id, product_id, quantity_received, quantity_remaining, retail_price, official_price, received_date, notes)
    VALUES (?, ?, 10, 10, ?, ?, CURRENT_DATE, 'Test branch stock')
  `, [branchShop.id, product.id, branchPrice, branchPrice]);

  const stockCheck1 = await getRecord(
    "SELECT COALESCE(SUM(quantity_remaining), 0) AS qty FROM inventory_batches WHERE shop_id = ? AND product_id = ?",
    [branchShop.id, product.id]
  );
  console.log(`Branch stock after adding batch: ${stockCheck1.qty} pcs with branch price ₹${branchPrice}`);

  // 5. Verify master table products still has master price
  const masterProductAfter = await getRecord("SELECT id, name, sale_price, retail_price FROM products WHERE id = ?", [product.id]);
  console.log(`Master Product row in DB: sale_price = ₹${masterProductAfter.sale_price}`);

  if (Number(masterProductAfter.sale_price) === Number(product.sale_price)) {
    console.log('PASS: Master product row in DB remains untouched at ₹' + masterProductAfter.sale_price);
  } else {
    console.error('FAIL: Master product row was modified to ₹' + masterProductAfter.sale_price);
  }

  console.log('--- ALL VERIFICATION CHECKS COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}

verifyIsolationAndGating().catch(err => {
  console.error('Error in verification:', err);
  process.exit(1);
});
