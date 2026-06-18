import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { initDatabase, runQuery, getRecord, allRecords, runTransaction } from './database.js';

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'as-store-multishop-local-secret';
const VALID_ROLES = new Set(['superadmin', 'shopkeeper', 'admin', 'customer', 'user']);
const isShopStaffRole = (role) => role === 'shopkeeper' || role === 'admin';
const isCustomerRole = (role) => role === 'customer' || role === 'user';
const allowedCorsOrigins = String(process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('[Server] WARNING: JWT_SECRET is not set in production. Using fallback secret.');
}

app.use(cors(allowedCorsOrigins.length ? { origin: allowedCorsOrigins } : {}));
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

await initDatabase().catch((err) => {
  console.error('[Server] Failed to initialize database:', err);
  process.exit(1);
});

const today = () => new Date().toISOString().slice(0, 10);
const lastDays = (count = 7) => Array.from({ length: count }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() - (count - index - 1));
  return date.toISOString().slice(0, 10);
});
const money = (value) => Number(value || 0);
const productDisplayName = (row) => row.short_name || row.name;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const clampInteger = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};
const cleanQueryText = (value, maxLength = 120) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
const hasQueryValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';
const parsePagination = (query, options = {}) => {
  const limit = clampInteger(query.limit, options.defaultLimit || DEFAULT_PAGE_LIMIT, 1, options.maxLimit || MAX_PAGE_LIMIT);
  const page = clampInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    isPaginated: options.force || hasQueryValue(query.page) || hasQueryValue(query.limit),
  };
};
const appendSearchFilter = (where, params, search, columns) => {
  const query = cleanQueryText(search);
  if (!query) return;
  where.push(`(${columns.map((column) => `${column} ILIKE ?`).join(' OR ')})`);
  columns.forEach(() => params.push(`%${query}%`));
};
const appendExactFilter = (where, params, value, sql) => {
  if (!hasQueryValue(value)) return;
  where.push(sql);
  params.push(String(value).trim());
};
const appendDateRangeFilter = (where, params, fromValue, toValue, column) => {
  if (hasQueryValue(fromValue)) {
    where.push(`${column} >= ?`);
    params.push(String(fromValue).slice(0, 10));
  }
  if (hasQueryValue(toValue)) {
    where.push(`${column} <= ?`);
    params.push(String(toValue).slice(0, 10));
  }
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
const responseCache = new Map();
const sessionUserCache = new Map();
const getCached = async (key, ttlMs, loader) => {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = Promise.resolve().then(loader);
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  try {
    return await value;
  } catch (error) {
    responseCache.delete(key);
    throw error;
  }
};
const invalidateCache = (...keys) => keys.forEach((key) => responseCache.delete(key));
const getSessionUser = async (userId) => {
  const cached = sessionUserCache.get(Number(userId));
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  const user = await getRecord('SELECT id, username, role, name, shop_id FROM users WHERE id = ?', [userId]);
  sessionUserCache.set(Number(userId), { user, expiresAt: Date.now() + 15_000 });
  return user;
};
const normalizeColours = (value) => {
  const colours = Array.isArray(value) ? value : String(value || '').split(',');
  const unique = new Map();
  colours.map((colour) => String(colour).trim()).filter(Boolean).forEach((colour) => {
    const key = colour.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, colour);
  });
  return [...unique.values()];
};
const ensureReference = async (table, value) => {
  const name = String(value || '').trim();
  if (!name) return null;
  const existing = await getRecord(`SELECT id, name FROM ${table} WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id LIMIT 1`, [name]);
  if (existing) {
    await runQuery(`UPDATE ${table} SET is_active = TRUE WHERE id = ?`, [existing.id]);
    invalidateCache('reference-data');
    return existing;
  }
  const result = await runQuery(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
  invalidateCache('reference-data');
  return { id: result.id, name };
};
const settingEnabled = (settings, key, fallback = false) => {
  const value = settings[key];
  return value === undefined ? fallback : String(value).toLowerCase() === 'true';
};
const getSettings = async () => {
  return getCached('settings', 60_000, async () => {
    const rows = await allRecords('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });
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
  const base = ['id', 'name', 'short_name', 'full_model_list', 'brand', 'category', 'sale_price', 'retail_price', 'description', 'colours', 'is_active', 'updated_at'];
  if (role === 'superadmin') return [...base, 'official_price', 'purchase_price', 'wholesale_price'].join(', ');
  const visibility = await getPriceVisibility();
  if (visibility.show_official_price_shopkeeper) base.push('official_price');
  if (visibility.show_wholesale_price_shopkeeper) base.push('wholesale_price');
  if (visibility.show_purchase_price_shopkeeper) base.push('purchase_price');
  return base.join(', ');
};
const getReferenceData = () => getCached('reference-data', 300_000, async () => {
  const [categories, colours, brands] = await Promise.all([
    allRecords('SELECT DISTINCT ON (LOWER(TRIM(name))) id, name FROM categories WHERE is_active = TRUE ORDER BY LOWER(TRIM(name)), id'),
    allRecords('SELECT DISTINCT ON (LOWER(TRIM(name))) id, name FROM colours WHERE is_active = TRUE ORDER BY LOWER(TRIM(name)), id'),
    allRecords('SELECT DISTINCT ON (LOWER(TRIM(name))) id, name FROM brands WHERE is_active = TRUE ORDER BY LOWER(TRIM(name)), id'),
  ]);
  return { categories, colours, brands };
});
const getProductsForRole = async (role, query = {}) => {
  const columns = await productColumnsForRole(role);
  const pagination = parsePagination(query);
  const params = [];
  const where = ['is_active = 1', 'name IS NOT NULL'];
  appendSearchFilter(where, params, query.search, [
    'name',
    "COALESCE(short_name, '')",
    "COALESCE(full_model_list, '')",
    "COALESCE(brand, '')",
    "COALESCE(category, '')",
    "COALESCE(description, '')",
  ]);
  appendExactFilter(where, params, query.brand, 'brand = ?');
  appendExactFilter(where, params, query.category, 'LOWER(TRIM(category)) = LOWER(TRIM(?))');
  if (hasQueryValue(query.colour)) {
    where.push(`EXISTS (
      SELECT 1 FROM UNNEST(colours) AS product_colour
      WHERE LOWER(TRIM(product_colour)) = LOWER(TRIM(?))
    )`);
    params.push(String(query.colour).trim());
  }
  const minPrice = hasQueryValue(query.min) ? Number(query.min) : hasQueryValue(query.minPrice) ? Number(query.minPrice) : null;
  const maxPrice = hasQueryValue(query.max) ? Number(query.max) : hasQueryValue(query.maxPrice) ? Number(query.maxPrice) : null;
  if (Number.isFinite(minPrice)) {
    where.push('COALESCE(retail_price, sale_price, official_price, 0) >= ?');
    params.push(minPrice);
  }
  if (Number.isFinite(maxPrice)) {
    where.push('COALESCE(retail_price, sale_price, official_price, 0) <= ?');
    params.push(maxPrice);
  }
  const whereSql = where.join(' AND ');
  return runPaginatedList({
    dataSql: `SELECT ${columns} FROM products WHERE ${whereSql} ORDER BY brand, COALESCE(short_name, name)`,
    countSql: `SELECT COUNT(*) AS total FROM products WHERE ${whereSql}`,
    params,
    pagination,
    totalKey: 'totalProducts',
  });
};
const getWarehouse = () => getRecord("SELECT id, name, area FROM shops WHERE location_type = 'warehouse' ORDER BY id LIMIT 1");
const getShopsForUser = async (user) => {
  if (isCustomerRole(user.role)) {
    return allRecords(`
      SELECT id, name, area, location_type
      FROM shops
      WHERE status = 'active'
      ORDER BY id ASC
    `);
  }
  const shopId = isShopStaffRole(user.role) ? Number(user.shop_id) : null;
  return allRecords(`
    SELECT sh.*,
      COALESCE((SELECT SUM(st.quantity) FROM stock st WHERE st.shop_id = sh.id), 0) AS stock,
      COALESCE((SELECT SUM(sa.pending_amount) FROM sales sa WHERE sa.shop_id = sh.id), 0) AS pending
    FROM shops sh
    ${shopId ? "WHERE sh.id = ? OR sh.location_type = 'warehouse'" : ''}
    ORDER BY CASE WHEN sh.location_type = 'warehouse' THEN 0 ELSE 1 END, sh.id ASC
  `, shopId ? [shopId] : []);
};
const batchAccessSql = (user, alias = 'ib') => isShopStaffRole(user.role)
  ? ` AND (${alias}.assigned_user_id IS NULL OR ${alias}.assigned_user_id = ${Number(user.id)})`
  : '';
const ownedBatchAccessSql = (user, alias = 'ib') => isShopStaffRole(user.role)
  ? ` AND ${alias}.assigned_user_id = ${Number(user.id)}`
  : '';
const syncStockFromBatches = async (tx, shopId, productId) => {
  const row = await tx.getRecord(
    'SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity FROM inventory_batches WHERE shop_id = ? AND product_id = ?',
    [shopId, productId]
  );
  await tx.runQuery(
    'INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT(shop_id, product_id) DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP',
    [shopId, productId, Number(row?.quantity || 0)]
  );
};
const createToken = (user) => jwt.sign({
  id: user.id,
  username: user.username,
  role: user.role,
  name: user.name,
  shop_id: user.shop_id,
}, JWT_SECRET, { expiresIn: '10h' });

const audit = async (req, action, entityType, entityId, details = '') => {
  await runQuery(
    'INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user?.id || null, req.user?.name || 'System', action, entityType, entityId || null, details]
  );
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Login required.' });

  jwt.verify(token, JWT_SECRET, async (err, tokenUser) => {
    if (err) return res.status(403).json({ error: 'Session expired. Please login again.' });
    try {
      const user = await getSessionUser(tokenUser.id);
      if (!user || !VALID_ROLES.has(user.role)) {
        return res.status(403).json({ error: 'This account no longer has access. Please login again.' });
      }
      if (isShopStaffRole(user.role) && !user.shop_id) {
        return res.status(403).json({ error: 'This account is not assigned to a shop. Contact the Super Admin.' });
      }
      req.user = { ...tokenUser, ...user };
      next();
    } catch (error) {
      console.error('[Auth] Session validation failed:', error);
      res.status(503).json({ error: 'Unable to validate this session right now.' });
    }
  });
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Super Admin access required.' });
  next();
};

const requireShopStaff = (req, res, next) => {
  if (req.user.role === 'superadmin' || isShopStaffRole(req.user.role)) return next();
  return res.status(403).json({ error: 'Shop staff access required.' });
};

const scopeShopId = (req) => {
  if (isShopStaffRole(req.user.role)) return Number(req.user.shop_id);
  return req.query.shopId || req.body.shop_id || req.params.shopId || null;
};
const scopeReadableShopId = (req) => req.query.shopId || scopeShopId(req);

const assertShopAccess = (req, requestedShopId) => {
  if (req.user.role === 'superadmin') return Number(requestedShopId);
  const ownShopId = Number(req.user.shop_id);
  if (requestedShopId && Number(requestedShopId) !== ownShopId) {
    const error = new Error('You can only change data in your assigned shop.');
    error.status = 403;
    throw error;
  }
  return ownShopId;
};

const assertShopReadAccess = async (req, requestedShopId) => {
  const shopId = Number(requestedShopId);
  if (req.user.role === 'superadmin' || shopId === Number(req.user.shop_id)) return shopId;
  const warehouse = await getRecord("SELECT id FROM shops WHERE id = ? AND location_type = 'warehouse'", [shopId]);
  if (warehouse) return shopId;
  const error = new Error('You cannot view inventory from this location.');
  error.status = 403;
  throw error;
};

const requireScopedShopId = (req, requestedShopId) => {
  const shopId = assertShopAccess(req, requestedShopId);
  if (!Number.isInteger(shopId) || shopId <= 0) {
    const error = new Error('Select a specific shop first.');
    error.status = 400;
    throw error;
  }
  return shopId;
};

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Enter username and password.' });
  if (username.length > 80 || password.length > 200) return res.status(400).json({ error: 'Username or password is too long.' });

  const user = await getRecord(`
    SELECT u.id, u.username, u.password, u.role, u.name, u.shop_id, s.name AS shop_name, s.area AS shop_area
    FROM users u
    LEFT JOIN shops s ON s.id = u.shop_id
    WHERE u.username = ?
  `, [username]);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  if (!VALID_ROLES.has(user.role)) {
    return res.status(403).json({ error: 'This account has an invalid role. Contact the Super Admin.' });
  }
  if (isShopStaffRole(user.role) && !user.shop_id) {
    return res.status(403).json({ error: 'This account is not assigned to a shop. Contact the Super Admin.' });
  }

  res.json({
    token: createToken(user),
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    shop_id: user.shop_id,
    shop_name: user.shop_name,
    shop_area: user.shop_area,
  });
});

app.get('/api/me', authenticateToken, async (req, res) => {
  const user = await getRecord(`
    SELECT u.id, u.username, u.role, u.name, u.contact, u.shop_id, s.name AS shop_name, s.area AS shop_area
    FROM users u
    LEFT JOIN shops s ON s.id = u.shop_id
    WHERE u.id = ?
  `, [req.user.id]);
  if (!user || !VALID_ROLES.has(user.role)) {
    return res.status(401).json({ error: 'Session account no longer exists. Please login again.' });
  }
  if (isShopStaffRole(user.role) && !user.shop_id) {
    return res.status(403).json({ error: 'This account is not assigned to a shop. Contact the Super Admin.' });
  }
  res.json({ ...user, token: createToken(user) });
});

app.get('/api/bootstrap', authenticateToken, requireShopStaff, async (req, res) => {
  const [shops, products, reference, priceVisibility, warehouse] = await Promise.all([
    getShopsForUser(req.user),
    getProductsForRole(req.user.role),
    getReferenceData(),
    getPriceVisibility(),
    getWarehouse(),
  ]);
  res.json({ shops, products, reference, priceVisibility, warehouse });
});

app.get('/api/dashboard', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = scopeShopId(req);
  const trendDays = lastDays();
  const trendPlaceholders = trendDays.map(() => '?').join(', ');
  const visibleBatchAccess = batchAccessSql(req.user);
  const visibleBatchShopScope = shopId ? `AND ib.shop_id = ${Number(shopId)}` : '';
  const visibleStockSql = `COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.shop_id = st.shop_id AND ib.product_id = st.product_id ${visibleBatchAccess}), 0)`;

  const [totals, lowStock, shopWise, topProducts, salesTrendRows, pendingTrendRows, modelAvailability] = await Promise.all([
    getRecord(`
      SELECT
        (SELECT COUNT(*) FROM shops WHERE status = 'active' ${shopId ? 'AND id = ?' : ''}) AS total_shops,
        (SELECT COALESCE(SUM(ib.quantity_remaining), 0) FROM inventory_batches ib WHERE 1 = 1 ${visibleBatchShopScope} ${visibleBatchAccess}) AS total_stock,
        (SELECT COALESCE(SUM(total_amount), 0) FROM sales ${shopId ? 'WHERE shop_id = ? AND' : 'WHERE'} sale_date = ?) AS today_sales,
        (SELECT COALESCE(SUM(pending_amount), 0) FROM sales ${shopId ? 'WHERE shop_id = ? AND' : 'WHERE'} pending_amount > 0) AS pending_payments
    `, shopId ? [shopId, shopId, today(), shopId] : [today()]),
        allRecords(`
      SELECT st.id, sh.name AS shop_name, p.id AS product_id, p.name AS product_name, p.short_name AS product_short_name, p.brand,
        ${visibleStockSql} AS quantity, sh.low_stock_threshold
      FROM stock st
      JOIN shops sh ON sh.id = st.shop_id
      JOIN products p ON p.id = st.product_id
      WHERE ${visibleStockSql} <= sh.low_stock_threshold ${shopId ? 'AND st.shop_id = ?' : ''}
      ORDER BY quantity ASC, p.name ASC
      LIMIT 12
    `, shopId ? [shopId] : []),
    allRecords(`
      SELECT sh.id, sh.name, sh.area, sh.location_type,
        COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.shop_id = sh.id ${visibleBatchAccess}), 0) AS stock,
        COALESCE((SELECT SUM(sa.pending_amount) FROM sales sa WHERE sa.shop_id = sh.id), 0) AS pending,
        COALESCE((SELECT SUM(sa.total_amount) FROM sales sa WHERE sa.shop_id = sh.id AND sa.sale_date = ?), 0) AS sales_today
      FROM shops sh
      ${shopId ? 'WHERE sh.id = ?' : ''}
      ORDER BY sales_today DESC, pending DESC
    `, shopId ? [today(), shopId] : [today()]),
    allRecords(`
      SELECT p.name, p.short_name, p.brand, COALESCE(SUM(sa.quantity), 0) AS sold
      FROM products p
      LEFT JOIN sales sa ON sa.product_id = p.id ${shopId ? 'AND sa.shop_id = ?' : ''}
      GROUP BY p.id
      ORDER BY sold DESC, p.name ASC
      LIMIT 6
    `, shopId ? [shopId] : []),
    allRecords(`
      SELECT sale_date AS day, COALESCE(SUM(total_amount), 0) AS value
      FROM sales
      WHERE sale_date IN (${trendPlaceholders}) ${shopId ? 'AND shop_id = ?' : ''}
      GROUP BY sale_date
    `, shopId ? [...trendDays, shopId] : trendDays),
    allRecords(`
      SELECT due_date AS day, COALESCE(SUM(pending_amount), 0) AS value
      FROM sales
      WHERE pending_amount > 0 AND due_date IN (${trendPlaceholders}) ${shopId ? 'AND shop_id = ?' : ''}
      GROUP BY due_date
    `, shopId ? [...trendDays, shopId] : trendDays),
    allRecords(`
      SELECT p.id, p.name, p.short_name, p.full_model_list, p.brand, p.category, p.description, p.colours, p.official_price, p.sale_price,
        COALESCE(SUM(ib.quantity_remaining), 0) AS available_stock,
        COALESCE(SUM(ib.quantity_remaining) FILTER (WHERE sh.location_type = 'warehouse'), 0) AS warehouse_stock,
        STRING_AGG(DISTINCT CASE WHEN ib.quantity_remaining > 0 THEN sh.name END, ', ') AS available_locations
      FROM products p
      LEFT JOIN inventory_batches ib ON ib.product_id = p.id ${shopId ? 'AND ib.shop_id = ?' : ''}
      LEFT JOIN shops sh ON sh.id = ib.shop_id
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY COALESCE(p.short_name, p.name)
    `, shopId ? [shopId] : []),
  ]);

  const trendValues = (rows) => {
    const valuesByDay = new Map(rows.map((row) => [String(row.day).slice(0, 10), money(row.value)]));
    return trendDays.map((day) => valuesByDay.get(day) || 0);
  };

  res.json({
    totals,
    lowStock,
    shopWise,
    topProducts,
    modelAvailability,
    trends: {
      sales: trendValues(salesTrendRows),
      pending: trendValues(pendingTrendRows),
    },
  });
});

app.get('/api/shops', authenticateToken, async (req, res) => {
  res.json(await getShopsForUser(req.user));
});

app.post('/api/shops', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { name, area, address, phone } = req.body;
  if (!name || !area) return res.status(400).json({ error: 'Shop name and area are required.' });
  const result = await runQuery("INSERT INTO shops (name, area, address, phone, location_type) VALUES (?, ?, ?, ?, 'shop')", [name, area, address || '', phone || '']);
  const products = await allRecords('SELECT id FROM products');
  for (const product of products) {
    await runQuery('INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, 0) ON CONFLICT(shop_id, product_id) DO NOTHING', [result.id, product.id]);
  }
  await audit(req, 'Created shop', 'shop', result.id, name);
  res.status(201).json({ id: result.id, name, area, address, phone });
});

