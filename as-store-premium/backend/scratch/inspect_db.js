import { allRecords, getRecord } from '../database.js';

const settingEnabled = (settings, key, fallback = false) => {
  const value = settings[key];
  return value === undefined ? fallback : String(value).toLowerCase() === 'true';
};
const getSettings = async () => {
  const rows = await allRecords('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
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
  const base = ['id', 'name', 'short_name', 'full_model_list', 'brand', 'part_category', 'quality_variant', 'model', 'sale_price', 'retail_price', 'description', 'colours', 'is_active', 'updated_at'];
  let cols = [...base];
  if (role === 'superadmin') cols = [...cols, 'official_price', 'purchase_price', 'wholesale_price'];
  else {
    const visibility = await getPriceVisibility();
    if (visibility.show_official_price_shopkeeper) cols.push('official_price');
    if (visibility.show_wholesale_price_shopkeeper) cols.push('wholesale_price');
    if (visibility.show_purchase_price_shopkeeper) cols.push('purchase_price');
  }
  return cols.map(c => `p.${c}`).join(', ') + `, p.company_brand_id, b.name AS company_brand_name, p.manufacturing_brand_id, mb.name AS manufacturing_brand_name, p.supplier_id, s.name AS supplier_name, p.part_category_id, pc.name AS part_category_name, p.product_variant_id, pv.name AS product_variant_name, p.model AS display_model`;
};

function hasQueryValue(val) {
  return val !== undefined && val !== null && String(val).trim() !== '';
}

function parsePagination(query) {
  const isPaginated = query.page !== undefined || query.limit !== undefined;
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = (page - 1) * limit;
  return { isPaginated, page, limit, offset };
}

function appendSearchFilter(where, params, search, fields) {
  if (!hasQueryValue(search)) return;
  const term = `%${String(search).trim()}%`;
  const group = fields.map(f => `${f} ILIKE ?`).join(' OR ');
  where.push(`(${group})`);
  fields.forEach(() => params.push(term));
}

function appendExactFilter(where, params, val, sqlPattern) {
  if (!hasQueryValue(val)) return;
  where.push(sqlPattern);
  params.push(String(val).trim());
}

const runPaginatedList = async ({ dataSql, countSql, params = [], pagination, totalKey = 'totalItems' }) => {
  if (!pagination.isPaginated) {
    const rows = await allRecords(dataSql, params);
    return { data: rows, total: rows.length };
  }
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
  const pagination = parsePagination(query);
  const params = [];
  const where = ['p.is_active = 1', 'p.name IS NOT NULL'];
  appendSearchFilter(where, params, query.search, [
    'p.name',
    "COALESCE(p.short_name, '')",
    "COALESCE(p.full_model_list, '')",
    "COALESCE(p.brand, '')",
    "COALESCE(p.part_category, '')",
    "COALESCE(p.quality_variant, '')",
    "COALESCE(pc.name, '')",
    "COALESCE(pv.name, '')",
    "COALESCE(p.model, '')",
    "COALESCE(p.description, '')",
    "COALESCE(array_to_string(p.colours, ','), '')",
    "COALESCE(mb.name, '')",
    "COALESCE(b.name, '')",
    "COALESCE(s.name, '')",
  ]);
  
  if (hasQueryValue(query.brand)) {
    if (/^\d+$/.test(query.brand)) {
      where.push('p.company_brand_id = ?');
      params.push(Number(query.brand));
    } else {
      where.push('LOWER(TRIM(p.brand)) = LOWER(TRIM(?))');
      params.push(String(query.brand).trim());
    }
  }

  if (hasQueryValue(query.manufacturingBrandId)) {
    where.push('p.manufacturing_brand_id = ?');
    params.push(Number(query.manufacturingBrandId));
  } else if (hasQueryValue(query.manufacturingBrand)) {
    where.push('LOWER(TRIM(mb.name)) = LOWER(TRIM(?))');
    params.push(String(query.manufacturingBrand).trim());
  }

  appendExactFilter(where, params, query.category, 'LOWER(TRIM(p.category)) = LOWER(TRIM(?))');
  if (hasQueryValue(query.part_category)) {
    where.push('(LOWER(TRIM(COALESCE(p.part_category, \'\'))) = LOWER(TRIM(?)) OR LOWER(TRIM(COALESCE(pc.name, \'\'))) = LOWER(TRIM(?)))');
    params.push(String(query.part_category).trim(), String(query.part_category).trim());
  }
  if (hasQueryValue(query.quality_variant)) {
    where.push('(LOWER(TRIM(COALESCE(p.quality_variant, \'\'))) = LOWER(TRIM(?)) OR LOWER(TRIM(COALESCE(pv.name, \'\'))) = LOWER(TRIM(?)))');
    params.push(String(query.quality_variant).trim(), String(query.quality_variant).trim());
  }
  if (hasQueryValue(query.colour)) {
    where.push(`EXISTS (
      SELECT 1 FROM UNNEST(p.colours) AS product_colour
      WHERE LOWER(TRIM(product_colour)) = LOWER(TRIM(?))
    )`);
    params.push(String(query.colour).trim());
  }
  const minPrice = hasQueryValue(query.min) ? Number(query.min) : hasQueryValue(query.minPrice) ? Number(query.minPrice) : null;
  const maxPrice = hasQueryValue(query.max) ? Number(query.max) : hasQueryValue(query.maxPrice) ? Number(query.maxPrice) : null;
  if (Number.isFinite(minPrice)) {
    where.push('COALESCE(p.retail_price, p.sale_price, p.official_price, 0) >= ?');
    params.push(minPrice);
  }
  if (Number.isFinite(maxPrice)) {
    where.push('COALESCE(p.retail_price, p.sale_price, p.official_price, 0) <= ?');
    params.push(maxPrice);
  }
  const whereSql = where.join(' AND ');
  return runPaginatedList({
    dataSql: `SELECT ${columns} FROM products p 
              LEFT JOIN brands b ON b.id = p.company_brand_id
              LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
              LEFT JOIN suppliers s ON s.id = p.supplier_id
              LEFT JOIN part_categories pc ON pc.id = p.part_category_id
              LEFT JOIN product_variants pv ON pv.id = p.product_variant_id
              WHERE ${whereSql} ORDER BY p.brand, COALESCE(p.short_name, p.name)`,
    countSql: `SELECT COUNT(*) AS total FROM products p 
               LEFT JOIN brands b ON b.id = p.company_brand_id
               LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
               LEFT JOIN suppliers s ON s.id = p.supplier_id
               LEFT JOIN part_categories pc ON pc.id = p.part_category_id
               LEFT JOIN product_variants pv ON pv.id = p.product_variant_id
               WHERE ${whereSql}`,
    params,
    pagination,
    totalKey: 'totalProducts',
  });
};

async function testAllRoles() {
  try {
    console.log('--- Testing superadmin unpaginated ---');
    const res1 = await getProductsForRole('superadmin', {});
    console.log('Res1 Total:', res1.total, 'Count:', res1.data.length);

    console.log('--- Testing shopkeeper paginated ---');
    const res2 = await getProductsForRole('shopkeeper', { page: 1, limit: 10 });
    console.log('Res2 Total:', res2.total, 'Count:', res2.data.length);

    console.log('--- Testing search ---');
    const res3 = await getProductsForRole('superadmin', { search: 'iPhone' });
    console.log('Res3 Search iPhone Total:', res3.total);

    console.log('--- Testing brand filter ---');
    const res4 = await getProductsForRole('superadmin', { brand: 'Apple' });
    console.log('Res4 Brand Apple Total:', res4.total);

  } catch (err) {
    console.error('TEST ERROR:', err);
  }
  process.exit();
}

testAllRoles();
