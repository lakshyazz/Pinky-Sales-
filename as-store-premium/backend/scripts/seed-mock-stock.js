import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const DEFAULT_COUNT = 2000;
const DEFAULT_PREFIX = 'MOCK-STRESS';
const CHUNK_SIZE = 500;

const brands = [
  'Samsung', 'Vivo', 'Oppo', 'Realme', 'Xiaomi', 'Poco', 'OnePlus', 'Apple',
  'Google Pixel', 'Nothing', 'Motorola', 'Honor', 'Nokia', 'Infinix',
];
const categories = [
  'Displays', 'Battery', 'Camera', 'Charging IC', 'Flex Cable', 'Speaker',
  'Housing', 'Tools', 'Accessories', 'Consumables',
];
const colours = [
  'Black', 'White', 'Blue', 'Red', 'Green', 'Gold', 'Silver', 'Grey',
  'Rose Gold', 'Midnight Black',
];
const modelFamilies = [
  'A10', 'A14', 'A21', 'A32', 'A54', 'Y20', 'Y35', 'Reno 8', 'Note 12',
  'Nord CE', 'iPhone 12', 'Pixel 7', 'G Power', 'Hot 30',
];

const parseArgs = () => {
  const args = {
    count: DEFAULT_COUNT,
    prefix: DEFAULT_PREFIX,
    cleanup: false,
    shopId: null,
  };

  for (const rawArg of process.argv.slice(2)) {
    if (rawArg === '--cleanup') {
      args.cleanup = true;
      continue;
    }

    const [key, value] = rawArg.replace(/^--/, '').split('=');
    if (key === 'count') args.count = Number(value);
    if (key === 'prefix') args.prefix = String(value || DEFAULT_PREFIX).trim();
    if (key === 'shop-id') args.shopId = Number(value);
  }

  args.prefix = args.prefix.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toUpperCase();
  if (!args.prefix) args.prefix = DEFAULT_PREFIX;
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 10000) {
    throw new Error('Use --count with an integer from 1 to 10000.');
  }
  if (args.shopId !== null && (!Number.isInteger(args.shopId) || args.shopId <= 0)) {
    throw new Error('Use --shop-id with a positive integer.');
  }
  return args;
};

const chunk = (items, size = CHUNK_SIZE) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const fixedMoney = (value) => Number(value.toFixed(2));

const makeReceivedDate = (index) => {
  const date = new Date();
  date.setDate(date.getDate() - (index % 120));
  return date.toISOString().slice(0, 10);
};

const makeMockItems = ({ count, prefix }) => Array.from({ length: count }, (_, index) => {
  const sequence = String(index + 1).padStart(4, '0');
  const brand = brands[index % brands.length];
  const category = categories[Math.floor(index / brands.length) % categories.length];
  const colour = colours[index % colours.length];
  const model = modelFamilies[(index * 3) % modelFamilies.length];
  const code = `${prefix}-${sequence}`;
  const salePrice = 299 + ((index * 17) % 2400);
  const purchasePrice = fixedMoney(salePrice * 0.58);
  const wholesalePrice = fixedMoney(salePrice * 0.78);
  const quantity = 8 + ((index * 7) % 93);

  return {
    code,
    source_key: `mock-stock:${code}`,
    name: `${code} ${brand} ${model} ${category} ${colour}`,
    short_name: `${code} ${brand} ${model}`.slice(0, 60),
    full_model_list: `${brand} ${model} compatible mock stress test unit ${sequence}`,
    brand,
    category,
    model,
    official_price: salePrice,
    purchase_price: purchasePrice,
    sale_price: salePrice,
    wholesale_price: wholesalePrice,
    retail_price: salePrice,
    description: `Generated ${prefix} mock stock item for pagination and load testing.`,
    colours: colour,
    colour,
    quantity,
    received_date: makeReceivedDate(index),
    notes: `${prefix} scalability seed`,
  };
});

const loadColumns = async (client, tableName) => {
  const { rows } = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Map(rows.map((row) => [row.column_name, row]));
};

const requireColumns = (columns, tableName, required) => {
  const missing = required.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(`Table ${tableName} is missing required columns: ${missing.join(', ')}`);
  }
};

const activeLiteralFor = (columns) => {
  const active = columns.get('is_active');
  if (!active) return null;
  return active.data_type === 'boolean' ? 'TRUE' : '1';
};

const ensureReference = async (client, tableName, name) => {
  const existing = await client.query(
    `SELECT id FROM ${tableName} WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) ORDER BY id LIMIT 1`,
    [name]
  );
  if (existing.rows[0]) {
    await client.query(`UPDATE ${tableName} SET is_active = TRUE WHERE id = $1`, [existing.rows[0].id]);
    return existing.rows[0].id;
  }
  const inserted = await client.query(`INSERT INTO ${tableName} (name) VALUES ($1) RETURNING id`, [name]);
  return inserted.rows[0].id;
};