app.put('/api/shops/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { name, area, address, phone, status } = req.body;
  await runQuery(
    'UPDATE shops SET name = ?, area = ?, address = ?, phone = ?, status = ? WHERE id = ?',
    [name, area, address || '', phone || '', status || 'active', req.params.id]
  );
  await audit(req, 'Updated shop', 'shop', req.params.id, name);
  res.json({ success: true });
});

app.delete('/api/shops/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  const shop = await getRecord('SELECT location_type FROM shops WHERE id = ?', [req.params.id]);
  if (shop?.location_type === 'warehouse') return res.status(409).json({ error: 'Warehouse cannot be deleted.' });
  await runQuery('DELETE FROM users WHERE shop_id = ?', [req.params.id]);
  await runQuery('DELETE FROM shops WHERE id = ?', [req.params.id]);
  sessionUserCache.clear();
  await audit(req, 'Deleted shop', 'shop', req.params.id, `Shop ID ${req.params.id}`);
  res.json({ success: true });
});

app.get('/api/shopkeepers', authenticateToken, requireSuperAdmin, async (req, res) => {
  const rows = await allRecords(`
    SELECT u.id, u.username, u.name, u.contact, u.shop_id, s.name AS shop_name
    FROM users u
    LEFT JOIN shops s ON s.id = u.shop_id
    WHERE u.role IN ('shopkeeper', 'admin')
    ORDER BY s.name, u.name
  `);
  res.json(rows);
});

