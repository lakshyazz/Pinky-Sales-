import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { initDatabase, runQuery, getRecord, allRecords } from './database.js';

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'as-store-multishop-local-secret';

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
  if (req.user.role === 'superadmin' || req.user.role === 'shopkeeper') return next();
  return res.status(403).json({ error: 'Shop staff access required.' });
};

const scopeShopId = (req) => {
  if (req.user.role === 'shopkeeper') return Number(req.user.shop_id);
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
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Enter username and password.' });

  const user = await getRecord(`
    SELECT u.*, s.name AS shop_name, s.area AS shop_area
    FROM users u
    LEFT JOIN shops s ON s.id = u.shop_id
    WHERE u.username = ?
  `, [username]);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }

  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    shop_id: user.shop_id,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '10h' });
  res.json({
    token,
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
  res.json(user);
});

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  const shopId = scopeShopId(req);

  const totals = await getRecord(`
    SELECT
      (SELECT COUNT(*) FROM shops WHERE status = 'active') AS total_shops,
      (SELECT COALESCE(SUM(quantity), 0) FROM stock ${shopId ? 'WHERE shop_id = ?' : ''}) AS total_stock,
      (SELECT COALESCE(SUM(total_amount), 0) FROM sales ${shopId ? 'WHERE shop_id = ? AND' : 'WHERE'} sale_date = ?) AS today_sales,
      (SELECT COALESCE(SUM(pending_amount), 0) FROM sales ${shopId ? 'WHERE shop_id = ? AND' : 'WHERE'} pending_amount > 0) AS pending_payments
  `, shopId ? [shopId, shopId, today(), shopId] : [today()]);

  const lowStock = await allRecords(`
    SELECT st.id, sh.name AS shop_name, p.name AS product_name, p.brand, st.quantity, sh.low_stock_threshold
    FROM stock st
    JOIN shops sh ON sh.id = st.shop_id
    JOIN products p ON p.id = st.product_id
    WHERE st.quantity <= sh.low_stock_threshold ${shopId ? 'AND st.shop_id = ?' : ''}
    ORDER BY st.quantity ASC, p.name ASC
    LIMIT 12
  `, shopId ? [shopId] : []);

  const shopWise = await allRecords(`
    SELECT sh.id, sh.name, sh.area,
      COALESCE(SUM(st.quantity), 0) AS stock,
      COALESCE(SUM(sa.pending_amount), 0) AS pending,
      COALESCE(SUM(CASE WHEN sa.sale_date = ? THEN sa.total_amount ELSE 0 END), 0) AS sales_today
    FROM shops sh
    LEFT JOIN stock st ON st.shop_id = sh.id
    LEFT JOIN sales sa ON sa.shop_id = sh.id
    ${shopId ? 'WHERE sh.id = ?' : ''}
    GROUP BY sh.id
    ORDER BY sales_today DESC, pending DESC
  `, shopId ? [today(), shopId] : [today()]);

  const topProducts = await allRecords(`
    SELECT p.name, p.brand, COALESCE(SUM(sa.quantity), 0) AS sold
    FROM products p
    LEFT JOIN sales sa ON sa.product_id = p.id ${shopId ? 'AND sa.shop_id = ?' : ''}
    GROUP BY p.id
    ORDER BY sold DESC, p.name ASC
    LIMIT 6
  `, shopId ? [shopId] : []);

  const trendDays = lastDays();
  const salesTrendRows = await Promise.all(trendDays.map((day) => getRecord(`
    SELECT COALESCE(SUM(total_amount), 0) AS value
    FROM sales
    WHERE sale_date = ? ${shopId ? 'AND shop_id = ?' : ''}
  `, shopId ? [day, shopId] : [day])));
  const pendingTrendRows = await Promise.all(trendDays.map((day) => getRecord(`
    SELECT COALESCE(SUM(pending_amount), 0) AS value
    FROM sales
    WHERE pending_amount > 0 AND due_date = ? ${shopId ? 'AND shop_id = ?' : ''}
  `, shopId ? [day, shopId] : [day])));

  res.json({
    totals,
    lowStock,
    shopWise,
    topProducts,
    trends: {
      sales: salesTrendRows.map((row) => money(row.value)),
      pending: pendingTrendRows.map((row) => money(row.value)),
    },
  });
});

