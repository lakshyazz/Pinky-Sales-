import fs from 'fs';
import path from 'path';
import XLSX from './frontend/node_modules/xlsx/xlsx.js';
import dotenv from './backend/node_modules/dotenv/lib/main.js';
import pg from './backend/node_modules/pg/lib/index.js';

dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is missing in backend/.env');
  process.exit(1);
}

const pool = new Pool({
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

const TARGET_FIELDS = [
  { key: 'short_name', aliases: ['product name', 'item description', 'particulars', 'item name', 'model', 'product', 'name', 'item', 'description', 'goods', 'material'] },
  { key: 'brand', aliases: ['brand', 'brand name', 'make', 'manufacturer', 'company'] },
  { key: 'category', aliases: ['category', 'product type', 'group', 'type', 'cat', 'dept', 'department'] },
  { key: 'full_model_list', aliases: ['compatible models', 'fits models', 'model list', 'supported devices', 'compatibility', 'models'] },
  { key: 'quantity', aliases: ['qty', 'quantity', 'pcs', 'pieces', 'stock', 'count', 'balance', 'in stock', 'available qty'] },
  { key: 'purchase_price', aliases: ['purchase price', 'cost price', 'unit cost', 'cp', 'cost', 'buy price', 'rate', 'purchase rate'] },
  { key: 'wholesale_price', aliases: ['wholesale price', 'trade price', 'dealer price', 'wp', 'wholesale'] },
  { key: 'retail_price', aliases: ['retail price', 'sale price', 'selling price', 'mrp', 'sp', 'retail', 'list price'] },
  { key: 'colour', aliases: ['colour', 'color', 'variant', 'shade'] },
  { key: 'notes', aliases: ['notes', 'remarks', 'invoice', 'vendor', 'supplier', 'invoice no'] },
];

async function runTestImport() {
  console.log('----------------------------------------------------');
  console.log('🚀 TESTING SUPPLIER INVENTORY EXCEL IMPORT INGESTION');
  console.log('----------------------------------------------------');

  const excelPath = path.resolve(process.cwd(), 'sample_supplier_inventory.xlsx');
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Sample Excel file not found at ${excelPath}`);
  }

  // 1. Read Excel file
  const workbook = XLSX.readFile(excelPath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  console.log(`[Excel] Loaded ${rawRows.length} rows from file '${path.basename(excelPath)}'`);

  if (!rawRows.length) {
    throw new Error('Excel file has no rows.');
  }

  // 2. Perform Fuzzy Auto-Detection
  const rawHeaders = Object.keys(rawRows[0]);
  const lowerHeaders = rawHeaders.map((h) => String(h).trim().toLowerCase());
  const fieldMapping = {};

  TARGET_FIELDS.forEach((field) => {
    for (const alias of field.aliases) {
      const idx = lowerHeaders.findIndex((h) => h === alias || h.includes(alias));
      if (idx !== -1) {
        fieldMapping[field.key] = rawHeaders[idx];
        break;
      }
    }
  });

  console.log('[AutoMatcher] Detected Column Mappings:');
  console.table(fieldMapping);

  // 3. Transform Rows into Standard AS Store Payload
  const records = rawRows.map((row, idx) => {
    const getVal = (key) => {
      const header = fieldMapping[key];
      return header ? row[header] : '';
    };

    return {
      short_name: String(getVal('short_name') || '').trim(),
      brand: String(getVal('brand') || 'Generic').trim(),
      category: String(getVal('category') || 'General').trim(),
      full_model_list: String(getVal('full_model_list') || '').trim(),
      quantity: Math.max(1, Number(getVal('quantity') || 1)),
      purchase_price: Number(getVal('purchase_price') || 0),
      wholesale_price: Number(getVal('wholesale_price') || 0),
      retail_price: Number(getVal('retail_price') || 0),
      colour: String(getVal('colour') || '').trim(),
      notes: String(getVal('notes') || '').trim(),
      source_key: `TEST-IMP-${Date.now()}-${idx}`
    };
  }).filter((r) => r.short_name);

  console.log(`[Transformed] Prepared ${records.length} valid product batch payloads.`);

  // 4. Ingest into Supabase/PostgreSQL Database
  const client = await pool.connect();
  let createdProductsCount = 0;
  let createdBatchesCount = 0;
  let totalQuantityAdded = 0;
  let totalValuation = 0;

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
      // Ensure Categories, Brands, Colours safely
      if (item.category) {
        await client.query(
          convertSql('INSERT INTO categories (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)))'),
          [item.category, item.category]
        );
      }
      if (item.brand) {
        await client.query(
          convertSql('INSERT INTO brands (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM brands WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)))'),
          [item.brand, item.brand]
        );
      }
      if (item.colour) {
        await client.query(
          convertSql('INSERT INTO colours (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM colours WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)))'),
          [item.colour, item.colour]
        );
      }

      // Product lookup or creation
      const prodRes = await client.query(
        convertSql('SELECT id, sale_price, purchase_price, wholesale_price FROM products WHERE LOWER(TRIM(short_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1'),
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
            `Imported sample item`,
            item.colour ? [item.colour] : []
          ]
        );
        productId = insRes.rows[0].id;
        createdProductsCount++;
      } else {
        productId = prodRes.rows[0].id;
        await client.query(
          convertSql(`UPDATE products SET 
            purchase_price = COALESCE(NULLIF(?, 0), purchase_price),
            wholesale_price = COALESCE(NULLIF(?, 0), wholesale_price),
            sale_price = COALESCE(NULLIF(?, 0), sale_price),
            brand = COALESCE(NULLIF(?, 'Generic'), brand),
            category = COALESCE(NULLIF(?, 'General'), category)
           WHERE id = ?`),
          [item.purchase_price, item.wholesale_price, item.retail_price, item.brand, item.category, productId]
        );
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
          item.colour || null,
          item.quantity,
          item.quantity,
          item.notes,
          item.source_key,
          userId
        ]
      );

      createdBatchesCount++;
      totalQuantityAdded += item.quantity;
      totalValuation += (item.purchase_price || item.retail_price) * item.quantity;
    }

    // Log Session Audit
    await client.query(
      convertSql(`INSERT INTO import_logs (
        file_name, imported_by, total_rows, created_products, total_quantity, total_valuation, destination_shop_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`),
      [
        'sample_supplier_inventory.xlsx',
        userId,
        records.length,
        createdProductsCount,
        totalQuantityAdded,
        totalValuation,
        shopId
      ]
    );

    await client.query('COMMIT');

    console.log('\n====================================================');
    console.log('✅ IMPORT TEST SUCCESSFUL!');
    console.log('====================================================');
    console.log(`- File Name: sample_supplier_inventory.xlsx`);
    console.log(`- Destination Branch: ${shopName} (Shop #${shopId})`);
    console.log(`- Total Rows Processed: ${records.length}`);
    console.log(`- New Catalog Products Created: ${createdProductsCount}`);
    console.log(`- FIFO Batches Created: ${createdBatchesCount}`);
    console.log(`- Total Stock Added: ${totalQuantityAdded} pcs`);
    console.log(`- Total Added Valuation: ₹${totalValuation.toLocaleString('en-IN')}`);
    console.log('====================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ IMPORT TEST FAILED:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runTestImport();