app.post('/api/shopkeepers', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    const contact = String(req.body.contact || '').trim();
    const shopId = Number(req.body.shop_id);
    if (!username || !password || !name || !Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'Username, password, name and shop are required.' });
    }
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-40 characters and use only letters, numbers, dots, dashes, or underscores.' });
    }
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Password must contain between 8 and 200 characters.' });
    }
    if (name.length > 80 || contact.length > 30) {
      return res.status(400).json({ error: 'Name or mobile number is too long.' });
    }
    const [shop, existingUser] = await Promise.all([
      getRecord('SELECT id FROM shops WHERE id = ?', [shopId]),
      getRecord('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]),
    ]);
    if (!shop) return res.status(400).json({ error: 'Choose a valid shop.' });
    if (existingUser) return res.status(409).json({ error: 'That username is already in use.' });

    const hash = await bcrypt.hash(password, 10);
    const result = await runQuery(
      "INSERT INTO users (username, password, role, name, contact, shop_id) VALUES (?, ?, 'shopkeeper', ?, ?, ?)",
      [username, hash, name, contact, shopId]
    );
    await audit(req, 'Created shopkeeper', 'user', result.id, name);
    res.status(201).json({ id: result.id, username, name, contact, shop_id: shopId });
  } catch (error) {
    console.error('[Shopkeepers] Create failed:', error);
    res.status(500).json({ error: 'Unable to create this shopkeeper right now.' });
  }
});

app.delete('/api/shopkeepers/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const shopkeeperId = Number(req.params.id);
    if (!Number.isInteger(shopkeeperId) || shopkeeperId <= 0) {
      return res.status(400).json({ error: 'Choose a valid shopkeeper.' });
    }
    const shopkeeper = await getRecord(
      "SELECT id, name, username FROM users WHERE id = ? AND role IN ('shopkeeper', 'admin')",
      [shopkeeperId]
    );
    if (!shopkeeper) return res.status(404).json({ error: 'Shopkeeper not found.' });

    await runTransaction(async (tx) => {
      await tx.runQuery('UPDATE inventory_batches SET assigned_user_id = NULL WHERE assigned_user_id = ?', [shopkeeperId]);
      await tx.runQuery('UPDATE inventory_batches SET created_by = NULL WHERE created_by = ?', [shopkeeperId]);
      await tx.runQuery('UPDATE sales SET created_by = NULL WHERE created_by = ?', [shopkeeperId]);
      await tx.runQuery('UPDATE customers SET created_by = NULL WHERE created_by = ?', [shopkeeperId]);
      await tx.runQuery('UPDATE stock_requests SET created_by = NULL WHERE created_by = ?', [shopkeeperId]);
      await tx.runQuery('UPDATE audit_logs SET actor_id = NULL WHERE actor_id = ?', [shopkeeperId]);
      await tx.runQuery("DELETE FROM users WHERE id = ? AND role IN ('shopkeeper', 'admin')", [shopkeeperId]);
    });
    sessionUserCache.delete(shopkeeperId);
    await audit(req, 'Deleted shopkeeper login', 'user', shopkeeperId, `${shopkeeper.name} (@${shopkeeper.username})`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Shopkeepers] Delete failed:', error);
    res.status(500).json({ error: 'Unable to delete this shopkeeper right now.' });
  }
});

app.get('/api/reference-data', async (_req, res) => {
  res.json(await getReferenceData());
});

app.post('/api/reference-data/:type', authenticateToken, requireShopStaff, async (req, res) => {
  const tables = { categories: 'categories', colours: 'colours', brands: 'brands' };
  const table = tables[req.params.type];
  const name = String(req.body.name || '').trim();
  if (!table || !name) return res.status(400).json({ error: 'Choose a valid reference type and enter a name.' });
  if (req.user.role !== 'superadmin' && req.params.type !== 'categories') {
    return res.status(403).json({ error: 'Only the Super Admin can add brands or colours.' });
  }
  const reference = await ensureReference(table, name);
  const singularType = { categories: 'category', colours: 'colour', brands: 'brand' }[req.params.type];
  await audit(req, `Added ${singularType}`, singularType, reference.id, reference.name);
  res.status(201).json(reference);
});

app.get('/api/settings/price-visibility', authenticateToken, requireShopStaff, async (_req, res) => {
  res.json(await getPriceVisibility());
});

app.put('/api/settings/price-visibility', authenticateToken, requireSuperAdmin, async (req, res) => {
  const allowed = ['show_official_price_shopkeeper', 'show_wholesale_price_shopkeeper', 'show_purchase_price_shopkeeper'];
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    await runQuery(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP RETURNING key',
      [key, String(Boolean(req.body[key]))]
    );
  }
  invalidateCache('settings');
  await audit(req, 'Updated shopkeeper price visibility', 'settings', null, JSON.stringify(req.body));
  res.json(await getPriceVisibility());
});

app.get('/api/export-data', authenticateToken, requireShopStaff, async (req, res) => {
  const { type = 'stock', brand = '', category = '', colour = '', shopkeeperId = '', status = '', batchId = '' } = req.query;
  if (type === 'products') {
    const columns = await productColumnsForRole(req.user.role);
    return res.json(await allRecords(`SELECT ${columns} FROM products WHERE is_active = 1 ORDER BY brand, COALESCE(short_name, name)`));
  }

  const shopId = isShopStaffRole(req.user.role) ? Number(req.user.shop_id) : Number(req.query.shopId || 0);
  const visibility = await getPriceVisibility();
  const priceColumns = req.user.role === 'superadmin'
    ? 'ib.purchase_price, ib.wholesale_price, p.sale_price,'
    : `${visibility.show_purchase_price_shopkeeper ? 'ib.purchase_price,' : ''}${visibility.show_wholesale_price_shopkeeper ? 'ib.wholesale_price,' : ''} p.sale_price,`;
  const params = [];
  const where = ['1 = 1'];
  if (shopId) {
    where.push('ib.shop_id = ?');
    params.push(shopId);
  }
  if (brand) {
    where.push('p.brand = ?');
    params.push(brand);
  }
  if (category) {
    where.push('p.category = ?');
    params.push(category);
  }
  if (colour) {
    where.push('ib.colour = ?');
    params.push(colour);
  }
  if (batchId) {
    where.push('ib.id = ?');
    params.push(batchId);
  }
  if (status === 'in_stock') where.push('ib.quantity_remaining > 0');
  if (status === 'out_of_stock') where.push('ib.quantity_remaining = 0');
  if (req.user.role === 'superadmin' && shopkeeperId) {
    where.push('ib.assigned_user_id = ?');
    params.push(shopkeeperId);
  }
  const rows = await allRecords(`
    SELECT p.short_name AS product_name, p.full_model_list AS model_name, p.brand, p.category,
      ib.colour, ${priceColumns} ib.quantity_remaining AS quantity, ib.quantity_received,
      sh.name AS shop_name, u.name AS shopkeeper_name, ib.received_date AS date_added,
      CASE WHEN ib.quantity_remaining > 0 THEN 'In Stock' ELSE 'Out of Stock' END AS stock_status,
      ib.id AS batch_id
    FROM inventory_batches ib
    JOIN products p ON p.id = ib.product_id
    JOIN shops sh ON sh.id = ib.shop_id
    LEFT JOIN users u ON u.id = ib.assigned_user_id
    WHERE ${where.join(' AND ')} ${batchAccessSql(req.user)}
    ORDER BY p.brand, COALESCE(p.short_name, p.name), ib.received_date, ib.id
  `, params);
  res.json(rows);
});

app.get('/api/products', authenticateToken, requireShopStaff, async (req, res) => {
  res.json(await getProductsForRole(req.user.role, req.query));
});

