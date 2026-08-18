import { runQuery, getRecord, allRecords } from '../database.js';

async function testProductIsolation() {
  console.log('Testing Branch-Specific Product & Catalog Isolation...');

  // 1. Get shops: warehouse and PS shop
  const warehouse = await getRecord("SELECT id FROM shops WHERE location_type = 'warehouse' LIMIT 1");
  const psShop = await getRecord("SELECT id, name FROM shops WHERE name ILIKE '%PS%' OR area ILIKE '%PS%' LIMIT 1") || (await allRecords("SELECT id, name FROM shops WHERE location_type != 'warehouse' LIMIT 1"))[0];

  console.log('Warehouse Shop ID:', warehouse?.id);
  console.log('Branch Shop:', psShop?.id, psShop?.name);

  // 2. Query products for warehouse scope
  const warehouseProducts = await allRecords(`
    SELECT id, name, short_name, brand, shop_id, scope 
    FROM products 
    WHERE is_active = 1 AND (shop_id IS NULL OR shop_id = ?)
  `, [warehouse.id]);

  console.log(`Warehouse Scope Product Count: ${warehouseProducts.length}`);
  const leakingBranchItems = warehouseProducts.filter(p => p.shop_id && p.shop_id !== warehouse.id);
  if (leakingBranchItems.length > 0) {
    console.error('FAIL: Leaking branch items found in warehouse scope:', leakingBranchItems);
  } else {
    console.log('PASS: No branch-specific items leaking into warehouse scope.');
  }

  // 3. Query products for PS branch scope
  const psBranchProducts = await allRecords(`
    SELECT id, name, short_name, brand, shop_id, scope 
    FROM products 
    WHERE is_active = 1 AND (shop_id IS NULL OR shop_id = ?)
  `, [psShop.id]);

  console.log(`Branch [${psShop.name}] Scope Product Count: ${psBranchProducts.length}`);
  const foreignBranchItems = psBranchProducts.filter(p => p.shop_id && p.shop_id !== psShop.id && p.shop_id !== warehouse.id);
  if (foreignBranchItems.length > 0) {
    console.error('FAIL: Foreign branch items found in PS branch scope:', foreignBranchItems);
  } else {
    console.log(`PASS: Branch [${psShop.name}] only sees global items + its own items.`);
  }

  process.exit(0);
}

testProductIsolation().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
