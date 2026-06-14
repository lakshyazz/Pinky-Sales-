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
const getProductsForRole = async (role) => {
  const columns = await productColumnsForRole(role);
  return allRecords(`SELECT ${columns} FROM products WHERE is_active = 1 AND name IS NOT NULL ORDER BY brand, COALESCE(short_name, name)`);
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
      SELECT p.id, p.name, p.short_name, p.full_model_list, p.brand, p.category, p.official_price, p.sale_price,
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

app.post('/api/reference-data/:type', authenticateToken, requireSuperAdmin, async (req, res) => {
  const tables = { categories: 'categories', colours: 'colours', brands: 'brands' };
  const table = tables[req.params.type];
  const name = String(req.body.name || '').trim();
  if (!table || !name) return res.status(400).json({ error: 'Choose a valid reference type and enter a name.' });
  const reference = await ensureReference(table, name);
  await audit(req, `Added ${req.params.type}`, req.params.type, reference.id, reference.name);
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
    ? 'ib.purchase_price, ib.wholesale_price, ib.official_price, ib.retail_price,'
    : `${visibility.show_purchase_price_shopkeeper ? 'ib.purchase_price,' : ''}${visibility.show_wholesale_price_shopkeeper ? 'ib.wholesale_price,' : ''}${visibility.show_official_price_shopkeeper ? 'ib.official_price,' : ''} ib.retail_price,`;
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
  res.json(await getProductsForRole(req.user.role));
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
  
  const officialPriceNum = Number(official_price);
  if (!compatibilityModels || !displayName || !brand || !category || isNaN(officialPriceNum) || officialPriceNum <= 0) {
    return res.status(400).json({ error: 'Short name, compatible models, brand, category and a valid official price are required.' });
  }

  const purchasePriceNum = parsePrice(purchase_price, null);
  const salePriceNum = parsePrice(sale_price, officialPriceNum);
  const wholesalePriceNum = parsePrice(wholesale_price, null);
  const retailPriceNum = parsePrice(retail_price, officialPriceNum);

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
  
  const officialPriceNum = Number(official_price);
  if (!compatibilityModels || !displayName || !brand || !category || isNaN(officialPriceNum) || officialPriceNum <= 0) {
    return res.status(400).json({ error: 'Short name, compatible models, brand, category and a valid official price are required.' });
  }

  const purchasePriceNum = parsePrice(purchase_price, null);
  const salePriceNum = parsePrice(sale_price, officialPriceNum);
  const wholesalePriceNum = parsePrice(wholesale_price, null);
  const retailPriceNum = parsePrice(retail_price, officialPriceNum);

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
    const shopId = await assertShopReadAccess(req, scopeReadableShopId(req));
    const visibility = await getPriceVisibility();
    const extraPrices = req.user.role === 'superadmin'
      ? ', p.purchase_price, p.wholesale_price'
      : `${visibility.show_purchase_price_shopkeeper ? ', p.purchase_price' : ''}${visibility.show_wholesale_price_shopkeeper ? ', p.wholesale_price' : ''}`;
    const officialPrice = req.user.role === 'superadmin' || visibility.show_official_price_shopkeeper ? ', p.official_price' : '';
    const accessSql = batchAccessSql(req.user);
    const rows = await allRecords(`
      SELECT st.id, st.shop_id, sh.name AS shop_name, sh.location_type, p.id AS product_id, p.name, p.short_name, p.full_model_list,
        p.brand, p.category, p.sale_price, p.retail_price, p.description, p.colours
        ${officialPrice}${extraPrices},
        COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.shop_id = st.shop_id AND ib.product_id = st.product_id ${accessSql}), 0) AS quantity,
        COALESCE((SELECT COUNT(*) FROM inventory_batches ib WHERE ib.shop_id = st.shop_id AND ib.product_id = st.product_id AND ib.quantity_remaining > 0 ${accessSql}), 0) AS batch_count
      FROM stock st
      JOIN products p ON p.id = st.product_id
      JOIN shops sh ON sh.id = st.shop_id
      WHERE st.shop_id = ?
      ORDER BY p.brand, COALESCE(p.short_name, p.name)
    `, [shopId]);
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
    const shopId = await assertShopReadAccess(req, scopeReadableShopId(req));
    const visibility = await getPriceVisibility();
    const costs = req.user.role === 'superadmin'
      ? 'ib.purchase_price, ib.wholesale_price,'
      : `${visibility.show_purchase_price_shopkeeper ? 'ib.purchase_price,' : ''}${visibility.show_wholesale_price_shopkeeper ? 'ib.wholesale_price,' : ''}`;
    const official = req.user.role === 'superadmin' || visibility.show_official_price_shopkeeper ? 'ib.official_price,' : '';
    const rows = await allRecords(`
      SELECT ib.id, ib.shop_id, ib.product_id, ib.assigned_user_id, ${costs}${official}
        ib.retail_price, ib.colour, ib.quantity_received, ib.quantity_remaining, ib.received_date, ib.notes, ib.created_at,
        p.name, p.short_name, p.full_model_list, p.brand, p.category, sh.name AS shop_name, sh.location_type, u.name AS assigned_user_name
      FROM inventory_batches ib
      JOIN products p ON p.id = ib.product_id
      JOIN shops sh ON sh.id = ib.shop_id
      LEFT JOIN users u ON u.id = ib.assigned_user_id
      WHERE ib.shop_id = ? ${batchAccessSql(req.user)}
      ORDER BY p.brand, COALESCE(p.short_name, p.name), ib.received_date, ib.id
    `, [shopId]);
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
  const params = shopId ? [shopId] : [];
  let query = `
    SELECT c.*, COALESCE(SUM(s.pending_amount), 0) AS pending
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
    WHERE 1 = 1 ${shopId ? 'AND c.shop_id = ?' : ''}
  `;
  if (isShopStaffRole(req.user.role)) {
    query += ' AND (c.created_by IS NULL OR c.created_by = ?)';
    params.push(req.user.id);
  }
  query += `
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `;
  const rows = await allRecords(query, params);
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
  const params = shopId ? [shopId] : [];
  let query = `
    SELECT sa.*, p.name AS product_name, p.short_name AS product_short_name, p.full_model_list, p.brand, p.category, p.description,
      c.name AS customer_name, c.mobile, c.address,
      sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone
    FROM sales sa
    JOIN products p ON p.id = sa.product_id
    JOIN shops sh ON sh.id = sa.shop_id
    LEFT JOIN customers c ON c.id = sa.customer_id
    WHERE 1 = 1 ${shopId ? 'AND sa.shop_id = ?' : ''}
  `;
  if (isShopStaffRole(req.user.role)) {
    query += ' AND (sa.created_by IS NULL OR sa.created_by = ?)';
    params.push(req.user.id);
  }
  query += ' ORDER BY sa.id DESC';
  const rows = await allRecords(query, params);
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
    const { product_id, customer_id, quantity = 1, total_amount, paid_amount, due_date, notes, batch_id, payment_mode = 'cash' } = req.body;
    if (!product_id || !customer_id || !total_amount) return res.status(400).json({ error: 'Product, customer and total amount are required.' });
    const saleQuantity = Number(quantity);
    if (!Number.isInteger(saleQuantity) || saleQuantity <= 0) return res.status(400).json({ error: 'Quantity must be at least 1.' });

    const result = await runTransaction(async (tx) => {
      const batches = await tx.allRecords(
        `SELECT id, purchase_price, quantity_remaining FROM inventory_batches ib
         WHERE shop_id = ? AND product_id = ? AND quantity_remaining > 0
           ${batch_id ? 'AND id = ?' : ''}${batchAccessSql(req.user)}
         ORDER BY received_date ASC, id ASC`,
        batch_id ? [shopId, product_id, batch_id] : [shopId, product_id]
      );
      const available = batches.reduce((sum, batch) => sum + Number(batch.quantity_remaining || 0), 0);
      if (available < saleQuantity) {
        const error = new Error('Not enough stock in this shop.');
        error.status = 400;
        throw error;
      }
      const pending = Math.max(money(total_amount) - money(paid_amount), 0);
      const insertResult = await tx.runQuery(
        'INSERT INTO sales (shop_id, product_id, customer_id, quantity, total_amount, paid_amount, pending_amount, due_date, sale_date, notes, status, created_by, payment_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [shopId, product_id, customer_id, saleQuantity, total_amount, paid_amount || 0, pending, due_date || '', today(), notes || '', pending > 0 ? 'open' : 'paid', req.user.id, payment_mode]
      );
      let remaining = saleQuantity;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const allocated = Math.min(remaining, Number(batch.quantity_remaining));
        await tx.runQuery('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [allocated, batch.id]);
        await tx.runQuery(
          'INSERT INTO sale_batch_allocations (sale_id, batch_id, quantity, purchase_price) VALUES (?, ?, ?, ?)',
          [insertResult.id, batch.id, allocated, batch.purchase_price]
        );
        remaining -= allocated;
      }
      await syncStockFromBatches(tx, shopId, product_id);
      if (money(paid_amount) > 0) {
        await tx.runQuery('INSERT INTO payments (sale_id, amount, payment_date, note) VALUES (?, ?, ?, ?)', [insertResult.id, paid_amount, today(), 'Initial sale payment']);
      }
      return { id: insertResult.id, pending_amount: pending };
    });

    await audit(req, 'Created sale', 'sale', result.id, `Pending ${result.pending_amount}`);
    res.status(201).json({ id: result.id, pending_amount: result.pending_amount });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to create sale.' });
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
  const params = [];
  if (shopId) params.push(shopId);
  if (isShopStaffRole(req.user.role)) params.push(req.user.id);

  const rows = await allRecords(`
    SELECT sa.*, p.name AS product_name, p.short_name AS product_short_name, p.full_model_list, p.brand, p.category, p.description,
      c.name AS customer_name, c.mobile, c.address,
      sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone
    FROM sales sa
    JOIN products p ON p.id = sa.product_id
    JOIN customers c ON c.id = sa.customer_id
    JOIN shops sh ON sh.id = sa.shop_id
    WHERE sa.pending_amount > 0 ${shopId ? 'AND sa.shop_id = ?' : ''}
      ${isShopStaffRole(req.user.role) ? 'AND (sa.created_by IS NULL OR sa.created_by = ?)' : ''}
    ORDER BY sa.due_date ASC, sa.id DESC
  `, params);
    const grouped = new Map();
  rows.forEach((sale) => {
    const key = `${sale.shop_id}:${sale.mobile || sale.customer_id}`;
    const current = grouped.get(key) || {
      id: `customer-${key}`,
      customer_id: sale.customer_id,
      shop_id: sale.shop_id,
      customer_name: sale.customer_name,
      mobile: sale.mobile,
      address: sale.address,
      shop_name: sale.shop_name,
      shop_area: sale.shop_area,
      shop_address: sale.shop_address,
      shop_phone: sale.shop_phone,
      total_amount: 0,
      paid_amount: 0,
      pending_amount: 0,
      due_date: sale.due_date,
      items: [],
    };
    current.total_amount += money(sale.total_amount);
    current.paid_amount += money(sale.paid_amount);
    current.pending_amount += money(sale.pending_amount);
    if (sale.due_date && (!current.due_date || sale.due_date < current.due_date)) current.due_date = sale.due_date;
    current.items.push({ ...sale, display_name: productDisplayName({ name: sale.product_name, short_name: sale.product_short_name }) });
    grouped.set(key, current);
  });
  res.json([...grouped.values()]);
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
  const { shopId, search = '', brand = '', min = 0, max = 9999999 } = req.query;
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
    Number(min),
    Number(max),
  ]);
  res.json(rows);
});

app.get('/api/reports', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = isShopStaffRole(req.user.role) ? req.user.shop_id : scopeShopId(req);
  const pendingByShop = await allRecords(`
    SELECT sh.name AS shop_name, COALESCE(SUM(sa.pending_amount), 0) AS pending
    FROM shops sh
    LEFT JOIN sales sa ON sa.shop_id = sh.id
    ${shopId ? 'WHERE sh.id = ?' : ''}
    GROUP BY sh.id
    ORDER BY pending DESC
  `, shopId ? [shopId] : []);
  const availability = await allRecords(`
    SELECT p.name, p.short_name, p.full_model_list, p.brand, sh.name AS shop_name, st.quantity
    FROM stock st
    JOIN products p ON p.id = st.product_id
    JOIN shops sh ON sh.id = st.shop_id
    WHERE st.quantity > 0 ${shopId ? 'AND st.shop_id = ?' : ''}
    ORDER BY p.name, sh.name
  `, shopId ? [shopId] : []);
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