app.get('/api/shops', authenticateToken, async (req, res) => {
  const rows = await allRecords(`
    SELECT sh.*,
      COALESCE(SUM(st.quantity), 0) AS stock,
      COALESCE(SUM(sa.pending_amount), 0) AS pending
    FROM shops sh
    LEFT JOIN stock st ON st.shop_id = sh.id
    LEFT JOIN sales sa ON sa.shop_id = sh.id
    GROUP BY sh.id
    ORDER BY sh.id ASC
  `);
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
    WHERE u.role = 'shopkeeper'
    ORDER BY s.name, u.name
  `);
  res.json(rows);
});

app.post('/api/shopkeepers', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { username, password, name, contact, shop_id } = req.body;
  if (!username || !password || !name || !shop_id) return res.status(400).json({ error: 'Username, password, name and shop are required.' });
  const hash = await bcrypt.hash(password, 10);
  const result = await runQuery(
    'INSERT INTO users (username, password, role, name, contact, shop_id) VALUES (?, ?, "shopkeeper", ?, ?, ?)',
    [username, hash, name, contact || '', shop_id]
  );
  await audit(req, 'Created shopkeeper', 'user', result.id, name);
  res.status(201).json({ id: result.id, username, name, contact, shop_id });
});

app.get('/api/products', authenticateToken, async (req, res) => {
  const rows = await allRecords('SELECT * FROM products WHERE is_active = 1 AND name IS NOT NULL ORDER BY brand, name');
  res.json(rows);
});

app.post('/api/products', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { name, brand, category, official_price, description } = req.body;
  if (!name || !brand || !category || !official_price) return res.status(400).json({ error: 'Product details and price are required.' });
  const result = await runQuery(
    'INSERT INTO products (name, brand, category, official_price, description) VALUES (?, ?, ?, ?, ?)',
    [name, brand, category, official_price, description || '']
  );
  const shops = await allRecords('SELECT id FROM shops');
  for (const shop of shops) {
    await runQuery('INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, 0) ON CONFLICT(shop_id, product_id) DO NOTHING', [shop.id, result.id]);
  }
  await audit(req, 'Created product and official price', 'product', result.id, `${name} at ${official_price}`);
  res.status(201).json({ id: result.id, name, brand, category, official_price, description });
});

app.put('/api/products/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  const oldProduct = await getRecord('SELECT * FROM products WHERE id = ?', [req.params.id]);
  const { name, brand, category, official_price, description, is_active = 1 } = req.body;
  await runQuery(
    'UPDATE products SET name = ?, brand = ?, category = ?, official_price = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, brand, category, official_price, description || '', is_active, req.params.id]
  );
  await audit(req, 'Updated official price', 'product', req.params.id, `${oldProduct?.official_price || 0} -> ${official_price}`);
  res.json({ success: true });
});

app.get('/api/stock', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, scopeShopId(req));
    const rows = await allRecords(`
      SELECT st.id, st.shop_id, sh.name AS shop_name, p.id AS product_id, p.name, p.brand, p.category, p.official_price, st.quantity
      FROM stock st
      JOIN products p ON p.id = st.product_id
      JOIN shops sh ON sh.id = st.shop_id
      WHERE st.shop_id = ?
      ORDER BY p.brand, p.name
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
    SELECT sa.*, p.name AS product_name, p.brand, c.name AS customer_name, c.mobile, sh.name AS shop_name
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
  let inTransaction = false;
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { product_id, customer_id, quantity = 1, total_amount, paid_amount, due_date, notes } = req.body;
    if (!product_id || !customer_id || !total_amount) return res.status(400).json({ error: 'Product, customer and total amount are required.' });
    const saleQuantity = Number(quantity);
    if (!Number.isInteger(saleQuantity) || saleQuantity <= 0) return res.status(400).json({ error: 'Quantity must be at least 1.' });

    await runQuery('BEGIN TRANSACTION;');
    inTransaction = true;
    const update = await runQuery(
      'UPDATE stock SET quantity = quantity - ? WHERE shop_id = ? AND product_id = ? AND quantity >= ?',
      [saleQuantity, shopId, product_id, saleQuantity]
    );
    if (update.changes === 0) {
      await runQuery('ROLLBACK;');
      return res.status(400).json({ error: 'Not enough stock in this shop.' });
    }
    const pending = Math.max(money(total_amount) - money(paid_amount), 0);
    const result = await runQuery(
      'INSERT INTO sales (shop_id, product_id, customer_id, quantity, total_amount, paid_amount, pending_amount, due_date, sale_date, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [shopId, product_id, customer_id, saleQuantity, total_amount, paid_amount || 0, pending, due_date || '', today(), notes || '', pending > 0 ? 'open' : 'paid']
    );
    if (money(paid_amount) > 0) {
      await runQuery('INSERT INTO payments (sale_id, amount, payment_date, note) VALUES (?, ?, ?, ?)', [result.id, paid_amount, today(), 'Initial sale payment']);
    }
    await runQuery('COMMIT;');
    inTransaction = false;
    await audit(req, 'Created sale', 'sale', result.id, `Pending ${pending}`);
    res.status(201).json({ id: result.id, pending_amount: pending });
  } catch (error) {
    if (inTransaction) await runQuery('ROLLBACK;');
    res.status(error.status || 500).json({ error: error.message || 'Unable to create sale.' });
  }
});

