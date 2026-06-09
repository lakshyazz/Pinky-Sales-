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

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production.');
}

app.use(cors());
app.use(express.json());

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
const normalizeColours = (value) => {
  const colours = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(colours.map((colour) => String(colour).trim()).filter(Boolean))];
};
const productColumnsForRole = (role) => role === 'superadmin'
  ? 'id, name, short_name, full_model_list, brand, category, official_price, purchase_price, sale_price, wholesale_price, retail_price, description, colours, is_active, updated_at'
  : 'id, name, short_name, full_model_list, brand, category, official_price, sale_price, retail_price, description, colours, is_active, updated_at';
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

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Session expired. Please login again.' });
    req.user = user;
    next();
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

const assertShopAccess = (req, requestedShopId) => {
  if (req.user.role === 'superadmin') return Number(requestedShopId);
  return Number(req.user.shop_id);
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
  const { password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Enter username and password.' });

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

app.get('/api/dashboard', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = scopeShopId(req);
  const trendDays = lastDays();
  const trendPlaceholders = trendDays.map(() => '?').join(', ');

  const [totals, lowStock, shopWise, topProducts, salesTrendRows, pendingTrendRows] = await Promise.all([
    getRecord(`
      SELECT
        (SELECT COUNT(*) FROM shops WHERE status = 'active' ${shopId ? 'AND id = ?' : ''}) AS total_shops,
        (SELECT COALESCE(SUM(quantity), 0) FROM stock ${shopId ? 'WHERE shop_id = ?' : ''}) AS total_stock,
        (SELECT COALESCE(SUM(total_amount), 0) FROM sales ${shopId ? 'WHERE shop_id = ? AND' : 'WHERE'} sale_date = ?) AS today_sales,
        (SELECT COALESCE(SUM(pending_amount), 0) FROM sales ${shopId ? 'WHERE shop_id = ? AND' : 'WHERE'} pending_amount > 0) AS pending_payments
    `, shopId ? [shopId, shopId, shopId, today(), shopId] : [today()]),
    allRecords(`
      SELECT st.id, sh.name AS shop_name, p.name AS product_name, p.short_name AS product_short_name, p.brand, st.quantity, sh.low_stock_threshold
      FROM stock st
      JOIN shops sh ON sh.id = st.shop_id
      JOIN products p ON p.id = st.product_id
      WHERE st.quantity <= sh.low_stock_threshold ${shopId ? 'AND st.shop_id = ?' : ''}
      ORDER BY st.quantity ASC, p.name ASC
      LIMIT 12
    `, shopId ? [shopId] : []),
    allRecords(`
      SELECT sh.id, sh.name, sh.area,
        COALESCE((SELECT SUM(st.quantity) FROM stock st WHERE st.shop_id = sh.id), 0) AS stock,
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
    trends: {
      sales: trendValues(salesTrendRows),
      pending: trendValues(pendingTrendRows),
    },
  });
});

app.get('/api/shops', authenticateToken, async (req, res) => {
  if (isCustomerRole(req.user.role)) {
    const rows = await allRecords(`
      SELECT id, name, area
      FROM shops
      WHERE status = 'active'
      ORDER BY id ASC
    `);
    return res.json(rows);
  }

  const shopId = isShopStaffRole(req.user.role) ? Number(req.user.shop_id) : null;
  const rows = await allRecords(`
    SELECT sh.*,
      COALESCE((SELECT SUM(st.quantity) FROM stock st WHERE st.shop_id = sh.id), 0) AS stock,
      COALESCE((SELECT SUM(sa.pending_amount) FROM sales sa WHERE sa.shop_id = sh.id), 0) AS pending
    FROM shops sh
    ${shopId ? 'WHERE sh.id = ?' : ''}
    ORDER BY sh.id ASC
  `, shopId ? [shopId] : []);
  res.json(rows);
});

app.post('/api/shops', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { name, area, address, phone } = req.body;
  if (!name || !area) return res.status(400).json({ error: 'Shop name and area are required.' });
  const result = await runQuery('INSERT INTO shops (name, area, address, phone) VALUES (?, ?, ?, ?)', [name, area, address || '', phone || '']);
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
  await runQuery('DELETE FROM users WHERE shop_id = ?', [req.params.id]);
  await runQuery('DELETE FROM shops WHERE id = ?', [req.params.id]);
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
  const { username, password, name, contact, shop_id } = req.body;
  if (!username || !password || !name || !shop_id) return res.status(400).json({ error: 'Username, password, name and shop are required.' });
  const hash = await bcrypt.hash(password, 10);
  const result = await runQuery(
    "INSERT INTO users (username, password, role, name, contact, shop_id) VALUES (?, ?, 'shopkeeper', ?, ?, ?)",
    [username, hash, name, contact || '', shop_id]
  );
  await audit(req, 'Created shopkeeper', 'user', result.id, name);
  res.status(201).json({ id: result.id, username, name, contact, shop_id });
});

app.get('/api/products', authenticateToken, requireShopStaff, async (req, res) => {
  const rows = await allRecords(`SELECT ${productColumnsForRole(req.user.role)} FROM products WHERE is_active = 1 AND name IS NOT NULL ORDER BY brand, COALESCE(short_name, name)`);
  res.json(rows);
});

app.post('/api/products', authenticateToken, requireSuperAdmin, async (req, res) => {
  const {
    name, short_name, full_model_list, brand, category, official_price,
    purchase_price, sale_price, wholesale_price, retail_price, description, colours,
  } = req.body;
  const compatibilityModels = String(full_model_list || name || '').trim();
  const displayName = String(short_name || compatibilityModels).trim();
  if (!compatibilityModels || !displayName || !brand || !category || !official_price) {
    return res.status(400).json({ error: 'Short name, compatible models, brand, category and official price are required.' });
  }
  const result = await runQuery(
    `INSERT INTO products (
      name, short_name, full_model_list, brand, category, official_price,
      purchase_price, sale_price, wholesale_price, retail_price, description, colours
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      compatibilityModels, displayName, compatibilityModels, brand, category, official_price,
      purchase_price || null, sale_price || official_price, wholesale_price || null,
      retail_price || official_price, description || '', normalizeColours(colours),
    ]
  );
  const shops = await allRecords('SELECT id FROM shops');
  for (const shop of shops) {
    await runQuery('INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, 0) ON CONFLICT(shop_id, product_id) DO NOTHING', [shop.id, result.id]);
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
  if (!compatibilityModels || !displayName || !brand || !category || !official_price) {
    return res.status(400).json({ error: 'Short name, compatible models, brand, category and official price are required.' });
  }
  await runQuery(
    `UPDATE products SET
      name = ?, short_name = ?, full_model_list = ?, brand = ?, category = ?, official_price = ?,
      purchase_price = ?, sale_price = ?, wholesale_price = ?, retail_price = ?,
      description = ?, colours = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      compatibilityModels, displayName, compatibilityModels, brand, category, official_price,
      purchase_price || null, sale_price || official_price, wholesale_price || null,
      retail_price || official_price, description || '', normalizeColours(colours), is_active, req.params.id,
    ]
  );
  await audit(req, 'Updated official price', 'product', req.params.id, `${oldProduct?.official_price || 0} -> ${official_price}`);
  res.json({ success: true });
});

app.get('/api/stock', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, scopeShopId(req));
    const rows = await allRecords(`
      SELECT st.id, st.shop_id, sh.name AS shop_name, p.id AS product_id, p.name, p.short_name, p.full_model_list,
        p.brand, p.category, p.official_price, p.sale_price, p.retail_price, p.description, p.colours, st.quantity
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
    const { product_id, quantity } = req.body;
    if (!product_id || quantity === undefined) return res.status(400).json({ error: 'Product and quantity are required.' });
    const stockQuantity = Number(quantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return res.status(400).json({ error: 'Quantity must be 0 or more.' });
    await runQuery(
      'INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT(shop_id, product_id) DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP',
      [shopId, product_id, stockQuantity]
    );
    await audit(req, 'Updated stock', 'stock', product_id, `Shop ${shopId} quantity ${stockQuantity}`);
    res.json({ success: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to update stock.' });
  }
});

app.get('/api/customers', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = assertShopAccess(req, scopeShopId(req));
  const rows = await allRecords(`
    SELECT c.*, COALESCE(SUM(s.pending_amount), 0) AS pending
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
    WHERE c.shop_id = ?
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `, [shopId]);
  res.json(rows);
});

app.post('/api/customers', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { name, mobile, address, notes } = req.body;
    if (!name || !mobile) return res.status(400).json({ error: 'Customer name and mobile are required.' });
    const result = await runQuery(
      'INSERT INTO customers (shop_id, name, mobile, address, notes) VALUES (?, ?, ?, ?, ?)',
      [shopId, name, mobile, address || '', notes || '']
    );
    await audit(req, 'Created customer', 'customer', result.id, name);
    res.status(201).json({ id: result.id, shop_id: shopId, name, mobile, address, notes });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to create customer.' });
  }
});

app.get('/api/sales', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = assertShopAccess(req, scopeShopId(req));
  const rows = await allRecords(`
    SELECT sa.*, p.name AS product_name, p.short_name AS product_short_name, p.full_model_list, p.brand, p.category, p.description,
      c.name AS customer_name, c.mobile, c.address,
      sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone
    FROM sales sa
    JOIN products p ON p.id = sa.product_id
    JOIN shops sh ON sh.id = sa.shop_id
    LEFT JOIN customers c ON c.id = sa.customer_id
    WHERE sa.shop_id = ?
    ORDER BY sa.id DESC
  `, [shopId]);
  res.json(rows);
});

app.post('/api/sales', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { product_id, customer_id, quantity = 1, total_amount, paid_amount, due_date, notes } = req.body;
    if (!product_id || !customer_id || !total_amount) return res.status(400).json({ error: 'Product, customer and total amount are required.' });
    const saleQuantity = Number(quantity);
    if (!Number.isInteger(saleQuantity) || saleQuantity <= 0) return res.status(400).json({ error: 'Quantity must be at least 1.' });

    const result = await runTransaction(async (tx) => {
      const update = await tx.runQuery(
        'UPDATE stock SET quantity = quantity - ? WHERE shop_id = ? AND product_id = ? AND quantity >= ?',
        [saleQuantity, shopId, product_id, saleQuantity]
      );
      if (update.changes === 0) {
        const error = new Error('Not enough stock in this shop.');
        error.status = 400;
        throw error;
      }
      const pending = Math.max(money(total_amount) - money(paid_amount), 0);
      const insertResult = await tx.runQuery(
        'INSERT INTO sales (shop_id, product_id, customer_id, quantity, total_amount, paid_amount, pending_amount, due_date, sale_date, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [shopId, product_id, customer_id, saleQuantity, total_amount, paid_amount || 0, pending, due_date || '', today(), notes || '', pending > 0 ? 'open' : 'paid']
      );
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
    const rows = await allRecords(`
      SELECT sr.*, sh.name AS shop_name, sh.area AS shop_area, p.name AS product_name, p.short_name AS product_short_name, p.brand, p.official_price,
        u.name AS created_by_name,
        COALESCE(st.quantity, 0) AS shop_quantity,
        COALESCE((SELECT SUM(quantity) FROM stock WHERE product_id = sr.product_id), 0) AS total_available
      FROM stock_requests sr
      JOIN shops sh ON sh.id = sr.shop_id
      LEFT JOIN products p ON p.id = sr.product_id
      LEFT JOIN users u ON u.id = sr.created_by
      LEFT JOIN stock st ON st.shop_id = sr.shop_id AND st.product_id = sr.product_id
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
  const rows = await allRecords(`
    SELECT sa.*, p.name AS product_name, p.short_name AS product_short_name, p.full_model_list, p.brand, p.category, p.description,
      c.name AS customer_name, c.mobile, c.address,
      sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone
    FROM sales sa
    JOIN products p ON p.id = sa.product_id
    JOIN customers c ON c.id = sa.customer_id
    JOIN shops sh ON sh.id = sa.shop_id
    WHERE sa.pending_amount > 0 ${shopId ? 'AND sa.shop_id = ?' : ''}
    ORDER BY sa.due_date ASC, sa.id DESC
  `, shopId ? [shopId] : []);
  const grouped = new Map();
  rows.forEach((sale) => {
    const key = `${sale.shop_id}:${sale.customer_id}`;
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
      const scopedShopId = requireScopedShopId(req, shop_id);
      const result = await runTransaction(async (tx) => {
        const sales = await tx.allRecords(
          'SELECT * FROM sales WHERE customer_id = ? AND shop_id = ? AND pending_amount > 0 ORDER BY due_date ASC, id ASC',
          [customer_id, scopedShopId]
        );
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
      const update = await tx.runQuery(
        'UPDATE stock SET quantity = quantity - ? WHERE shop_id = ? AND product_id = ? AND quantity >= ?',
        [quantity, from_shop_id, product_id, quantity]
      );
      if (update.changes === 0) {
        const error = new Error('Source shop does not have enough stock.');
        error.status = 400;
        throw error;
      }
      await tx.runQuery(
        'INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT(shop_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP',
        [to_shop_id, product_id, quantity]
      );
      const insertResult = await tx.runQuery(
        'INSERT INTO stock_transfers (from_shop_id, to_shop_id, product_id, quantity, transfer_date, note) VALUES (?, ?, ?, ?, ?, ?)',
        [from_shop_id, to_shop_id, product_id, quantity, today(), note || '']
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
      p.official_price, p.sale_price, p.retail_price, p.description, p.colours,
      STRING_AGG(CASE WHEN st.quantity > 0 THEN sh.name || ' (' || st.quantity || ')' END, ', ') AS available_shops,
      COALESCE(SUM(st.quantity), 0) AS total_available
    FROM products p
    LEFT JOIN stock st ON st.product_id = p.id ${shopId ? 'AND st.shop_id = ?' : ''}
    LEFT JOIN shops sh ON sh.id = st.shop_id
    WHERE p.is_active = 1
      AND p.name IS NOT NULL
      AND (p.name ILIKE ? OR COALESCE(p.short_name, '') ILIKE ? OR COALESCE(p.full_model_list, '') ILIKE ? OR p.brand ILIKE ?)
      AND (? = '' OR p.brand = ?)
      AND p.official_price BETWEEN ? AND ?
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
