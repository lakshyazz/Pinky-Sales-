import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

function convertSql(sql) {
  let index = 1;
  let converted = sql.replace(/\?/g, () => `$${index++}`);
  return converted;
}

const getSettings = async () => {
  return allRecords('SELECT key, value FROM settings');
};

const settingEnabled = (settings, key, fallback = false) => {
  const match = settings.find((s) => s.key === key);
  if (!match) return fallback;
  return match.value === 'true' || match.value === '1' || match.value === true;
};

const getPriceVisibility = async () => {
  const settings = await getSettings();
  return {
    show_official_price_shopkeeper: settingEnabled(settings, 'show_official_price_shopkeeper', true),
    show_wholesale_price_shopkeeper: settingEnabled(settings, 'show_wholesale_price_shopkeeper'),
    show_purchase_price_shopkeeper: settingEnabled(settings, 'show_purchase_price_shopkeeper'),
  };
};

const productColumnsForRole = async (role) => {
  const base = ['id', 'name', 'short_name', 'full_model_list', 'brand', 'category', 'model', 'sale_price', 'retail_price', 'description', 'colours', 'is_active', 'updated_at'];
  let cols = [...base];
  if (role === 'superadmin') cols = [...cols, 'official_price', 'purchase_price', 'wholesale_price'];
  else {
    const visibility = await getPriceVisibility();
    if (visibility.show_official_price_shopkeeper) cols.push('official_price');
    if (visibility.show_wholesale_price_shopkeeper) cols.push('wholesale_price');
    if (visibility.show_purchase_price_shopkeeper) cols.push('purchase_price');
  }
  return cols.map(c => `p.${c}`).join(', ') + `, p.company_brand_id, b.name AS company_brand_name, p.manufacturing_brand_id, mb.name AS manufacturing_brand_name, p.supplier_id, s.name AS supplier_name, p.model AS display_model`;
};

const runPaginatedList = async ({ dataSql, countSql, params = [], pagination, totalKey = 'totalItems' }) => {
  if (!pagination.isPaginated) return allRecords(dataSql, params);
  const [rows, totalRow] = await Promise.all([
    allRecords(`${dataSql} LIMIT ? OFFSET ?`, [...params, pagination.limit, pagination.offset]),
    getRecord(countSql, params),
  ]);
  const total = Number(totalRow?.total || 0);
  return {
    data: rows,
    page: pagination.page,
    limit: pagination.limit,
    total,
    [totalKey]: total,
    totalPages: Math.max(Math.ceil(total / pagination.limit), 1),
  };
};

const getProductsForRole = async (role, query = {}) => {
  const columns = await productColumnsForRole(role);
  const pagination = { isPaginated: true, limit: 50, offset: 0, page: 1 };
  const params = [];
  const where = ['p.is_active = 1', 'p.name IS NOT NULL'];
  const whereSql = where.join(' AND ');
  return runPaginatedList({
    dataSql: `SELECT ${columns} FROM products p 
              LEFT JOIN brands b ON b.id = p.company_brand_id
              LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
              LEFT JOIN suppliers s ON s.id = p.supplier_id
              WHERE ${whereSql} ORDER BY p.brand, COALESCE(p.short_name, p.name)`,
    countSql: `SELECT COUNT(*) AS total FROM products p 
               LEFT JOIN brands b ON b.id = p.company_brand_id
               LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
               LEFT JOIN suppliers s ON s.id = p.supplier_id
               WHERE ${whereSql}`,
    params,
    pagination,
    totalKey: 'totalProducts',
  });
};

async function run() {
  try {
    console.log("Fetching superadmin products...");
    const saProds = await getProductsForRole('superadmin');
    console.log(`Success: Loaded ${saProds.data.length} products`);
  } catch (err) {
    console.error("Error fetching superadmin products:", err);
  } finally {
    pool.end();
  }
}

run();