app.post('/api/products', authenticateToken, requireSuperAdmin, async (req, res) => {
  const {
    name, short_name, full_model_list, brand, category, official_price,
    purchase_price, sale_price, wholesale_price, retail_price, description, colours,
  } = req.body;
    const compatibilityModels = String(full_model_list || name || '').trim();
  const displayName = String(short_name || compatibilityModels).trim();
  
  const parsePrice = (val, fallback = null) => {
    if (val === '' || val === null || val === undefined) return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
  };
  
  const salePriceNum = Number(sale_price ?? official_price);
  if (!compatibilityModels || !displayName || !brand || !category || isNaN(salePriceNum) || salePriceNum <= 0) {
    return res.status(400).json({ error: 'Short name, compatible models, brand, category and a valid sale price are required.' });
  }

  const purchasePriceNum = parsePrice(purchase_price, null);
  const wholesalePriceNum = parsePrice(wholesale_price, null);
  const officialPriceNum = salePriceNum;
  const retailPriceNum = salePriceNum;

  const result = await runQuery(
    `INSERT INTO products (
      name, short_name, full_model_list, brand, category, official_price,
      purchase_price, sale_price, wholesale_price, retail_price, description, colours
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      compatibilityModels, displayName, compatibilityModels, brand, category, officialPriceNum,
      purchasePriceNum, salePriceNum, wholesalePriceNum, retailPriceNum, description || '', normalizeColours(colours),
    ]
  );
  const shops = await allRecords('SELECT id FROM shops');
  for (const shop of shops) {
    await runQuery('INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, 0) ON CONFLICT(shop_id, product_id) DO NOTHING', [shop.id, result.id]);
  }
  await ensureReference('categories', category);
  await ensureReference('brands', brand);
  for (const colour of normalizeColours(colours)) {
    await ensureReference('colours', colour);
  }
  await audit(req, 'Created product and official price', 'product', result.id, `${displayName} at ${official_price}`);
  res.status(201).json({ id: result.id, name: compatibilityModels, short_name: displayName, full_model_list: compatibilityModels });
});

app.put('/api/products/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  const oldProduct = await getRecord('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!oldProduct) return res.status(404).json({ error: 'Product not found.' });
  const {
    name, short_name, full_model_list, brand, category, official_price,
    purchase_price, sale_price, wholesale_price, retail_price, description, colours, is_active = 1,
  } = req.body;
    const compatibilityModels = String(full_model_list || name || '').trim();
  const displayName = String(short_name || compatibilityModels).trim();

  const parsePrice = (val, fallback = null) => {
    if (val === '' || val === null || val === undefined) return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
  };
  
  const salePriceNum = Number(sale_price ?? official_price);
  if (!compatibilityModels || !displayName || !brand || !category || isNaN(salePriceNum) || salePriceNum <= 0) {
    return res.status(400).json({ error: 'Short name, compatible models, brand, category and a valid sale price are required.' });
  }

  const purchasePriceNum = parsePrice(purchase_price, null);
  const wholesalePriceNum = parsePrice(wholesale_price, null);
  const officialPriceNum = salePriceNum;
  const retailPriceNum = salePriceNum;

  await runQuery(
    `UPDATE products SET
      name = ?, short_name = ?, full_model_list = ?, brand = ?, category = ?, official_price = ?,
      purchase_price = ?, sale_price = ?, wholesale_price = ?, retail_price = ?,
      description = ?, colours = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      compatibilityModels, displayName, compatibilityModels, brand, category, officialPriceNum,
      purchasePriceNum, salePriceNum, wholesalePriceNum, retailPriceNum, description || '', normalizeColours(colours), is_active, req.params.id,
    ]
  );
  await ensureReference('categories', category);
  await ensureReference('brands', brand);
  for (const colour of normalizeColours(colours)) {
    await ensureReference('colours', colour);
  }
  await audit(req, 'Updated official price', 'product', req.params.id, `${oldProduct?.official_price || 0} -> ${official_price}`);
  res.json({ success: true });
});

app.delete('/api/products/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const product = await getRecord('SELECT id, name, short_name FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const history = await getRecord(
      `SELECT
        (SELECT COUNT(*) FROM sales WHERE product_id = ?) AS sale_count,
        (SELECT COUNT(*) FROM stock_requests WHERE product_id = ?) AS request_count,
        (SELECT COUNT(*) FROM stock_transfers WHERE product_id = ?) AS transfer_count`,
      [req.params.id, req.params.id, req.params.id]
    );
    const historyCount = Number(history?.sale_count || 0) + Number(history?.request_count || 0) + Number(history?.transfer_count || 0);
    if (historyCount > 0) {
      return res.status(409).json({
        error: 'This product has sales, request, or transfer history and cannot be deleted.',
      });
    }

    await runTransaction(async (tx) => {
      await tx.runQuery('DELETE FROM inventory_batches WHERE product_id = ?', [req.params.id]);
      await tx.runQuery('DELETE FROM stock WHERE product_id = ?', [req.params.id]);
      await tx.runQuery('DELETE FROM products WHERE id = ?', [req.params.id]);
    });
    await audit(req, 'Deleted product and inventory', 'product', req.params.id, product.short_name || product.name);
    res.json({ success: true });
  } catch (error) {
    console.error('[Products] Delete failed:', error);
    res.status(500).json({ error: 'Unable to delete this product right now.' });
  }
});

app.get('/api/stock', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const requestedShopId = scopeReadableShopId(req);
    const shopId = requestedShopId
      ? await assertShopReadAccess(req, requestedShopId)
      : (isShopStaffRole(req.user.role) ? Number(req.user.shop_id) : null);
    const pagination = parsePagination(req.query);
    const visibility = await getPriceVisibility();
    const extraPrices = req.user.role === 'superadmin'
      ? ', p.purchase_price, p.wholesale_price'
      : `${visibility.show_purchase_price_shopkeeper ? ', p.purchase_price' : ''}${visibility.show_wholesale_price_shopkeeper ? ', p.wholesale_price' : ''}`;
    const officialPrice = req.user.role === 'superadmin' || visibility.show_official_price_shopkeeper ? ', p.official_price' : '';
    const batchJoin = [
      'ib.shop_id = st.shop_id',
      'ib.product_id = st.product_id',
    ];
    const batchParams = [];
    if (hasQueryValue(req.query.colour)) {
      batchJoin.push('LOWER(TRIM(ib.colour)) = LOWER(TRIM(?))');
      batchParams.push(String(req.query.colour).trim());
    }
    if (hasQueryValue(req.query.batch) || hasQueryValue(req.query.batchId)) {
      batchJoin.push('ib.id = ?');
      batchParams.push(Number(req.query.batch || req.query.batchId));
    }
    if (req.user.role === 'superadmin' && hasQueryValue(req.query.shopkeeperId)) {
      batchJoin.push('ib.assigned_user_id = ?');
      batchParams.push(Number(req.query.shopkeeperId));
    }
    if (req.query.ownership === 'owner') batchJoin.push('ib.assigned_user_id IS NULL');
    if (req.query.ownership === 'shopkeeper') batchJoin.push('ib.assigned_user_id IS NOT NULL');
    if (req.query.ownership === 'mine') batchJoin.push(`ib.assigned_user_id = ${Number(req.user.id)}`);
    const where = [];
    const whereParams = [];
    if (shopId) {
      where.push('st.shop_id = ?');
      whereParams.push(shopId);
    }
    appendSearchFilter(where, whereParams, req.query.search, [
      'p.name',
      "COALESCE(p.short_name, '')",
      "COALESCE(p.full_model_list, '')",
      "COALESCE(p.brand, '')",
      "COALESCE(p.category, '')",
      "COALESCE(p.description, '')",
      "COALESCE(sh.name, '')",
    ]);
    appendExactFilter(where, whereParams, req.query.brand, 'p.brand = ?');
    appendExactFilter(where, whereParams, req.query.category, 'LOWER(TRIM(p.category)) = LOWER(TRIM(?))');
    const stockQuantitySql = 'COALESCE(SUM(ib.quantity_remaining), 0)';
    const having = [];
    if (req.query.status === 'in_stock') having.push(`${stockQuantitySql} > 0`);
    if (req.query.status === 'out_of_stock') having.push(`${stockQuantitySql} = 0`);
    const baseSql = `
      FROM stock st
      JOIN products p ON p.id = st.product_id
      JOIN shops sh ON sh.id = st.shop_id
      LEFT JOIN inventory_batches ib ON ${batchJoin.join(' AND ')} ${batchAccessSql(req.user)}
      WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
      GROUP BY st.id, sh.id, p.id
      ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
    `;
    const params = [...batchParams, ...whereParams];
    const rows = await runPaginatedList({
      dataSql: `
      SELECT st.id, st.shop_id, sh.name AS shop_name, sh.location_type, p.id AS product_id, p.name, p.short_name, p.full_model_list,
        p.brand, p.category, p.sale_price, p.retail_price, p.description, p.colours
        ${officialPrice}${extraPrices},
        ${stockQuantitySql} AS quantity,
        COALESCE(SUM(CASE WHEN ib.assigned_user_id IS NULL THEN ib.quantity_remaining ELSE 0 END), 0) AS owner_quantity,
        COALESCE(SUM(CASE WHEN ib.assigned_user_id IS NOT NULL THEN ib.quantity_remaining ELSE 0 END), 0) AS shopkeeper_quantity,
        COALESCE(SUM(CASE WHEN ib.assigned_user_id = ${Number(req.user.id)} THEN ib.quantity_remaining ELSE 0 END), 0) AS my_quantity,
        COUNT(ib.id) FILTER (WHERE ib.quantity_remaining > 0) AS batch_count
      ${baseSql}
      ORDER BY p.brand, COALESCE(p.short_name, p.name)
    `,
      countSql: `SELECT COUNT(*) AS total FROM (SELECT st.id ${baseSql}) counted`,
      params,
      pagination,
      totalKey: 'totalStockItems',
    });
    res.json(rows);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to load stock.' });
  }
});

