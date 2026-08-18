import { initDatabase, runQuery, getRecord, allRecords } from '../database.js';

async function runTests() {
  console.log('--- Starting Multi-Branch Supplier & Pricing Scoping Verification ---');
  await initDatabase();

  // 1. Check schema
  const cols = await allRecords("SELECT column_name FROM information_schema.columns WHERE table_name = 'suppliers'");
  const colNames = cols.map(c => c.column_name);
  console.log('Suppliers columns:', colNames);
  if (!colNames.includes('shop_id') || !colNames.includes('branch_id')) {
    throw new Error('shop_id or branch_id missing in suppliers table');
  }

  // 2. Ensure test shops exist
  let shopA = await getRecord("SELECT id FROM shops WHERE name = 'Shop A Test'");
  if (!shopA) {
    const resA = await runQuery("INSERT INTO shops (name, area, location_type) VALUES ('Shop A Test', 'Area A', 'branch')");
    shopA = { id: resA.id };
  }
  let shopB = await getRecord("SELECT id FROM shops WHERE name = 'Shop B Test'");
  if (!shopB) {
    const resB = await runQuery("INSERT INTO shops (name, area, location_type) VALUES ('Shop B Test', 'Area B', 'branch')");
    shopB = { id: resB.id };
  }

  console.log(`Test Shops: Shop A (${shopA.id}), Shop B (${shopB.id})`);

  // 3. Clean up test suppliers
  await runQuery("DELETE FROM suppliers WHERE name IN ('Global Supplier Test', 'Local Supplier Test A', 'Local Supplier Test B')");

  // 4. Create Global Supplier (Superadmin scope)
  const globalSup = await runQuery("INSERT INTO suppliers (name, shop_id, branch_id, is_active) VALUES ('Global Supplier Test', NULL, NULL, TRUE)");
  console.log('Created Superadmin Global Supplier:', globalSup.id);

  // 5. Create Branch A Supplier (Shop A scope)
  const supA = await runQuery("INSERT INTO suppliers (name, shop_id, branch_id, is_active) VALUES ('Local Supplier Test A', ?, ?, TRUE)", [shopA.id, shopA.id]);
  console.log('Created Shop A Supplier:', supA.id);

  // 6. Create Branch B Supplier (Shop B scope)
  const supB = await runQuery("INSERT INTO suppliers (name, shop_id, branch_id, is_active) VALUES ('Local Supplier Test B', ?, ?, TRUE)", [shopB.id, shopB.id]);
  console.log('Created Shop B Supplier:', supB.id);

  // 7. Verify Compound Unique Constraint (Same supplier name in different branches)
  const sameNameA = await runQuery("INSERT INTO suppliers (name, shop_id, branch_id, is_active) VALUES ('Shared Name Vendor', ?, ?, TRUE)", [shopA.id, shopA.id]);
  const sameNameB = await runQuery("INSERT INTO suppliers (name, shop_id, branch_id, is_active) VALUES ('Shared Name Vendor', ?, ?, TRUE)", [shopB.id, shopB.id]);
  console.log('Compound unique constraint test passed! Same vendor name created in Shop A and Shop B independently without conflict.');

  // 8. Test Data Isolation Queries
  // Superadmin view:
  const superadminList = await allRecords("SELECT id, name FROM suppliers WHERE shop_id IS NULL AND is_active = TRUE ORDER BY id");
  const superadminHasLocalA = superadminList.some(s => s.name === 'Local Supplier Test A');
  const superadminHasGlobal = superadminList.some(s => s.name === 'Global Supplier Test');
  console.log('Superadmin Supplier Query: Has Global?', superadminHasGlobal, '| Has Shop A local?', superadminHasLocalA);
  if (superadminHasLocalA || !superadminHasGlobal) {
    throw new Error('Superadmin supplier scoping failed');
  }

  // Shop A view:
  const shopAList = await allRecords("SELECT id, name FROM suppliers WHERE shop_id = ? AND is_active = TRUE ORDER BY id", [shopA.id]);
  const shopAHasLocalA = shopAList.some(s => s.name === 'Local Supplier Test A');
  const shopAHasLocalB = shopAList.some(s => s.name === 'Local Supplier Test B');
  const shopAHasGlobal = shopAList.some(s => s.name === 'Global Supplier Test');
  console.log('Shop A Supplier Query: Has Local A?', shopAHasLocalA, '| Has Local B?', shopAHasLocalB, '| Has Global?', shopAHasGlobal);
  if (!shopAHasLocalA || shopAHasLocalB || shopAHasGlobal) {
    throw new Error('Shop A data isolation failed');
  }

  // Shop B view:
  const shopBList = await allRecords("SELECT id, name FROM suppliers WHERE shop_id = ? AND is_active = TRUE ORDER BY id", [shopB.id]);
  const shopBHasLocalB = shopBList.some(s => s.name === 'Local Supplier Test B');
  const shopBHasLocalA = shopBList.some(s => s.name === 'Local Supplier Test A');
  const shopBHasGlobal = shopBList.some(s => s.name === 'Global Supplier Test');
  console.log('Shop B Supplier Query: Has Local B?', shopBHasLocalB, '| Has Local A?', shopBHasLocalA, '| Has Global?', shopBHasGlobal);
  if (!shopBHasLocalB || shopBHasLocalA || shopBHasGlobal) {
    throw new Error('Shop B data isolation failed');
  }

  // Clean up
  await runQuery("DELETE FROM suppliers WHERE name IN ('Global Supplier Test', 'Local Supplier Test A', 'Local Supplier Test B', 'Shared Name Vendor')");
  await runQuery("DELETE FROM shops WHERE name IN ('Shop A Test', 'Shop B Test')");

  console.log('--- All Multi-Branch Supplier Isolation & Constraint Tests PASSED! ---');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
