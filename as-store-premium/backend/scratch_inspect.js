import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function convertSql(sql) {
  let index = 1;
  let converted = sql.replace(/\?/g, () => `$${index++}`);
  if (converted.trim().toUpperCase().startsWith('INSERT') && !converted.toUpperCase().includes('RETURNING') && !converted.toUpperCase().includes('SCHEMA_MIGRATIONS')) {
    converted += ' RETURNING id';
  }
  return converted;
}

const runQuery = async (sql, params = []) => {
  const pgSql = convertSql(sql);
  const res = await pool.query(pgSql, params);
  return { id: res.rows[0]?.id, rows: res.rows, rowCount: res.rowCount };
};

const getRecord = async (sql, params = []) => {
  const pgSql = convertSql(sql);
  const res = await pool.query(pgSql, params);
  return res.rows[0] || null;
};

const allRecords = async (sql, params = []) => {
  const pgSql = convertSql(sql);
  const res = await pool.query(pgSql, params);
  return res.rows;
};

async function run() {
  try {
    console.log('--- Inspecting shops ---');
    const shops = await allRecords('SELECT id, name, location_type FROM shops');
    console.log('Shops:', shops);

    console.log('--- Inspecting reference tables ---');
    const brands = await allRecords('SELECT id, name FROM brands LIMIT 5');
    console.log('Brands:', brands);
    const mfgBrands = await allRecords('SELECT id, name FROM manufacturing_brands LIMIT 5');
    console.log('Mfg Brands:', mfgBrands);
    const partCats = await allRecords('SELECT id, name FROM part_categories LIMIT 5');
    console.log('Part Categories:', partCats);

    console.log('--- Inspecting stock table columns and constraints ---');
    const stockCols = await pool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'stock'`);
    console.log('Stock cols:', stockCols.rows);
    const stockConstraints = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(c.oid) 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'stock'
    `);
    console.log('Stock constraints:', stockConstraints.rows);

    console.log('--- Inspecting inventory_batches table columns and constraints ---');
    const batchCols = await pool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'inventory_batches'`);
    console.log('Batch cols:', batchCols.rows);
    const batchConstraints = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(c.oid) 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'inventory_batches'
    `);
    console.log('Batch constraints:', batchConstraints.rows);

    console.log('--- Inspecting products columns and constraints ---');
    const productCols = await pool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'products'`);
    console.log('Product cols:', productCols.rows.map(r => `${r.column_name} (${r.data_type}, null:${r.is_nullable})`));

    console.log('--- Testing Product Insertion simulation ---');
    // Try a test transaction that rolls back
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log('Simulating insert product...');
      const insertSql = convertSql(`
        INSERT INTO products (
          name, short_name, full_model_list, brand, category, part_category, quality_variant, model, official_price,
          purchase_price, sale_price, wholesale_price, retail_price, description, colours,
          company_brand_id, manufacturing_brand_id, supplier_id, part_category_id, product_variant_id,
          image_url, image_urls, is_active, shop_id, branch_id, scope
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, 1, ?, ?, ?)
      `);
      const insertRes = await client.query(insertSql, [
        'Test Model Test Part', 'Test Short Name', 'Test Model Test Part', 'Apple', 'Display', 'Display', 'OLED', 'Test Model', 100,
        50, 100, 80, 100, 'Test Desc', ['Black'],
        brands[0]?.id || null, mfgBrands[0]?.id || null, null, partCats[0]?.id || null, null,
        null, JSON.stringify([]),
        null, null, 'GLOBAL'
      ]);
      const newProdId = insertRes.rows[0]?.id;
      console.log('Inserted test product id:', newProdId);

      // Now test stock insertion
      const targetShopId = shops[0]?.id;
      if (targetShopId) {
        console.log('Simulating stock insert for product', newProdId, 'in shop', targetShopId);
        const stockSql = convertSql('INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT(shop_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity');
        await client.query(stockSql, [targetShopId, newProdId, 10]);
        console.log('Stock insert succeeded');

        console.log('Simulating batch insert for product', newProdId);
        const batchSql = convertSql(`
          INSERT INTO inventory_batches (
            shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
            quantity_received, quantity_remaining, received_date, notes, created_by, manufacturing_brand_id, supplier_id
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, CURRENT_DATE, 'Initial product entry', ?, ?, ?)
        `);
        await client.query(batchSql, [
          targetShopId, newProdId,
          50, 80, 100, 100,
          10, 10, 1,
          mfgBrands[0]?.id || null, null
        ]);
        console.log('Batch insert succeeded');

        // Now test PUT /api/stock adjustment
        console.log('Simulating PUT /api/stock (add 5)...');
        const adjustBatchSql = convertSql(`
          INSERT INTO inventory_batches (
            shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
            colour, quantity_received, quantity_remaining, received_date, notes, created_by, manufacturing_brand_id, supplier_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        await client.query(adjustBatchSql, [
          targetShopId, newProdId, null,
          50, 80, 100, 100,
          null,
          5, 5, '2026-09-24', 'Stock quantity update', 1, mfgBrands[0]?.id || null,
          null
        ]);
        console.log('Adjust batch insert succeeded');

        // Sync stock
        const syncSql = convertSql(`
          INSERT INTO stock (shop_id, product_id, quantity)
          VALUES (?, ?, (
            SELECT COALESCE(SUM(quantity_remaining), 0)
            FROM inventory_batches
            WHERE shop_id = ? AND product_id = ?
          ))
          ON CONFLICT(shop_id, product_id)
          DO UPDATE SET quantity = EXCLUDED.quantity
        `);
        await client.query(syncSql, [targetShopId, newProdId, targetShopId, newProdId]);
        console.log('Stock sync succeeded');
      }

      await client.query('ROLLBACK');
      console.log('Test completed and rolled back successfully!');
    } catch (testErr) {
      await client.query('ROLLBACK');
      console.error('ERROR during test simulation:', testErr);
    } finally {
      client.release();
    }

  } catch (e) {
    console.error('Run failed:', e);
  } finally {
    await pool.end();
  }
}

run();