const selectTargetShop = async (client, shopId) => {
  if (shopId) {
    const selected = await client.query('SELECT id, name, location_type FROM shops WHERE id = $1', [shopId]);
    if (!selected.rows[0]) throw new Error(`No shop exists with id ${shopId}.`);
    return selected.rows[0];
  }

  const selected = await client.query(`
    SELECT id, name, location_type
    FROM shops
    WHERE location_type = 'warehouse'
    ORDER BY id
    LIMIT 1
  `);
  if (selected.rows[0]) return selected.rows[0];

  const fallback = await client.query(`
    SELECT id, name, location_type
    FROM shops
    WHERE COALESCE(status, 'active') = 'active'
    ORDER BY id
    LIMIT 1
  `);
  if (!fallback.rows[0]) throw new Error('No shop or warehouse exists to receive mock stock.');
  return fallback.rows[0];
};

const insertMissingProducts = async (client, items, productColumns) => {
  const names = items.map((item) => item.name);
  const existing = await client.query('SELECT id, name FROM products WHERE name = ANY($1::text[])', [names]);
  const idByName = new Map(existing.rows.map((row) => [row.name, Number(row.id)]));
  const missing = items.filter((item) => !idByName.has(item.name));
  const activeLiteral = activeLiteralFor(productColumns);

  for (const batch of chunk(missing)) {
    const columns = [
      'name', 'short_name', 'full_model_list', 'brand', 'category', 'model', 'official_price',
      'purchase_price', 'sale_price', 'wholesale_price', 'retail_price', 'description', 'colours',
    ];
    const values = [
      'x.name', 'x.short_name', 'x.full_model_list', 'x.brand', 'x.category', 'x.model', 'x.official_price',
      'x.purchase_price', 'x.sale_price', 'x.wholesale_price', 'x.retail_price', 'x.description',
      "string_to_array(x.colours, ',')",
    ];
    if (activeLiteral) {
      columns.push('is_active');
      values.push(activeLiteral);
    }

    const inserted = await client.query(
      `INSERT INTO products (${columns.join(', ')})
       SELECT ${values.join(', ')}
       FROM jsonb_to_recordset($1::jsonb) AS x(
         name text,
         short_name text,
         full_model_list text,
         brand text,
         category text,
         model text,
         official_price numeric,
         purchase_price numeric,
         sale_price numeric,
         wholesale_price numeric,
         retail_price numeric,
         description text,
         colours text
       )
       RETURNING id, name`,
      [JSON.stringify(batch)]
    );
    for (const row of inserted.rows) {
      idByName.set(row.name, Number(row.id));
    }
  }

  if (activeLiteral && names.length > 0) {
    await client.query(`UPDATE products SET is_active = ${activeLiteral} WHERE name = ANY($1::text[])`, [names]);
  }

  return items.map((item) => ({
    ...item,
    product_id: idByName.get(item.name),
  }));
};

const insertBatches = async (client, itemsWithIds, shop, createdBy) => {
  let insertedCount = 0;
  for (const batch of chunk(itemsWithIds)) {
    const result = await client.query(
      `INSERT INTO inventory_batches (
         shop_id, product_id, purchase_price, wholesale_price, official_price, retail_price, colour,
         quantity_received, quantity_remaining, received_date, notes, source_key, created_by
       )
       SELECT $1, x.product_id, x.purchase_price, x.wholesale_price, x.official_price, x.retail_price, x.colour,
         x.quantity, x.quantity, x.received_date::date, x.notes, x.source_key, $2
       FROM jsonb_to_recordset($3::jsonb) AS x(
         product_id integer,
         purchase_price numeric,
         wholesale_price numeric,
         official_price numeric,
         retail_price numeric,
         colour text,
         quantity integer,
         received_date text,
         notes text,
         source_key text
       )
       ON CONFLICT (source_key) DO NOTHING`,
      [shop.id, createdBy, JSON.stringify(batch)]
    );
    insertedCount += result.rowCount;
  }
  return insertedCount;
};

const syncStockRows = async (client, shop, productIds, stockColumns) => {
  if (productIds.length === 0) return 0;
  const updateTimestamp = stockColumns.has('updated_at') ? ', updated_at = CURRENT_TIMESTAMP' : '';
  const result = await client.query(
    `INSERT INTO stock (shop_id, product_id, quantity)
     SELECT $1, product_id, COALESCE(SUM(quantity_remaining), 0)::integer
     FROM inventory_batches
     WHERE shop_id = $1 AND product_id = ANY($2::integer[])
     GROUP BY product_id
     ON CONFLICT (shop_id, product_id)
     DO UPDATE SET quantity = EXCLUDED.quantity${updateTimestamp}`,
    [shop.id, productIds]
  );
  return result.rowCount;
};