app.put('/api/stock', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { product_id, quantity, purchase_price, wholesale_price, official_price, retail_price, colour, received_date, notes, assigned_user_id } = req.body;
    if (!product_id || quantity === undefined) return res.status(400).json({ error: 'Product and quantity are required.' });
    const stockQuantity = Number(quantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return res.status(400).json({ error: 'Quantity must be 0 or more.' });
    const effectiveAssignedUserId = isShopStaffRole(req.user.role) ? req.user.id : assigned_user_id || null;
    await runTransaction(async (tx) => {
      // Shopkeepers set only their personal inventory balance. Shared owner
      // stock remains available for sales, but cannot be reduced from here.
      const accessSql = ownedBatchAccessSql(req.user);
      const current = await tx.getRecord(
        `SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity FROM inventory_batches ib WHERE shop_id = ? AND product_id = ? ${accessSql}`,
        [shopId, product_id]
      );
      let delta = stockQuantity - Number(current?.quantity || 0);
      if (delta > 0) {
        const product = await tx.getRecord('SELECT purchase_price, wholesale_price, official_price, retail_price FROM products WHERE id = ?', [product_id]);
        await tx.runQuery(
          `INSERT INTO inventory_batches (
            shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
            colour, quantity_received, quantity_remaining, received_date, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            shopId, product_id, effectiveAssignedUserId, purchase_price ?? product?.purchase_price, wholesale_price ?? product?.wholesale_price,
            official_price ?? product?.official_price, retail_price ?? product?.retail_price, colour || null,
            delta, delta, received_date || today(), notes || 'Stock quantity increase', req.user.id,
          ]
        );
      } else if (delta < 0) {
        let remaining = Math.abs(delta);
        const batches = await tx.allRecords(
          `SELECT id, quantity_remaining FROM inventory_batches ib
           WHERE shop_id = ? AND product_id = ? AND quantity_remaining > 0 ${accessSql}
           ORDER BY received_date ASC, id ASC`,
          [shopId, product_id]
        );
        for (const batch of batches) {
          if (remaining <= 0) break;
          const used = Math.min(remaining, Number(batch.quantity_remaining));
          await tx.runQuery('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [used, batch.id]);
          remaining -= used;
        }
        if (remaining > 0) {
          const error = new Error('Not enough accessible batch stock to set this quantity.');
          error.status = 400;
          throw error;
        }
      }
      await syncStockFromBatches(tx, shopId, product_id);
    });
    await audit(req, 'Updated stock', 'stock', product_id, `Shop ${shopId} quantity ${stockQuantity}`);
    res.json({ success: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to update stock.' });
  }
});

app.get('/api/inventory-batches', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const requestedShopId = scopeReadableShopId(req);
    const shopId = requestedShopId
      ? await assertShopReadAccess(req, requestedShopId)
      : (isShopStaffRole(req.user.role) ? Number(req.user.shop_id) : null);
    const pagination = parsePagination(req.query);
    const visibility = await getPriceVisibility();
    const costs = req.user.role === 'superadmin'
      ? 'ib.purchase_price, ib.wholesale_price,'
      : `${visibility.show_purchase_price_shopkeeper ? 'ib.purchase_price,' : ''}${visibility.show_wholesale_price_shopkeeper ? 'ib.wholesale_price,' : ''}`;
    const official = req.user.role === 'superadmin' || visibility.show_official_price_shopkeeper ? 'ib.official_price,' : '';
    const params = [];
    const where = [];
    if (shopId) {
      where.push('ib.shop_id = ?');
      params.push(shopId);
    }
    if (isShopStaffRole(req.user.role)) {
      where.push(`(ib.assigned_user_id IS NULL OR ib.assigned_user_id = ${Number(req.user.id)})`);
    }
    appendSearchFilter(where, params, req.query.search, [
      'p.name',
      "COALESCE(p.short_name, '')",
      "COALESCE(p.full_model_list, '')",
      "COALESCE(p.brand, '')",
      "COALESCE(p.category, '')",
      "COALESCE(ib.colour, '')",
      "COALESCE(u.name, '')",
      "COALESCE(sh.name, '')",
    ]);
    appendExactFilter(where, params, req.query.brand, 'p.brand = ?');
    appendExactFilter(where, params, req.query.category, 'LOWER(TRIM(p.category)) = LOWER(TRIM(?))');
    appendExactFilter(where, params, req.query.colour, 'LOWER(TRIM(ib.colour)) = LOWER(TRIM(?))');
    if (hasQueryValue(req.query.batch) || hasQueryValue(req.query.batchId)) {
      where.push('ib.id = ?');
      params.push(Number(req.query.batch || req.query.batchId));
    }
    if (req.user.role === 'superadmin' && hasQueryValue(req.query.shopkeeperId)) {
      where.push('ib.assigned_user_id = ?');
      params.push(Number(req.query.shopkeeperId));
    }
    if (req.query.ownership === 'owner') where.push('ib.assigned_user_id IS NULL');
    if (req.query.ownership === 'shopkeeper') where.push('ib.assigned_user_id IS NOT NULL');
    if (req.query.ownership === 'mine') where.push(`ib.assigned_user_id = ${Number(req.user.id)}`);
    if (req.query.status === 'in_stock') where.push('ib.quantity_remaining > 0');
    if (req.query.status === 'out_of_stock') where.push('ib.quantity_remaining = 0');
    appendDateRangeFilter(where, params, req.query.dateFrom || req.query.from, req.query.dateTo || req.query.to, 'ib.received_date');
    const baseSql = `
      FROM inventory_batches ib
      JOIN products p ON p.id = ib.product_id
      JOIN shops sh ON sh.id = ib.shop_id
      LEFT JOIN users u ON u.id = ib.assigned_user_id
      WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
    `;
    const rows = await runPaginatedList({
      dataSql: `
      SELECT ib.id, ib.shop_id, ib.product_id, ib.assigned_user_id, ${costs}${official}
        ib.retail_price, ib.colour, ib.quantity_received, ib.quantity_remaining, ib.received_date, ib.notes, ib.created_at,
        p.name, p.short_name, p.full_model_list, p.brand, p.category, sh.name AS shop_name, sh.location_type, u.name AS assigned_user_name
      ${baseSql}
      ORDER BY p.brand, COALESCE(p.short_name, p.name), ib.received_date, ib.id
    `,
      countSql: `SELECT COUNT(*) AS total ${baseSql}`,
      params,
      pagination,
      totalKey: 'totalBatches',
    });
    res.json(rows);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to load inventory batches.' });
  }
});

app.post('/api/inventory-batches', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const {
      product_id, quantity, purchase_price, wholesale_price, official_price, retail_price,
      colour, received_date, notes, assigned_user_id,
    } = req.body;
    const batchQuantity = Number(quantity);
    if (!product_id || !Number.isInteger(batchQuantity) || batchQuantity <= 0) {
      return res.status(400).json({ error: 'Product and a batch quantity of at least 1 are required.' });
    }
    const effectiveAssignedUserId = isShopStaffRole(req.user.role) ? req.user.id : assigned_user_id || null;
    if (effectiveAssignedUserId) {
      const assigned = await getRecord("SELECT id FROM users WHERE id = ? AND shop_id = ? AND role IN ('shopkeeper', 'admin')", [effectiveAssignedUserId, shopId]);
      if (!assigned) return res.status(400).json({ error: 'Assigned shopkeeper must belong to the selected shop.' });
    }
    const result = await runTransaction(async (tx) => {
      const product = await tx.getRecord('SELECT purchase_price, wholesale_price, official_price, retail_price FROM products WHERE id = ?', [product_id]);
      if (!product) {
        const error = new Error('Product not found.');
        error.status = 404;
        throw error;
      }
      const inserted = await tx.runQuery(
        `INSERT INTO inventory_batches (
          shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
          colour, quantity_received, quantity_remaining, received_date, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId, product_id, effectiveAssignedUserId, purchase_price ?? product.purchase_price, wholesale_price ?? product.wholesale_price,
          official_price ?? product.official_price, retail_price ?? product.retail_price, colour || null,
          batchQuantity, batchQuantity, received_date || today(), notes || '', req.user.id,
        ]
      );
      await syncStockFromBatches(tx, shopId, product_id);
      return inserted;
    });
    await audit(req, 'Added inventory price batch', 'inventory_batch', result.id, `${batchQuantity} units for product ${product_id}`);
    res.status(201).json({ id: result.id });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to add inventory batch.' });
  }
});

app.get('/api/customers', authenticateToken, requireShopStaff, async (req, res) => {
  const requestedShopId = scopeShopId(req);
  const shopId = requestedShopId ? assertShopAccess(req, requestedShopId) : null;
  const pagination = parsePagination(req.query);
  const params = [];
  const where = ['1 = 1'];
  if (shopId) {
    where.push('c.shop_id = ?');
    params.push(shopId);
  }
  appendSearchFilter(where, params, req.query.search, [
    'c.name',
    "COALESCE(c.mobile, '')",
    "COALESCE(c.address, '')",
    "COALESCE(c.notes, '')",
    "COALESCE(sh.name, '')",
  ]);
  appendDateRangeFilter(where, params, req.query.dateFrom || req.query.from, req.query.dateTo || req.query.to, 'c.created_at');
  if (isShopStaffRole(req.user.role)) {
    where.push('(c.created_by IS NULL OR c.created_by = ?)');
    params.push(req.user.id);
  }
  const pendingSql = 'COALESCE(SUM(s.pending_amount), 0)';
  const having = [];
  if (req.query.status === 'pending') having.push(`${pendingSql} > 0`);
  if (req.query.status === 'paid') having.push(`${pendingSql} = 0`);
  const baseSql = `
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
    LEFT JOIN shops sh ON sh.id = c.shop_id
    WHERE ${where.join(' AND ')}
    GROUP BY c.id, sh.id
    ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
  `;
  const rows = await runPaginatedList({
    dataSql: `
    SELECT c.*, sh.name AS shop_name, COALESCE(SUM(s.pending_amount), 0) AS pending
    ${baseSql}
    ORDER BY c.created_at DESC
  `,
    countSql: `SELECT COUNT(*) AS total FROM (SELECT c.id ${baseSql}) counted`,
    params,
    pagination,
    totalKey: 'totalCustomers',
  });
  res.json(rows);
});

app.post('/api/customers', authenticateToken, requireShopStaff, async (req, res) => {
    try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { name, mobile, address, notes } = req.body;
    if (!name || !mobile) return res.status(400).json({ error: 'Customer name and mobile are required.' });
    const existing = await getRecord('SELECT * FROM customers WHERE shop_id = ? AND mobile = ?', [shopId, mobile]);
    if (existing) {
      return res.status(200).json(existing);
    }
    const result = await runQuery(
      'INSERT INTO customers (shop_id, name, mobile, address, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [shopId, name, mobile, address || '', notes || '', req.user.id]
    );
    await audit(req, 'Created customer', 'customer', result.id, name);
    res.status(201).json({ id: result.id, shop_id: shopId, name, mobile, address, notes });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to create customer.' });
  }
});