app.get('/api/stock-requests', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = req.user.role === 'shopkeeper' ? req.user.shop_id : scopeShopId(req);
    const rows = await allRecords(`
      SELECT sr.*, sh.name AS shop_name, sh.area AS shop_area, p.name AS product_name, p.brand, p.official_price,
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
  const shopId = req.user.role === 'shopkeeper' ? req.user.shop_id : scopeShopId(req);
  const rows = await allRecords(`
    SELECT sa.*, p.name AS product_name, c.name AS customer_name, c.mobile, c.address, sh.name AS shop_name
    FROM sales sa
    JOIN products p ON p.id = sa.product_id
    JOIN customers c ON c.id = sa.customer_id
    JOIN shops sh ON sh.id = sa.shop_id
    WHERE sa.pending_amount > 0 ${shopId ? 'AND sa.shop_id = ?' : ''}
    ORDER BY sa.due_date ASC, sa.id DESC
  `, shopId ? [shopId] : []);
  res.json(rows);
});

app.post('/api/payments', authenticateToken, requireShopStaff, async (req, res) => {
  const { sale_id, amount, note } = req.body;
  if (!sale_id || !amount) return res.status(400).json({ error: 'Sale and amount are required.' });
  const sale = await getRecord('SELECT * FROM sales WHERE id = ?', [sale_id]);
  if (!sale) return res.status(404).json({ error: 'Sale not found.' });
  if (req.user.role === 'shopkeeper' && Number(req.user.shop_id) !== Number(sale.shop_id)) {
    return res.status(403).json({ error: 'This sale belongs to another branch.' });
  }

  const newPaid = money(sale.paid_amount) + money(amount);
  const newPending = Math.max(money(sale.total_amount) - newPaid, 0);
  await runQuery('INSERT INTO payments (sale_id, amount, payment_date, note) VALUES (?, ?, ?, ?)', [sale_id, amount, today(), note || 'Payment update']);
  await runQuery('UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?', [newPaid, newPending, newPending > 0 ? 'open' : 'paid', sale_id]);
  await audit(req, 'Recorded payment', 'sale', sale_id, `Paid ${amount}, remaining ${newPending}`);
  res.json({ success: true, pending_amount: newPending });
});

app.post('/api/stock-transfer', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { from_shop_id, to_shop_id, product_id, quantity, note } = req.body;
  if (!from_shop_id || !to_shop_id || !product_id || !quantity) return res.status(400).json({ error: 'Transfer details are required.' });
  await runQuery('BEGIN TRANSACTION;');
  try {
    const update = await runQuery(
      'UPDATE stock SET quantity = quantity - ? WHERE shop_id = ? AND product_id = ? AND quantity >= ?',
      [quantity, from_shop_id, product_id, quantity]
    );
    if (update.changes === 0) {
      await runQuery('ROLLBACK;');
      return res.status(400).json({ error: 'Source shop does not have enough stock.' });
    }
    await runQuery(
      'INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT(shop_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP',
      [to_shop_id, product_id, quantity]
    );
    const result = await runQuery(
      'INSERT INTO stock_transfers (from_shop_id, to_shop_id, product_id, quantity, transfer_date, note) VALUES (?, ?, ?, ?, ?, ?)',
      [from_shop_id, to_shop_id, product_id, quantity, today(), note || '']
    );
    await runQuery('COMMIT;');
    await audit(req, 'Transferred stock', 'stock_transfer', result.id, `${quantity} units from ${from_shop_id} to ${to_shop_id}`);
    res.status(201).json({ id: result.id });
  } catch (error) {
    await runQuery('ROLLBACK;');
    throw error;
  }
});

app.get('/api/catalog', async (req, res) => {
  const { shopId, search = '', brand = '', min = 0, max = 9999999 } = req.query;
  const rows = await allRecords(`
    SELECT p.id, p.name, p.brand, p.category, p.official_price, p.description,
      STRING_AGG(CASE WHEN st.quantity > 0 THEN sh.name || ' (' || st.quantity || ')' END, ', ') AS available_shops,
      COALESCE(SUM(st.quantity), 0) AS total_available
    FROM products p
    LEFT JOIN stock st ON st.product_id = p.id ${shopId ? 'AND st.shop_id = ?' : ''}
    LEFT JOIN shops sh ON sh.id = st.shop_id
    WHERE p.is_active = 1
      AND p.name IS NOT NULL
      AND (p.name ILIKE ? OR p.brand ILIKE ?)
      AND (? = '' OR p.brand = ?)
      AND p.official_price BETWEEN ? AND ?
    GROUP BY p.id
    ORDER BY p.brand, p.name
  `, [
    ...(shopId ? [shopId] : []),
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
  const shopId = req.user.role === 'shopkeeper' ? req.user.shop_id : scopeShopId(req);
  const pendingByShop = await allRecords(`
    SELECT sh.name AS shop_name, COALESCE(SUM(sa.pending_amount), 0) AS pending
    FROM shops sh
    LEFT JOIN sales sa ON sa.shop_id = sh.id
    ${shopId ? 'WHERE sh.id = ?' : ''}
    GROUP BY sh.id
    ORDER BY pending DESC
  `, shopId ? [shopId] : []);
  const availability = await allRecords(`
    SELECT p.name, p.brand, sh.name AS shop_name, st.quantity
    FROM stock st
    JOIN products p ON p.id = st.product_id
    JOIN shops sh ON sh.id = st.shop_id
    WHERE st.quantity > 0 ${shopId ? 'AND st.shop_id = ?' : ''}
    ORDER BY p.name, sh.name
  `, shopId ? [shopId] : []);
  const auditRows = req.user.role === 'shopkeeper'
    ? await allRecords('SELECT * FROM audit_logs WHERE actor_id = ? AND action = "Created sale" ORDER BY id DESC LIMIT 25', [req.user.id])
    : await allRecords('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 25');
  res.json({ pendingByShop, availability, auditRows });
});

app.listen(PORT, () => {
  console.log(`[Server] Multi-shop API is live on http://localhost:${PORT}`);
});