const cleanupMockStock = async (client, prefix, productColumns) => {
  const sourcePattern = `mock-stock:${prefix}-%`;
  const namePattern = `${prefix}-%`;
  const activeLiteral = activeLiteralFor(productColumns);
  const inactiveLiteral = activeLiteral === 'TRUE' ? 'FALSE' : '0';

  await client.query('BEGIN');
  const products = await client.query('SELECT id FROM products WHERE name LIKE $1', [namePattern]);
  const productIds = products.rows.map((row) => Number(row.id));

  const deletedBatches = await client.query(
    'DELETE FROM inventory_batches WHERE source_key LIKE $1 RETURNING product_id',
    [sourcePattern]
  );

  if (productIds.length > 0) {
    await client.query('DELETE FROM stock WHERE product_id = ANY($1::integer[])', [productIds]);
    const deletedProducts = await client.query(
      `DELETE FROM products p
       WHERE p.id = ANY($1::integer[])
         AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.product_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM stock_requests sr WHERE sr.product_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM stock_transfers st WHERE st.product_id = p.id)
       RETURNING id`,
      [productIds]
    );
    const deletedIds = new Set(deletedProducts.rows.map((row) => Number(row.id)));
    const retainedIds = productIds.filter((id) => !deletedIds.has(id));
    if (activeLiteral && retainedIds.length > 0) {
      await client.query(`UPDATE products SET is_active = ${inactiveLiteral} WHERE id = ANY($1::integer[])`, [retainedIds]);
    }
    await client.query('COMMIT');
    return {
      productMatches: productIds.length,
      deletedProducts: deletedProducts.rowCount,
      archivedProducts: retainedIds.length,
      deletedBatches: deletedBatches.rowCount,
    };
  }

  await client.query('COMMIT');
  return {
    productMatches: 0,
    deletedProducts: 0,
    archivedProducts: 0,
    deletedBatches: deletedBatches.rowCount,
  };
};

const main = async () => {
  const args = parseArgs();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Add it to backend/.env or the shell environment.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 60_000,
  });

  const client = await pool.connect();
  const startedAt = Date.now();

  try {
    const productColumns = await loadColumns(client, 'products');
    const stockColumns = await loadColumns(client, 'stock');
    const batchColumns = await loadColumns(client, 'inventory_batches');
    requireColumns(productColumns, 'products', [
      'name', 'short_name', 'full_model_list', 'brand', 'category', 'model',
      'official_price', 'purchase_price', 'sale_price', 'wholesale_price',
      'retail_price', 'description', 'colours',
    ]);
    requireColumns(stockColumns, 'stock', ['shop_id', 'product_id', 'quantity']);
    requireColumns(batchColumns, 'inventory_batches', [
      'shop_id', 'product_id', 'purchase_price', 'wholesale_price', 'official_price',
      'retail_price', 'colour', 'quantity_received', 'quantity_remaining', 'received_date',
      'notes', 'source_key',
    ]);

    if (args.cleanup) {
      const cleanup = await cleanupMockStock(client, args.prefix, productColumns);
      console.log(JSON.stringify({ action: 'cleanup', prefix: args.prefix, ...cleanup }, null, 2));
      return;
    }

    const items = makeMockItems(args);
    const uniqueBrands = [...new Set(items.map((item) => item.brand))];
    const uniqueCategories = [...new Set(items.map((item) => item.category))];
    const uniqueColours = [...new Set(items.map((item) => item.colour))];

    await client.query('BEGIN');
    const shop = await selectTargetShop(client, args.shopId);
    const creator = await client.query("SELECT id FROM users WHERE role = 'superadmin' ORDER BY id LIMIT 1");
    const createdBy = creator.rows[0]?.id || null;

    for (const brand of uniqueBrands) await ensureReference(client, 'brands', brand);
    for (const category of uniqueCategories) await ensureReference(client, 'categories', category);
    for (const colour of uniqueColours) await ensureReference(client, 'colours', colour);

    const products = await insertMissingProducts(client, items, productColumns);
    const missingIds = products.filter((item) => !item.product_id);
    if (missingIds.length > 0) {
      throw new Error(`Unable to resolve product ids for ${missingIds.length} mock products.`);
    }

    const insertedBatches = await insertBatches(client, products, shop, createdBy);
    const productIds = products.map((item) => item.product_id);
    const touchedStockRows = await syncStockRows(client, shop, productIds, stockColumns);

    const countRow = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE p.name LIKE $1) AS mock_products,
         COUNT(*) FILTER (WHERE ib.source_key LIKE $2) AS mock_batches,
         COALESCE(SUM(CASE WHEN ib.source_key LIKE $2 THEN ib.quantity_remaining ELSE 0 END), 0) AS mock_units
       FROM products p
       LEFT JOIN inventory_batches ib ON ib.product_id = p.id
       WHERE p.name LIKE $1`,
      [`${args.prefix}-%`, `mock-stock:${args.prefix}-%`]
    );

    await client.query('COMMIT');

    console.log(JSON.stringify({
      action: 'seed',
      prefix: args.prefix,
      requested: args.count,
      targetShop: {
        id: shop.id,
        name: shop.name,
        location_type: shop.location_type,
      },
      insertedBatches,
      touchedStockRows,
      totals: {
        products: Number(countRow.rows[0]?.mock_products || 0),
        batches: Number(countRow.rows[0]?.mock_batches || 0),
        units: Number(countRow.rows[0]?.mock_units || 0),
      },
      durationMs: Date.now() - startedAt,
    }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failures; the original error below is more useful.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(`[seed-mock-stock] ${error.message}`);
  process.exitCode = 1;
});