app.get('/api/sales', authenticateToken, requireShopStaff, async (req, res) => {
  const requestedShopId = scopeShopId(req);
  const shopId = requestedShopId ? assertShopAccess(req, requestedShopId) : null;
  const pagination = parsePagination(req.query);
  const params = [];
  const where = ['1 = 1'];
  if (shopId) {
    where.push('sa.shop_id = ?');
    params.push(shopId);
  }
  appendSearchFilter(where, params, req.query.search, [
    "COALESCE(c.name, '')",
    "COALESCE(c.mobile, '')",
    'p.name',
    "COALESCE(p.short_name, '')",
    "COALESCE(p.full_model_list, '')",
    "COALESCE(p.brand, '')",
    "COALESCE(p.category, '')",
    "COALESCE(sh.name, '')",
    "COALESCE(sa.price_type, '')",
    "COALESCE(sa.payment_mode, '')",
  ]);
  appendExactFilter(where, params, req.query.priceType, 'sa.price_type = ?');
  appendExactFilter(where, params, req.query.paymentMode, 'sa.payment_mode = ?');
  appendExactFilter(where, params, req.query.status, 'sa.status = ?');
  if (hasQueryValue(req.query.customerId)) {
    where.push('sa.customer_id = ?');
    params.push(Number(req.query.customerId));
  }
  if (hasQueryValue(req.query.productId)) {
    where.push('sa.product_id = ?');
    params.push(Number(req.query.productId));
  }
  if (hasQueryValue(req.query.date)) {
    where.push('sa.sale_date = ?');
    params.push(String(req.query.date).slice(0, 10));
  } else {
    appendDateRangeFilter(where, params, req.query.dateFrom || req.query.from, req.query.dateTo || req.query.to, 'sa.sale_date');
  }
  if (isShopStaffRole(req.user.role)) {
    where.push('(sa.created_by IS NULL OR sa.created_by = ?)');
    params.push(req.user.id);
  }
  const baseSql = `
    FROM sales sa
    JOIN products p ON p.id = sa.product_id
    JOIN shops sh ON sh.id = sa.shop_id
    LEFT JOIN customers c ON c.id = sa.customer_id
    WHERE ${where.join(' AND ')}
  `;
  const rows = await runPaginatedList({
    dataSql: `
    SELECT sa.*, p.name AS product_name, p.short_name AS product_short_name, p.full_model_list, p.brand, p.category, p.description,
      c.name AS customer_name, c.mobile, c.address,
      sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone
    ${baseSql}
    ORDER BY sa.id DESC
  `,
    countSql: `SELECT COUNT(*) AS total ${baseSql}`,
    params,
    pagination,
    totalKey: 'totalSales',
  });
  res.json(rows);
});

app.get('/api/customer-invoice', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const customerId = Number(req.query.customerId);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Choose a valid customer.' });
    }

    const customer = await getRecord(`
      SELECT c.*, sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone
      FROM customers c
      JOIN shops sh ON sh.id = c.shop_id
      WHERE c.id = ?
    `, [customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const shopId = requireScopedShopId(req, req.query.shopId || customer.shop_id);
    if (Number(customer.shop_id) !== shopId) {
      return res.status(403).json({ error: 'This customer belongs to another branch.' });
    }

    const params = [shopId, customer.mobile];
    let query = `
      SELECT sa.*, p.name AS product_name, p.short_name AS product_short_name, p.full_model_list, p.brand, p.category, p.description,
        c.name AS customer_name, c.mobile, c.address,
        sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone
      FROM sales sa
      JOIN products p ON p.id = sa.product_id
      JOIN customers c ON c.id = sa.customer_id
      JOIN shops sh ON sh.id = sa.shop_id
      WHERE sa.shop_id = ? AND c.mobile = ?
    `;
    if (isShopStaffRole(req.user.role)) {
      query += ' AND (sa.created_by IS NULL OR sa.created_by = ?)';
      params.push(req.user.id);
    }
    query += ' ORDER BY sa.sale_date ASC, sa.id ASC';

    const sales = await allRecords(query, params);
    if (!sales.length) return res.status(404).json({ error: 'No purchases found for this customer.' });

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        mobile: customer.mobile,
        address: customer.address,
      },
      shop: {
        id: customer.shop_id,
        name: customer.shop_name,
        area: customer.shop_area,
        address: customer.shop_address,
        phone: customer.shop_phone,
      },
      sales,
      totals: {
        quantity: sales.reduce((sum, sale) => sum + money(sale.quantity), 0),
        total_amount: sales.reduce((sum, sale) => sum + money(sale.total_amount), 0),
        paid_amount: sales.reduce((sum, sale) => sum + money(sale.paid_amount), 0),
        pending_amount: sales.reduce((sum, sale) => sum + money(sale.pending_amount), 0),
      },
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to prepare the customer invoice.' });
  }
});

app.post('/api/sales', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { customer_id, paid_amount, due_date, notes, payment_mode = 'cash' } = req.body;
    const items = Array.isArray(req.body.items) && req.body.items.length
      ? req.body.items
      : [{ product_id: req.body.product_id, quantity: req.body.quantity ?? 1, batch_id: req.body.batch_id, price_type: req.body.price_type }];
    if (!customer_id || items.some((item) => !item.product_id || !['retail', 'wholesale'].includes(item.price_type))) {
      return res.status(400).json({ error: 'Customer, products and selling price types are required.' });
    }

    const result = await runTransaction(async (tx) => {
      const preparedItems = [];
      const reservedByBatch = new Map();
      for (const item of items) {
        const saleQuantity = Number(item.quantity);
        if (!Number.isInteger(saleQuantity) || saleQuantity <= 0) {
          const error = new Error('Every item quantity must be at least 1.');
          error.status = 400;
          throw error;
        }
        const product = await tx.getRecord('SELECT short_name, name, sale_price, wholesale_price FROM products WHERE id = ?', [item.product_id]);
        const unitPrice = money(item.price_type === 'wholesale' ? product?.wholesale_price : product?.sale_price);
        if (!product || unitPrice <= 0) {
          const error = new Error(`${item.price_type === 'wholesale' ? 'Wholesale' : 'Retail'} price is not set for ${product?.short_name || product?.name || 'this product'}.`);
          error.status = 400;
          throw error;
        }
        const batches = await tx.allRecords(
          `SELECT id, purchase_price, quantity_remaining FROM inventory_batches ib
           WHERE shop_id = ? AND product_id = ? AND quantity_remaining > 0
             ${item.batch_id ? 'AND id = ?' : ''}${batchAccessSql(req.user)}
           ORDER BY received_date ASC, id ASC`,
          item.batch_id ? [shopId, item.product_id, item.batch_id] : [shopId, item.product_id]
        );
        const availableBatches = batches.map((batch) => ({
          ...batch,
          quantity_remaining: Math.max(Number(batch.quantity_remaining || 0) - Number(reservedByBatch.get(batch.id) || 0), 0),
        })).filter((batch) => batch.quantity_remaining > 0);
        const available = availableBatches.reduce((sum, batch) => sum + batch.quantity_remaining, 0);
        if (available < saleQuantity) {
          const error = new Error(`Not enough stock for ${product.short_name || product.name}.`);
          error.status = 400;
          throw error;
        }
        let toReserve = saleQuantity;
        const reservedBatches = [];
        for (const batch of availableBatches) {
          if (toReserve <= 0) break;
          const reserved = Math.min(toReserve, batch.quantity_remaining);
          reservedByBatch.set(batch.id, Number(reservedByBatch.get(batch.id) || 0) + reserved);
          reservedBatches.push({ ...batch, quantity_remaining: reserved });
          toReserve -= reserved;
        }
        preparedItems.push({ ...item, saleQuantity, saleTotal: unitPrice * saleQuantity, batches: reservedBatches });
      }

      const totalAmount = preparedItems.reduce((sum, item) => sum + item.saleTotal, 0);
      if (money(paid_amount) > totalAmount) {
        const error = new Error('Paid amount cannot exceed the sale total.');
        error.status = 400;
        throw error;
      }

      let remainingPaid = money(paid_amount);
      const saleIds = [];
      let totalPending = 0;
      for (const item of preparedItems) {
        const itemPaid = Math.min(remainingPaid, item.saleTotal);
        remainingPaid -= itemPaid;
        const pending = Math.max(item.saleTotal - itemPaid, 0);
        totalPending += pending;
        const insertResult = await tx.runQuery(
          'INSERT INTO sales (shop_id, product_id, customer_id, quantity, total_amount, paid_amount, pending_amount, due_date, sale_date, notes, status, created_by, payment_mode, price_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [shopId, item.product_id, customer_id, item.saleQuantity, item.saleTotal, itemPaid, pending, due_date || '', today(), notes || '', pending > 0 ? 'open' : 'paid', req.user.id, payment_mode, item.price_type]
        );
        saleIds.push(insertResult.id);
        let remaining = item.saleQuantity;
        for (const batch of item.batches) {
          if (remaining <= 0) break;
          const allocated = Math.min(remaining, Number(batch.quantity_remaining));
          await tx.runQuery('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [allocated, batch.id]);
          await tx.runQuery(
            'INSERT INTO sale_batch_allocations (sale_id, batch_id, quantity, purchase_price) VALUES (?, ?, ?, ?)',
            [insertResult.id, batch.id, allocated, batch.purchase_price]
          );
          remaining -= allocated;
        }
        await syncStockFromBatches(tx, shopId, item.product_id);
        if (itemPaid > 0) {
          await tx.runQuery('INSERT INTO payments (sale_id, amount, payment_date, note) VALUES (?, ?, ?, ?)', [insertResult.id, itemPaid, today(), 'Initial sale payment']);
        }
      }
      return { ids: saleIds, pending_amount: totalPending };
    });

    await audit(req, 'Created sale', 'sale', result.ids[0], `${result.ids.length} item(s), pending ${result.pending_amount}`);
    res.status(201).json({ ids: result.ids, pending_amount: result.pending_amount });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to create sale.' });
  }
});

