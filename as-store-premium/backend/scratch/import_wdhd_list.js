import fs from 'fs';
import path from 'path';
import XLSX from '../../frontend/node_modules/xlsx/xlsx.js';
import pg from '../../backend/node_modules/pg/lib/index.js';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

function convertSql(sql) {
  let index = 1;
  let converted = sql.replace(/\?/g, () => `$${index++}`);
  if (converted.trim().toUpperCase().startsWith('INSERT') && !converted.toUpperCase().includes('RETURNING')) {
    converted += ' RETURNING id';
  }
  return converted;
}

async function runImport() {
  console.log('----------------------------------------------------');
  console.log('🚀 IMPORTING USER EXCEL FILE WITH 200 TEST STOCK');
  console.log('----------------------------------------------------');

  const excelPath = 'c:/Users/laksh/Downloads/pinky-sales-main/WDHD+combo LIST.xlsx';
  if (!fs.existsSync(excelPath)) {
    console.error(`User Excel file not found at ${excelPath}`);
    process.exit(1);
  }

  // 1. Read Excel file
  const workbook = XLSX.readFile(excelPath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  console.log(`[Excel] Loaded ${rawRows.length} rows from file '${path.basename(excelPath)}'`);

  if (!rawRows.length) {
    console.error('Excel file has no rows.');
    process.exit(1);
  }

  // 2. Transform Rows into Standard AS Store Payload
  const records = rawRows.map((row, idx) => {
    return {
      short_name: String(row['main modle'] || '').trim(),
      brand: 'Universal',
      category: 'Display',
      full_model_list: String(row['WDHD+ LIST SUPER VERSION'] || '').trim(),
      quantity: 200, // 200 stock as requested for testing
      purchase_price: 0,
      wholesale_price: 0,
      retail_price: 0,
      colour: '',
      notes: 'Testing Import File',
      source_key: `WDHD-IMP-${idx}-${Date.now()}`
    };
  }).filter((r) => r.short_name);

  console.log(`[Transformed] Prepared ${records.length} valid product batch payloads.`);

  // 3. Ingest into Supabase/PostgreSQL Database
  const client = await pool.connect();
  let createdProductsCount = 0;
  let createdBatchesCount = 0;
  let totalQuantityAdded = 0;

  try {
    await client.query('BEGIN');

    // Get Superadmin user ID
    const superAdminRes = await client.query("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1");
    const userId = superAdminRes.rows[0]?.id || 1;

    // Get Shop ID (Warehouse or Main Shop)
    const shopRes = await client.query("SELECT id, name FROM shops LIMIT 1");
    const shopId = shopRes.rows[0]?.id || 1;
    const shopName = shopRes.rows[0]?.name || 'Main Shop';

    for (const item of records) {
      // Product lookup or creation
      const prodRes = await client.query(
        convertSql('SELECT id FROM products WHERE LOWER(TRIM(short_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1'),
        [item.short_name, item.short_name]
      );

      let productId;
      if (!prodRes.rows[0]) {
        const insRes = await client.query(
          convertSql(`INSERT INTO products (name, short_name, brand, category, full_model_list, purchase_price, wholesale_price, official_price, sale_price, description, colours)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
          [
            item.short_name,
            item.short_name,
            item.brand,
            item.category,
            item.full_model_list,
            item.purchase_price,
            item.wholesale_price,
            item.retail_price,
            item.retail_price,
            `Imported test item`,
            []
          ]
        );
        productId = insRes.rows[0].id;
        createdProductsCount++;
      } else {
        productId = prodRes.rows[0].id;
      }

      // Create FIFO Inventory Batch
      await client.query(
        convertSql(`INSERT INTO inventory_batches (
          shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
          colour, quantity_received, quantity_remaining, received_date, notes, source_key, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?, ?, ?)
        ON CONFLICT (source_key) DO NOTHING`),
        [
          shopId,
          productId,
          null,
          item.purchase_price,
          item.wholesale_price,
          item.retail_price,
          item.retail_price,
          null,
          item.quantity,
          item.quantity,
          item.notes,
          item.source_key,
          userId
        ]
      );

      // Sync stock quantity for this product
      const sumRes = await client.query(
        convertSql('SELECT COALESCE(SUM(quantity_remaining), 0) AS total FROM inventory_batches WHERE shop_id = ? AND product_id = ?'),
        [shopId, productId]
      );
      const totalQty = Number(sumRes.rows[0]?.total || 0);

      await client.query(
        convertSql('INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT (shop_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP'),
        [shopId, productId, totalQty]
      );

      createdBatchesCount++;
      totalQuantityAdded += item.quantity;
    }

    // Log Session Audit
    await client.query(
      convertSql(`INSERT INTO import_logs (
        file_name, imported_by, total_rows, created_products, total_quantity, total_valuation, destination_shop_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`),
      [
        'WDHD+combo LIST.xlsx',
        userId,
        records.length,
        createdProductsCount,
        totalQuantityAdded,
        0,
        shopId
      ]
    );

    await client.query('COMMIT');

    console.log('\n====================================================');
    console.log('✅ IMPORT SUCCESSFUL!');
    console.log('====================================================');
    console.log(`- File Name: WDHD+combo LIST.xlsx`);
    console.log(`- Destination Branch: ${shopName} (Shop #${shopId})`);
    console.log(`- Total Rows Processed: ${records.length}`);
    console.log(`- New Products Created: ${createdProductsCount}`);
    console.log(`- FIFO Batches Created: ${createdBatchesCount}`);
    console.log(`- Total Stock Added: ${totalQuantityAdded} pcs`);
    console.log('====================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ IMPORT FAILED:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runImport();