app.delete('/api/sales/:id', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) return res.status(400).json({ error: 'Choose a valid sale.' });

    const result = await runTransaction(async (tx) => {
      const sale = await tx.getRecord(
        `SELECT sa.*, p.short_name, p.name AS product_name
         FROM sales sa
         JOIN products p ON p.id = sa.product_id
         WHERE sa.id = ?`,
        [saleId]
      );
      if (!sale) {
        const error = new Error('Sale not found.');
        error.status = 404;
        throw error;
      }
      if (isShopStaffRole(req.user.role) && (Number(sale.shop_id) !== Number(req.user.shop_id) || Number(sale.created_by) !== Number(req.user.id))) {
        const error = new Error('You can only delete sales created by your login.');
        error.status = 403;
        throw error;
      }

      const allocations = await tx.allRecords(
        'SELECT batch_id, quantity FROM sale_batch_allocations WHERE sale_id = ?',
        [saleId]
      );
      for (const allocation of allocations) {
        await tx.runQuery(
          'UPDATE inventory_batches SET quantity_remaining = quantity_remaining + ? WHERE id = ?',
          [allocation.quantity, allocation.batch_id]
        );
      }
      await tx.runQuery('DELETE FROM payments WHERE sale_id = ?', [saleId]);
      await tx.runQuery('DELETE FROM sale_batch_allocations WHERE sale_id = ?', [saleId]);
      await tx.runQuery('DELETE FROM sales WHERE id = ?', [saleId]);
      await syncStockFromBatches(tx, sale.shop_id, sale.product_id);
      return sale;
    });

    await audit(req, 'Deleted sale and restored stock', 'sale', saleId, `${result.short_name || result.product_name}, quantity ${result.quantity}`);
    res.json({ success: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to delete this sale.' });
  }
});

app.get('/api/stock-requests', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = isShopStaffRole(req.user.role) ? req.user.shop_id : scopeShopId(req);
    const visibleBatchAccess = batchAccessSql(req.user);
    const totalAvailableShopScope = isShopStaffRole(req.user.role) ? 'AND ib.shop_id = sr.shop_id' : '';
    const visibility = await getPriceVisibility();
    const officialPriceColumn = req.user.role === 'superadmin' || visibility.show_official_price_shopkeeper ? ', p.official_price' : '';
    const rows = await allRecords(`
      SELECT sr.*, sh.name AS shop_name, sh.area AS shop_area, p.name AS product_name, p.short_name AS product_short_name, p.brand${officialPriceColumn},
        u.name AS created_by_name,
        COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.shop_id = sr.shop_id AND ib.product_id = sr.product_id ${visibleBatchAccess}), 0) AS shop_quantity,
        COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = sr.product_id ${totalAvailableShopScope} ${visibleBatchAccess}), 0) AS total_available
      FROM stock_requests sr
      JOIN shops sh ON sh.id = sr.shop_id
      LEFT JOIN products p ON p.id = sr.product_id
      LEFT JOIN users u ON u.id = sr.created_by
      ${shopId ? 'WHERE sr.shop_id = ?' : ''}
      ORDER BY CASE sr.status WHEN 'open' THEN 0 WHEN 'sent' THEN 1 ELSE 2 END, sr.id DESC
    `, shopId ? [shopId] : []);
    res.json(rows);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to load stock requests.' });
  }
});

app.post('/api/stock-requests', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { product_id, model_name, quantity = 1, message } = req.body;
    const requestQuantity = Number(quantity);
    if ((!product_id && !String(model_name || '').trim()) || !Number.isInteger(requestQuantity) || requestQuantity <= 0) {
      return res.status(400).json({ error: 'Choose a product or enter a model name, plus a valid quantity.' });
    }
    const result = await runQuery(
      'INSERT INTO stock_requests (shop_id, product_id, model_name, quantity, message, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [shopId, product_id || null, String(model_name || '').trim(), requestQuantity, message || '', req.user.id]
    );
    await audit(req, 'Created stock request', 'stock_request', result.id, `${requestQuantity} units requested`);
    res.status(201).json({ id: result.id });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to create stock request.' });
  }
});

app.put('/api/stock-requests/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  const allowed = new Set(['open', 'sent', 'closed', 'cancelled']);
  const status = String(req.body.status || '').toLowerCase();
  if (!allowed.has(status)) return res.status(400).json({ error: 'Choose a valid request status.' });
  await runQuery(
    'UPDATE stock_requests SET status = ?, resolved_at = CASE WHEN ? IN ("closed", "cancelled") THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id = ?',
    [status, status, req.params.id]
  );
  await audit(req, 'Updated stock request', 'stock_request', req.params.id, status);
  res.json({ success: true });
});

app.get('/api/pending-payments', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = isShopStaffRole(req.user.role) ? req.user.shop_id : scopeShopId(req);
  const pagination = parsePagination(req.query);
  const params = [];
  if (shopId) params.push(shopId);
  const where = [`sa.pending_amount > 0 ${shopId ? 'AND sa.shop_id = ?' : ''}`];
  appendSearchFilter(where, params, req.query.search, [
    "COALESCE(c.name, '')",
    "COALESCE(c.mobile, '')",
    'p.name',
    "COALESCE(p.short_name, '')",
    "COALESCE(p.full_model_list, '')",
    "COALESCE(p.brand, '')",
    "COALESCE(p.category, '')",
    "COALESCE(sh.name, '')",
  ]);
  if (hasQueryValue(req.query.date)) {
    where.push('sa.due_date = ?');
    params.push(String(req.query.date).slice(0, 10));
  } else {
    appendDateRangeFilter(where, params, req.query.dateFrom || req.query.from, req.query.dateTo || req.query.to, 'sa.due_date');
  }
  if (isShopStaffRole(req.user.role)) {
    where.push('(sa.created_by IS NULL OR sa.created_by = ?)');
    params.push(req.user.id);
  }
  const groupOrderSql = "NULLIF(sa.due_date, '') ASC NULLS LAST, sa.id ASC";
  const baseSql = `
    FROM sales sa
    JOIN products p ON p.id = sa.product_id
    JOIN customers c ON c.id = sa.customer_id
    JOIN shops sh ON sh.id = sa.shop_id
    WHERE ${where.join(' AND ')}
    GROUP BY sa.shop_id, COALESCE(c.mobile, c.id::TEXT)
  `;
  const rows = await runPaginatedList({
    dataSql: `
    SELECT
      'customer-' || sa.shop_id || ':' || COALESCE(c.mobile, c.id::TEXT) AS id,
      (ARRAY_AGG(c.id ORDER BY ${groupOrderSql}))[1] AS customer_id,
      sa.shop_id,
      (ARRAY_AGG(c.name ORDER BY ${groupOrderSql}))[1] AS customer_name,
      (ARRAY_AGG(c.mobile ORDER BY ${groupOrderSql}))[1] AS mobile,
      (ARRAY_AGG(c.address ORDER BY ${groupOrderSql}))[1] AS address,
      (ARRAY_AGG(sh.name ORDER BY ${groupOrderSql}))[1] AS shop_name,
      (ARRAY_AGG(sh.area ORDER BY ${groupOrderSql}))[1] AS shop_area,
      (ARRAY_AGG(sh.address ORDER BY ${groupOrderSql}))[1] AS shop_address,
      (ARRAY_AGG(sh.phone ORDER BY ${groupOrderSql}))[1] AS shop_phone,
      COALESCE(SUM(sa.total_amount), 0) AS total_amount,
      COALESCE(SUM(sa.paid_amount), 0) AS paid_amount,
      COALESCE(SUM(sa.pending_amount), 0) AS pending_amount,
      (ARRAY_AGG(NULLIF(sa.due_date, '') ORDER BY ${groupOrderSql}))[1] AS due_date,
      JSON_AGG(JSON_BUILD_OBJECT(
        'id', sa.id,
        'shop_id', sa.shop_id,
        'product_id', sa.product_id,
        'customer_id', sa.customer_id,
        'quantity', sa.quantity,
        'total_amount', sa.total_amount,
        'paid_amount', sa.paid_amount,
        'pending_amount', sa.pending_amount,
        'due_date', sa.due_date,
        'sale_date', sa.sale_date,
        'notes', sa.notes,
        'status', sa.status,
        'created_by', sa.created_by,
        'payment_mode', sa.payment_mode,
        'price_type', sa.price_type,
        'product_name', p.name,
        'product_short_name', p.short_name,
        'full_model_list', p.full_model_list,
        'brand', p.brand,
        'category', p.category,
        'description', p.description,
        'customer_name', c.name,
        'mobile', c.mobile,
        'address', c.address,
        'shop_name', sh.name,
        'shop_area', sh.area,
        'shop_address', sh.address,
        'shop_phone', sh.phone,
        'display_name', COALESCE(p.short_name, p.name)
      ) ORDER BY ${groupOrderSql}) AS items
    ${baseSql}
    ORDER BY due_date ASC NULLS LAST, pending_amount DESC
  `,
    countSql: `SELECT COUNT(*) AS total FROM (SELECT 1 ${baseSql}) counted`,
    params,
    pagination,
    totalKey: 'totalPendingCustomers',
  });
  res.json(rows);
});

app.post('/api/payments', authenticateToken, requireShopStaff, async (req, res) => {
  const { sale_id, customer_id, shop_id, amount, note } = req.body;
  if ((!sale_id && !customer_id) || !amount) return res.status(400).json({ error: 'Customer or sale and amount are required.' });
  const paymentAmount = money(amount);
  if (paymentAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero.' });

    if (customer_id) {
    try {
      const userShopId = isShopStaffRole(req.user.role) ? Number(req.user.shop_id) : (shop_id ? Number(shop_id) : null);
      const result = await runTransaction(async (tx) => {
        let query = `
          SELECT s.*
          FROM sales s
          JOIN customers c ON c.id = s.customer_id
          WHERE c.mobile = (SELECT mobile FROM customers WHERE id = ?)
            AND s.pending_amount > 0
        `;
        const params = [customer_id];
        if (userShopId) {
          query += ' AND s.shop_id = ?';
          params.push(userShopId);
        }
        if (isShopStaffRole(req.user.role)) {
          query += ' AND (s.created_by IS NULL OR s.created_by = ?)';
          params.push(req.user.id);
        }
        query += ' ORDER BY s.due_date ASC, s.id ASC';

        const sales = await tx.allRecords(query, params);
        const totalPending = sales.reduce((sum, sale) => sum + money(sale.pending_amount), 0);
        if (!sales.length) {
          const error = new Error('No pending sales found for this customer.');
          error.status = 404;
          throw error;
        }
        if (paymentAmount > totalPending) {
          const error = new Error(`Payment cannot exceed the pending balance of ${totalPending}.`);
          error.status = 400;
          throw error;
        }
        let remainingPayment = paymentAmount;
        for (const sale of sales) {
          if (remainingPayment <= 0) break;
          const allocated = Math.min(remainingPayment, money(sale.pending_amount));
          const newPaid = money(sale.paid_amount) + allocated;
          const newPending = Math.max(money(sale.total_amount) - newPaid, 0);
          await tx.runQuery('INSERT INTO payments (sale_id, amount, payment_date, note) VALUES (?, ?, ?, ?)', [sale.id, allocated, today(), note || 'Customer balance payment']);
          await tx.runQuery('UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?', [newPaid, newPending, newPending > 0 ? 'open' : 'paid', sale.id]);
          remainingPayment -= allocated;
        }
        return { pending_amount: totalPending - paymentAmount };
      });
      await audit(req, 'Recorded customer payment', 'customer', customer_id, `Paid ${paymentAmount}, remaining ${result.pending_amount}`);
      return res.json({ success: true, pending_amount: result.pending_amount });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Unable to record customer payment.' });
    }
  }

  const sale = await getRecord('SELECT * FROM sales WHERE id = ?', [sale_id]);
  if (!sale) return res.status(404).json({ error: 'Sale not found.' });
  if (isShopStaffRole(req.user.role) && Number(req.user.shop_id) !== Number(sale.shop_id)) {
    return res.status(403).json({ error: 'This sale belongs to another branch.' });
  }

  if (paymentAmount > money(sale.pending_amount)) return res.status(400).json({ error: 'Payment cannot exceed the pending balance.' });
  const newPaid = money(sale.paid_amount) + paymentAmount;
  const newPending = Math.max(money(sale.total_amount) - newPaid, 0);
  await runQuery('INSERT INTO payments (sale_id, amount, payment_date, note) VALUES (?, ?, ?, ?)', [sale_id, paymentAmount, today(), note || 'Payment update']);
  await runQuery('UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?', [newPaid, newPending, newPending > 0 ? 'open' : 'paid', sale_id]);
  await audit(req, 'Recorded payment', 'sale', sale_id, `Paid ${paymentAmount}, remaining ${newPending}`);
  res.json({ success: true, pending_amount: newPending });
});

app.post('/api/stock-transfer', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { from_shop_id, to_shop_id, product_id, quantity, note } = req.body;
  if (!from_shop_id || !to_shop_id || !product_id || !quantity) return res.status(400).json({ error: 'Transfer details are required.' });
  
  try {
    const result = await runTransaction(async (tx) => {
      const transferQuantity = Number(quantity);
      const batches = await tx.allRecords(
        `SELECT * FROM inventory_batches
         WHERE shop_id = ? AND product_id = ? AND quantity_remaining > 0
         ORDER BY received_date ASC, id ASC`,
        [from_shop_id, product_id]
      );
      if (!Number.isInteger(transferQuantity) || transferQuantity <= 0 || batches.reduce((sum, batch) => sum + Number(batch.quantity_remaining), 0) < transferQuantity) {
        const error = new Error('Source shop does not have enough stock.');
        error.status = 400;
        throw error;
      }
      let remaining = transferQuantity;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const moved = Math.min(remaining, Number(batch.quantity_remaining));
        await tx.runQuery('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [moved, batch.id]);
        await tx.runQuery(
          `INSERT INTO inventory_batches (
            shop_id, product_id, purchase_price, wholesale_price, official_price, retail_price, colour,
            quantity_received, quantity_remaining, received_date, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            to_shop_id, product_id, batch.purchase_price, batch.wholesale_price, batch.official_price, batch.retail_price,
            batch.colour, moved, moved, today(), `Transferred from shop ${from_shop_id}. ${note || ''}`.trim(), req.user.id,
          ]
        );
        remaining -= moved;
      }
      await syncStockFromBatches(tx, from_shop_id, product_id);
      await syncStockFromBatches(tx, to_shop_id, product_id);
      const insertResult = await tx.runQuery(
        'INSERT INTO stock_transfers (from_shop_id, to_shop_id, product_id, quantity, transfer_date, note) VALUES (?, ?, ?, ?, ?, ?)',
        [from_shop_id, to_shop_id, product_id, transferQuantity, today(), note || '']
      );
      return { id: insertResult.id };
    });

    await audit(req, 'Transferred stock', 'stock_transfer', result.id, `${quantity} units from ${from_shop_id} to ${to_shop_id}`);
    res.status(201).json({ id: result.id });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to transfer stock.' });
  }
});

app.get('/api/catalog', async (req, res) => {
  const { shopId, search = '', brand = '', category = '', colour = '', min = 0, max = 9999999 } = req.query;
  const minPrice = String(min).trim() === '' || !Number.isFinite(Number(min)) ? 0 : Number(min);
  const maxPrice = String(max).trim() === '' || !Number.isFinite(Number(max)) ? 9999999 : Number(max);
  const rows = await allRecords(`
    SELECT p.id, p.name, p.short_name, p.full_model_list, p.brand, p.category,
      p.retail_price, p.description, p.colours,
      STRING_AGG(CASE WHEN st.quantity > 0 THEN sh.name || ' (' || st.quantity || ')' END, ', ') AS available_shops,
      COALESCE(SUM(st.quantity), 0) AS total_available
    FROM products p
    LEFT JOIN stock st ON st.product_id = p.id ${shopId ? 'AND st.shop_id = ?' : ''}
    LEFT JOIN shops sh ON sh.id = st.shop_id
    WHERE p.is_active = 1
      AND p.name IS NOT NULL
      AND (p.name ILIKE ? OR COALESCE(p.short_name, '') ILIKE ? OR COALESCE(p.full_model_list, '') ILIKE ? OR p.brand ILIKE ?)
      AND (? = '' OR p.brand = ?)
      AND (? = '' OR LOWER(TRIM(p.category)) = LOWER(TRIM(?)))
      AND (? = '' OR EXISTS (
        SELECT 1 FROM UNNEST(p.colours) AS product_colour
        WHERE LOWER(TRIM(product_colour)) = LOWER(TRIM(?))
      ))
      AND p.retail_price BETWEEN ? AND ?
    GROUP BY p.id
    ORDER BY p.brand, COALESCE(p.short_name, p.name)
  `, [
    ...(shopId ? [shopId] : []),
    `%${search}%`,
    `%${search}%`,
    `%${search}%`,
    `%${search}%`,
    brand,
    brand,
    category,
    category,
    colour,
    colour,
    minPrice,
    maxPrice,
  ]);
  res.json(rows);
});

app.get('/api/reports', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = isShopStaffRole(req.user.role) ? req.user.shop_id : scopeShopId(req);
  const pagination = parsePagination(req.query);
  const pendingByShop = await allRecords(`
    SELECT sh.name AS shop_name, COALESCE(SUM(sa.pending_amount), 0) AS pending
    FROM shops sh
    LEFT JOIN sales sa ON sa.shop_id = sh.id
    ${shopId ? 'WHERE sh.id = ?' : ''}
    GROUP BY sh.id
    ORDER BY pending DESC
  `, shopId ? [shopId] : []);
  const availabilityParams = [];
  const availabilityWhere = ['st.quantity > 0'];
  if (shopId) {
    availabilityWhere.push('st.shop_id = ?');
    availabilityParams.push(shopId);
  }
  appendSearchFilter(availabilityWhere, availabilityParams, req.query.search, [
    'p.name',
    "COALESCE(p.short_name, '')",
    "COALESCE(p.full_model_list, '')",
    "COALESCE(p.brand, '')",
    "COALESCE(p.category, '')",
    "COALESCE(sh.name, '')",
  ]);
  appendExactFilter(availabilityWhere, availabilityParams, req.query.brand, 'p.brand = ?');
  appendExactFilter(availabilityWhere, availabilityParams, req.query.category, 'LOWER(TRIM(p.category)) = LOWER(TRIM(?))');
  const availabilityBaseSql = `
    FROM stock st
    JOIN products p ON p.id = st.product_id
    JOIN shops sh ON sh.id = st.shop_id
    WHERE ${availabilityWhere.join(' AND ')}
  `;
  const availability = await runPaginatedList({
    dataSql: `
    SELECT p.name, p.short_name, p.full_model_list, p.brand, sh.name AS shop_name, st.quantity
    ${availabilityBaseSql}
    ORDER BY p.name, sh.name
  `,
    countSql: `SELECT COUNT(*) AS total ${availabilityBaseSql}`,
    params: availabilityParams,
    pagination,
    totalKey: 'totalAvailability',
  });
  const auditRows = isShopStaffRole(req.user.role)
    ? await allRecords("SELECT * FROM audit_logs WHERE actor_id = ? AND action = 'Created sale' ORDER BY id DESC LIMIT 25", [req.user.id])
    : await allRecords('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 25');
  res.json({ pendingByShop, availability, auditRows });
});

app.delete('/api/reports/audit', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM audit_logs');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear audit logs.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Multi-shop API is live on http://localhost:${PORT}`);
});
