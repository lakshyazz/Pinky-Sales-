import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import crypto from 'crypto';
import { initDatabase, runQuery, getRecord, allRecords, runTransaction, executeTransaction } from './database.js';
import { uploadImageToR2, deleteImageFromR2, isR2Configured, getImageBufferFromStorage } from './r2Storage.js';
import { postSaleJournal, postPaymentJournal, postCreditNoteJournal, postPurchaseBillJournal, postDebitNoteJournal, reverseJournal } from './accountingEngine.js';
import { getCustomerLedger, getVendorLedger, getARAgingReport, getAPAgingReport } from './ledgerEngine.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed (max 10MB).'));
    }
  },
});

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'as-store-multishop-local-secret';
const VALID_ROLES = new Set(['superadmin', 'shopkeeper', 'admin', 'customer', 'user', 'supplier']);
const isShopStaffRole = (role) => role === 'shopkeeper' || role === 'admin';
const isCustomerRole = (role) => role === 'customer' || role === 'user';
const isSupplierRole = (role) => role === 'supplier';
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
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/health') && !req.url.startsWith('/images')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

// Brute-force protection & rate limiter for login
const loginAttempts = new Map();

const checkLoginRateLimit = (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const username = String(req.body?.username || '').toLowerCase().trim();
  const key = `${ip}:${username}`;
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (record && record.blockedUntil && now < record.blockedUntil) {
    const remainingMin = Math.ceil((record.blockedUntil - now) / 60000);
    return res.status(429).json({
      error: `Too many failed login attempts. Account temporarily locked for security. Please try again in ${remainingMin} minute(s).`
    });
  }
  next();
};

const recordFailedLogin = (req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const username = String(req.body?.username || '').toLowerCase().trim();
  const key = `${ip}:${username}`;
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, firstAttempt: now, blockedUntil: 0 };

  if (now - record.firstAttempt > 15 * 60 * 1000) {
    record.count = 1;
    record.firstAttempt = now;
    record.blockedUntil = 0;
  } else {
    record.count += 1;
  }

  if (record.count >= 5) {
    record.blockedUntil = now + 15 * 60 * 1000;
    console.warn(`[Security Alert] IP ${ip} exceeded 5 failed login attempts for user "${username}". Temporary 15-minute lock activated.`);
  }
  loginAttempts.set(key, record);
};

const clearLoginAttempts = (req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const username = String(req.body?.username || '').toLowerCase().trim();
  loginAttempts.delete(`${ip}:${username}`);
};

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (now - record.firstAttempt > 30 * 60 * 1000 && (!record.blockedUntil || now > record.blockedUntil)) {
      loginAttempts.delete(key);
    }
  }
}, 15 * 60 * 1000).unref();

app.use(express.json({ limit: '1mb' }));

const wrapRouteHandler = (handler) => {
  if (typeof handler !== 'function' || handler.length === 4) return handler;
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      return result && typeof result.catch === 'function' ? result.catch(next) : result;
    } catch (error) {
      return next(error);
    }
  };
};

['get', 'post', 'put', 'patch', 'delete'].forEach((method) => {
  const original = app[method].bind(app);
  app[method] = (...args) => {
    if (args.length <= 1) return original(...args);
    return original(args[0], ...args.slice(1).map(wrapRouteHandler));
  };
});

app.get('/api/health', async (_req, res) => {
  try {
    const dbInfo = await getRecord("SELECT current_database() AS db, current_user AS usr");
    res.json({ status: 'ok', database: dbInfo?.db, user: dbInfo?.usr });
  } catch (err) {
    res.json({ status: 'error', error: err.message });
  }
});

let dbInitialized = false;
let dbInitPromise = null;

const ensureDatabaseInit = async () => {
  if (dbInitialized) return;
  if (!dbInitPromise) {
    dbInitPromise = initDatabase()
      .then(() => { dbInitialized = true; })
      .catch((err) => {
        dbInitPromise = null;
        console.error('[Server] Non-fatal database initialization notice:', err?.message || err);
        dbInitialized = true;
      });
  }
  return dbInitPromise;
};

app.use(async (req, _res, next) => {
  if (req.path === '/api/health') return next();
  try {
    await ensureDatabaseInit();
    next();
  } catch (err) {
    next();
  }
});

const today = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const lastDays = (count = 7) => Array.from({ length: count }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() - (count - index - 1));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});
// [FIX A1] money() now uses half-up rounding to 2 decimal places.
// Raw Number() was floating-point unsafe (0.1+0.2 = 0.30000000000000004).
// Math.round(x * 100) / 100 ensures all monetary sums match PostgreSQL NUMERIC(12,2) behaviour.
const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const productDisplayName = (row) => row.short_name || row.name;
const DEFAULT_PAGE_LIMIT = 5000;
const MAX_PAGE_LIMIT = 5000;
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
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return;

  terms.forEach((term) => {
    const termClean = term.replace(/[\s\-_/\\+]/g, '').toLowerCase();
    const clauses = [];
    columns.forEach((column) => {
      clauses.push(`${column} ILIKE ?`);
      params.push(`%${term}%`);
      if (termClean && termClean !== term.toLowerCase() && termClean.length >= 2) {
        clauses.push(`REGEXP_REPLACE(LOWER(${column}), '[\\s\\-_/\\\\+]', '', 'g') LIKE ?`);
        params.push(`%${termClean}%`);
      }
    });
    where.push(`(${clauses.join(' OR ')})`);
  });
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
const invalidateCache = (...keys) => keys.forEach((key) => {
  for (const cacheKey of responseCache.keys()) {
    if (cacheKey === key || cacheKey.startsWith(`${key}-`) || cacheKey.startsWith(`${key}:`)) {
      responseCache.delete(cacheKey);
    }
  }
});
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
const detectBrandFromProductText = (value) => {
  const text = String(value || '').toLowerCase();
  if (/1\+|one\s*plus|oneplus/.test(text)) return 'OnePlus';
  if (/iphone|ipad|apple|i\s*phone/.test(text)) return 'Apple';
  if (/redmi/.test(text)) return 'Redmi';
  if (/xiaomi|\bmi\b|\bmi\d|\bmi\s/.test(text)) return 'Xiaomi';
  if (/pixel|google/.test(text)) return 'Google Pixel';
  if (/poco/.test(text)) return 'Poco';
  if (/samsung|galaxy|\bsam\b/.test(text)) return 'Samsung';
  if (/vivo/.test(text)) return 'Vivo';
  if (/oppo/.test(text)) return 'Oppo';
  if (/realme/.test(text)) return 'Realme';
  if (/nothing/.test(text)) return 'Nothing';
  if (/motorola|moto/.test(text)) return 'Motorola';
  if (/huawei/.test(text)) return 'Huawei';
  if (/honor/.test(text)) return 'Honor';
  if (/nokia/.test(text)) return 'Nokia';
  if (/infinix/.test(text)) return 'Infinix';
  if (/tecno/.test(text)) return 'Tecno';
  if (/lava/.test(text)) return 'Lava';
  if (/micromax/.test(text)) return 'Micromax';
  if (/iqoo/.test(text)) return 'IQOO';
  if (/asus/.test(text)) return 'Asus';
  if (/sony/.test(text)) return 'Sony';
  if (/lenovo/.test(text)) return 'Lenovo';
  return '';
};
const normalizeImportKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const getImportValue = (row, aliases) => {
  const normalized = new Map(Object.entries(row || {}).map(([key, value]) => [normalizeImportKey(key), value]));
  for (const alias of aliases) {
    const value = normalized.get(normalizeImportKey(alias));
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};
const parseImportNumber = (value, fallback = null) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const cleaned = String(value).replace(/[,\s₹]/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : fallback;
};
const parseImportInteger = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(String(value).replace(/[,\s]/g, ''));
  return Number.isInteger(number) ? number : null;
};
const cleanImportText = (value, maxLength = 500) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
const importRowError = (rowNumber, message) => {
  const error = new Error(`Row ${rowNumber}: ${message}`);
  error.status = 400;
  return error;
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
const ensureReferenceInTransaction = async (tx, table, value) => {
  const name = String(value || '').trim();
  if (!name) return null;
  const existing = await tx.getRecord(`SELECT id, name FROM ${table} WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id LIMIT 1`, [name]);
  if (existing) {
    await tx.runQuery(`UPDATE ${table} SET is_active = TRUE WHERE id = ?`, [existing.id]);
    return existing;
  }
  const result = await tx.runQuery(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
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
    show_wholesale_price_shopkeeper: settingEnabled(settings, 'show_wholesale_price_shopkeeper', true),
    show_purchase_price_shopkeeper: settingEnabled(settings, 'show_purchase_price_shopkeeper', false),
  };
};
const productColumnsForRole = async (role, query = {}, user = null) => {
  const base = ['id', 'name', 'short_name', 'full_model_list', 'brand', 'category', 'part_category', 'quality_variant', 'model', 'sale_price', 'retail_price', 'description', 'colours', 'image_url', 'image_urls', 'is_active', 'shop_id', 'branch_id', 'scope', 'updated_at'];
  let cols = [...base];
  if (role === 'superadmin') {
    cols = [...cols, 'official_price', 'purchase_price', 'wholesale_price'];
  } else if (role === 'supplier' || isShopStaffRole(role)) {
    // Shopkeeper and Supplier roles: Always include wholesale_price and retail_price/sale_price. Strictly exclude purchase_price & cost_price
    cols.push('wholesale_price');
  } else {
    const visibility = await getPriceVisibility();
    if (visibility.show_official_price_shopkeeper) cols.push('official_price');
    if (visibility.show_wholesale_price_shopkeeper) cols.push('wholesale_price');
  }

  const requestedShopId = query.shop_id || query.shopId;
  const userShopId = user && isShopStaffRole(user.role) ? Number(user.shop_id) : null;
  const targetShopId = userShopId || (requestedShopId ? Number(requestedShopId) : null);

  const targetShopScope = (alias) => targetShopId ? `AND ${alias}.shop_id = ${Number(targetShopId)}` : `AND ${alias}.shop_id = (SELECT id FROM shops WHERE location_type = 'warehouse' LIMIT 1)`;

  const stockSubquery = `, COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = p.id ${targetShopScope('ib')}), 0) AS stock_quantity,
    COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = p.id ${targetShopScope('ib')}), 0) AS available_stock,
    COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = p.id ${targetShopScope('ib')}), 0) AS quantity,
    COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = p.id), 0) AS total_stock,
    COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = p.id AND ib.shop_id = (SELECT id FROM shops WHERE location_type = 'warehouse' LIMIT 1)), 0) AS warehouse_stock,
    COALESCE((
      SELECT jsonb_object_agg(COALESCE(NULLIF(TRIM(ib_col.colour), ''), 'Standard'), ib_col.sub_qty)
      FROM (
        SELECT ib2.colour, SUM(ib2.quantity_remaining) AS sub_qty
        FROM inventory_batches ib2
        WHERE ib2.product_id = p.id ${targetShopScope('ib2')} AND ib2.quantity_remaining > 0
        GROUP BY ib2.colour
      ) ib_col
    ), '{}'::jsonb) AS colour_stock,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'batch_id', ib_sup.id,
          'supplier_id', ib_sup.supplier_id,
          'supplier_name', COALESCE(sup.name, s.name, 'Direct Stock'),
          'purchase_price', COALESCE(ib_sup.purchase_price, p.purchase_price, 0),
          'quantity', ib_sup.quantity_remaining,
          'quantity_received', ib_sup.quantity_received,
          'received_date', ib_sup.received_date,
          'notes', ib_sup.notes,
          'shop_id', ib_sup.shop_id,
          'colour', ib_sup.colour
        ) ORDER BY ib_sup.received_date DESC, ib_sup.id DESC
      )
      FROM inventory_batches ib_sup
      LEFT JOIN suppliers sup ON sup.id = ib_sup.supplier_id
      WHERE ib_sup.product_id = p.id ${targetShopScope('ib_sup')} AND ib_sup.quantity_remaining > 0
    ), '[]'::jsonb) AS supplier_batches,
    COALESCE(
      (SELECT CASE 
        WHEN SUM(CASE WHEN ib_cost.quantity_remaining > 0 THEN ib_cost.quantity_remaining ELSE 0 END) > 0 
        THEN ROUND(SUM(CASE WHEN ib_cost.quantity_remaining > 0 THEN COALESCE(ib_cost.purchase_price, p.purchase_price, 0) * ib_cost.quantity_remaining ELSE 0 END)::numeric / SUM(CASE WHEN ib_cost.quantity_remaining > 0 THEN ib_cost.quantity_remaining ELSE 0 END)::numeric, 2)
        ELSE COALESCE((SELECT AVG(ib_p.purchase_price) FROM inventory_batches ib_p WHERE ib_p.product_id = p.id AND ib_p.purchase_price > 0), p.purchase_price, 0)
      END
      FROM inventory_batches ib_cost WHERE ib_cost.product_id = p.id ${targetShopScope('ib_cost')}),
      p.purchase_price,
      0
    ) AS avg_cost_price`;

  let supplierCols = 'NULL::integer AS supplier_id, NULL::text AS supplier_name';
  if (role === 'superadmin') {
    supplierCols = 'p.supplier_id, s.name AS supplier_name';
  } else if (user && isShopStaffRole(user.role) && user.shop_id) {
    supplierCols = `CASE WHEN s.shop_id = ${Number(user.shop_id)} THEN p.supplier_id ELSE NULL END AS supplier_id, CASE WHEN s.shop_id = ${Number(user.shop_id)} THEN s.name ELSE NULL END AS supplier_name`;
  }

  return cols.map(c => `p.${c}`).join(', ') + `, p.company_brand_id, b.name AS company_brand_name, p.manufacturing_brand_id, mb.name AS manufacturing_brand_name, ${supplierCols}, p.part_category_id, pc.name AS part_category_name, p.product_variant_id, pv.name AS product_variant_name, p.model AS display_model` + stockSubquery;
};

const getReferenceData = (user = null) => {
  const role = user?.role;
  const shopId = user && isShopStaffRole(role) ? Number(user.shop_id) : null;
  const cacheKey = `reference-data-${role || 'anon'}-${shopId || 'global'}`;

  return getCached(cacheKey, 300_000, async () => {
    let supplierSql = 'SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, is_active, shop_id, branch_id FROM suppliers WHERE shop_id IS NULL ORDER BY LOWER(TRIM(name)), id';
    let supplierParams = [];

    if (role === 'superadmin') {
      supplierSql = 'SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, is_active, shop_id, branch_id FROM suppliers WHERE shop_id IS NULL ORDER BY LOWER(TRIM(name)), id';
    } else if (shopId) {
      supplierSql = 'SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, is_active, shop_id, branch_id FROM suppliers WHERE shop_id = ? ORDER BY LOWER(TRIM(name)), id';
      supplierParams = [shopId];
    } else {
      supplierSql = 'SELECT id, name, is_active, shop_id, branch_id FROM suppliers WHERE 1=0';
    }

    const [categories, colours, brands, manufacturingBrands, suppliers, partCategories, productVariants] = await Promise.all([
      allRecords('SELECT DISTINCT ON (LOWER(TRIM(name))) id, name FROM categories WHERE is_active = TRUE ORDER BY LOWER(TRIM(name)), id'),
      allRecords('SELECT DISTINCT ON (LOWER(TRIM(name))) id, name FROM colours WHERE is_active = TRUE ORDER BY LOWER(TRIM(name)), id'),
      allRecords('SELECT DISTINCT ON (LOWER(TRIM(name))) id, name FROM brands WHERE is_active = TRUE ORDER BY LOWER(TRIM(name)), id'),
      allRecords('SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, is_active FROM manufacturing_brands ORDER BY LOWER(TRIM(name)), id'),
      allRecords(supplierSql, supplierParams),
      allRecords('SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, is_active FROM part_categories WHERE is_active = TRUE ORDER BY LOWER(TRIM(name)), id'),
      allRecords('SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, is_active FROM product_variants WHERE is_active = TRUE ORDER BY LOWER(TRIM(name)), id'),
    ]);
    return { categories, colours, brands, manufacturingBrands, suppliers, partCategories, productVariants };
  });
};

const getProductsForRole = async (role, query = {}, user = null) => {
  const columns = await productColumnsForRole(role, query, user);
  const pagination = parsePagination(query);
  const params = [];
  const where = ['p.is_active = 1', 'p.name IS NOT NULL'];

  // Scope Isolation: Warehouse vs Branch
  const requestedShopId = query.shop_id || query.shopId;
  const userShopId = user && isShopStaffRole(user.role) ? Number(user.shop_id) : null;
  const activeShopId = userShopId || (requestedShopId ? Number(requestedShopId) : null);

  let isWarehouseScope = false;
  if (!activeShopId) {
    isWarehouseScope = true;
  } else {
    const shopRecord = await getRecord('SELECT id, location_type FROM shops WHERE id = ?', [activeShopId]);
    if (shopRecord?.location_type === 'warehouse') {
      isWarehouseScope = true;
    }
  }

  if (isWarehouseScope) {
    // Warehouse / Owner Catalog: Strictly return only global/warehouse items. Exclude all branch-exclusive products!
    where.push(`(p.shop_id IS NULL OR p.shop_id = (SELECT id FROM shops WHERE location_type = 'warehouse' LIMIT 1))`);
  } else {
    // Branch / Shopkeeper Scope: Return global catalog items + items belonging to this branch. Exclude other branches' items!
    where.push(`(p.shop_id IS NULL OR p.shop_id = ?)`);
    params.push(activeShopId);
  }

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
    "CAST(COALESCE(p.retail_price, p.sale_price, 0) AS TEXT)",
    "CAST(COALESCE(p.sale_price, 0) AS TEXT)",
    "CAST(COALESCE(p.wholesale_price, 0) AS TEXT)",
    "CAST(COALESCE(p.purchase_price, 0) AS TEXT)",
    "CAST(COALESCE(p.official_price, 0) AS TEXT)",
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
      (COALESCE((SELECT SUM(sa.pending_amount) FROM sales sa WHERE sa.shop_id = sh.id), 0) + COALESCE((SELECT SUM(c.opening_balance) FROM customers c WHERE c.shop_id = sh.id), 0)) AS pending
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
const getReadableInventoryScope = async (req) => {
  const requestedShopId = scopeReadableShopId(req);
  if (requestedShopId) return assertShopReadAccess(req, requestedShopId);
  return isShopStaffRole(req.user.role) ? Number(req.user.shop_id) : null;
};
const inventoryJoinScope = (req, shopId, alias = 'ib') => {
  const clauses = [];
  const params = [];
  if (shopId) {
    clauses.push(`${alias}.shop_id = ?`);
    params.push(shopId);
  }
  if (isShopStaffRole(req.user.role)) {
    clauses.push(`(${alias}.assigned_user_id IS NULL OR ${alias}.assigned_user_id = ${Number(req.user.id)})`);
  }
  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params,
  };
};

app.post(['/api/auth/login', '/auth/login'], checkLoginRateLimit, async (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  console.log('[AuthLog] 1. Login request received for username:', username);

  if (!username || !password) return res.status(400).json({ error: 'Enter username and password.' });
  if (username.length > 80 || password.length > 200) return res.status(400).json({ error: 'Username or password is too long.' });

  try {
    const user = await getRecord(`
      SELECT u.id, u.username, u.password, u.role, u.name, u.shop_id, s.name AS shop_name, s.area AS shop_area
      FROM users u
      LEFT JOIN shops s ON s.id = u.shop_id
      WHERE LOWER(TRIM(u.username)) = LOWER(TRIM(?))
    `, [username]);

    console.log('[AuthLog] 2. DB Query executed. User found:', user ? user.username : 'NONE');

    if (!user) {
      console.log('[AuthLog] 3. Failed: User record not found for username:', username);
      recordFailedLogin(req);
      return res.status(401).json({ error: 'Wrong username or password.' });
    }

    const passwordValid = await bcrypt.compare(password, user.password || '');
    console.log('[AuthLog] 4. Password comparison result:', passwordValid);

    if (!passwordValid) {
      console.log('[AuthLog] 5. Failed: Password comparison returned false.');
      recordFailedLogin(req);
      return res.status(401).json({ error: 'Wrong username or password.' });
    }

    if (!VALID_ROLES.has(user.role)) {
      console.log('[AuthLog] 6. Failed: Invalid role:', user.role);
      return res.status(403).json({ error: 'This account has an invalid role. Contact the Super Admin.' });
    }
    if (isShopStaffRole(user.role) && !user.shop_id) {
      console.log('[AuthLog] 7. Failed: Shop staff account missing shop_id.');
      return res.status(403).json({ error: 'This account is not assigned to a shop. Contact the Super Admin.' });
    }

    clearLoginAttempts(req);
    const token = createToken(user);
    console.log('[AuthLog] 8. JWT generated successfully.');

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
  } catch (error) {
    console.error('[AuthLog] EXCEPTION in /api/auth/login:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Internal server error during login execution.' });
  }
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

app.get('/api/bootstrap', authenticateToken, async (req, res) => {
  const [shops, products, reference, priceVisibility, warehouse] = await Promise.all([
    getShopsForUser(req.user),
    getProductsForRole(req.user.role, {}, req.user),
    getReferenceData(req.user),
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
        (SELECT COALESCE(SUM(ib.quantity_remaining), 0) FROM inventory_batches ib JOIN shops wh ON wh.id = ib.shop_id WHERE wh.location_type = 'warehouse') AS warehouse_stock,
        (SELECT COALESCE(SUM(total_amount), 0) FROM sales ${shopId ? 'WHERE shop_id = ? AND' : 'WHERE'} sale_date = ?) AS today_sales,
        (
          (SELECT COALESCE(SUM(pending_amount), 0) FROM sales ${shopId ? 'WHERE shop_id = ? AND' : 'WHERE'} pending_amount > 0)
          + (SELECT COALESCE(SUM(opening_balance), 0) FROM customers ${shopId ? 'WHERE shop_id = ?' : ''})
        ) AS pending_payments
    `, shopId ? [shopId, shopId, today(), shopId, shopId] : [today()]),
        allRecords(`
      SELECT st.id, sh.name AS shop_name, p.id AS product_id, p.name AS product_name, p.short_name AS product_short_name, p.brand,
        ${visibleStockSql} AS quantity, sh.low_stock_threshold
      FROM stock st
      JOIN shops sh ON sh.id = st.shop_id
      JOIN products p ON p.id = st.product_id
      WHERE ${visibleStockSql} > 0 AND ${visibleStockSql} <= COALESCE(sh.low_stock_threshold, 4) ${shopId ? 'AND st.shop_id = ?' : ''}
      ORDER BY quantity ASC, p.name ASC
      LIMIT 12
    `, shopId ? [shopId] : []),
    allRecords(`
      SELECT sh.id, sh.name, sh.area, sh.location_type,
        COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.shop_id = sh.id ${visibleBatchAccess}), 0) AS stock,
        (COALESCE((SELECT SUM(sa.pending_amount) FROM sales sa WHERE sa.shop_id = sh.id), 0) + COALESCE((SELECT SUM(c.opening_balance) FROM customers c WHERE c.shop_id = sh.id), 0)) AS pending,
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
      SELECT p.id, p.name, p.short_name, p.full_model_list, p.brand, p.category, p.model, p.description, p.colours, p.official_price, p.sale_price,
        COALESCE(SUM(ib.quantity_remaining), 0) AS available_stock,
        COALESCE((SELECT SUM(wib.quantity_remaining) FROM inventory_batches wib JOIN shops wh ON wh.id = wib.shop_id WHERE wib.product_id = p.id AND wh.location_type = 'warehouse'), 0) AS warehouse_stock,
        STRING_AGG(DISTINCT CASE WHEN ib.quantity_remaining > 0 THEN sh.name END, ', ') AS available_locations
      FROM products p
      LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.quantity_remaining > 0 ${shopId ? 'AND ib.shop_id = ?' : ''}
      LEFT JOIN shops sh ON sh.id = ib.shop_id
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY COALESCE(p.short_name, p.name)
      LIMIT 500
    `, shopId ? [shopId] : []),
  ]);

  const trendValues = (rows) => {
    const valuesByDay = new Map(rows.map((row) => [String(row.day).slice(0, 10), money(row.value)]));
    return trendDays.map((day) => valuesByDay.get(day) || 0);
  };

  const mfgProducts = await allRecords(`
    SELECT mb.id, mb.name, COUNT(DISTINCT p.id) AS products_count
    FROM manufacturing_brands mb
    LEFT JOIN products p ON p.manufacturing_brand_id = mb.id AND p.is_active = 1
    WHERE mb.is_active = TRUE
    GROUP BY mb.id, mb.name
    ORDER BY products_count DESC
  `);

  const mfgStockAndValue = await allRecords(`
    SELECT mb.id, mb.name,
      COALESCE(SUM(ib.quantity_remaining), 0) AS stock_qty,
      COALESCE(SUM(ib.quantity_remaining * COALESCE(ib.purchase_price, p.purchase_price, 0)), 0) AS inventory_value
    FROM manufacturing_brands mb
    LEFT JOIN products p ON p.manufacturing_brand_id = mb.id AND p.is_active = 1
    LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.quantity_remaining > 0 ${shopId ? 'AND ib.shop_id = ?' : ''} ${visibleBatchAccess}
    WHERE mb.is_active = TRUE
    GROUP BY mb.id, mb.name
    ORDER BY stock_qty DESC, inventory_value DESC
  `, shopId ? [shopId] : []);

  const mfgMostSold = await allRecords(`
    SELECT mb.id, mb.name, COALESCE(SUM(sa.quantity), 0) AS quantity_sold
    FROM manufacturing_brands mb
    LEFT JOIN sales sa ON sa.manufacturing_brand_id = mb.id ${shopId ? 'AND sa.shop_id = ?' : ''}
    WHERE mb.is_active = TRUE
    GROUP BY mb.id, mb.name
    ORDER BY quantity_sold DESC
    LIMIT 6
  `, shopId ? [shopId] : []);

  const mfgLowStock = await allRecords(`
    SELECT mb.id, mb.name, COUNT(DISTINCT p.id) AS low_stock_count
    FROM manufacturing_brands mb
    LEFT JOIN products p ON p.manufacturing_brand_id = mb.id AND p.is_active = 1
    LEFT JOIN stock st ON st.product_id = p.id ${shopId ? 'AND st.shop_id = ?' : ''}
    LEFT JOIN shops sh ON sh.id = st.shop_id
    WHERE mb.is_active = TRUE 
      AND st.quantity > 0 
      AND st.quantity <= COALESCE(sh.low_stock_threshold, 4)
    GROUP BY mb.id, mb.name
    ORDER BY low_stock_count DESC
  `, shopId ? [shopId] : []);

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
    mfgBrandStats: {
      products: mfgProducts,
      stockAndValue: mfgStockAndValue,
      mostSold: mfgMostSold,
      lowStock: mfgLowStock
    }
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

app.put('/api/shopkeepers/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const shopkeeperId = Number(req.params.id);
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    const contact = String(req.body.contact || '').trim();
    const shopId = Number(req.body.shop_id);

    if (!Number.isInteger(shopkeeperId) || shopkeeperId <= 0) {
      return res.status(400).json({ error: 'Choose a valid shopkeeper.' });
    }
    if (!username || !name || !Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'Username, name and shop are required.' });
    }
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-40 characters and use only letters, numbers, dots, dashes, or underscores.' });
    }
    if (password && (password.length < 8 || password.length > 200)) {
      return res.status(400).json({ error: 'New password must contain between 8 and 200 characters.' });
    }
    if (name.length > 80 || contact.length > 30) {
      return res.status(400).json({ error: 'Name or mobile number is too long.' });
    }

    const [shopkeeper, shop, existingUser] = await Promise.all([
      getRecord("SELECT id, username, name FROM users WHERE id = ? AND role IN ('shopkeeper', 'admin')", [shopkeeperId]),
      getRecord('SELECT id FROM shops WHERE id = ?', [shopId]),
      getRecord('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id <> ?', [username, shopkeeperId]),
    ]);
    if (!shopkeeper) return res.status(404).json({ error: 'Shopkeeper not found.' });
    if (!shop) return res.status(400).json({ error: 'Choose a valid shop.' });
    if (existingUser) return res.status(409).json({ error: 'That username is already in use.' });

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await runQuery(
        "UPDATE users SET username = ?, password = ?, name = ?, contact = ?, shop_id = ? WHERE id = ? AND role IN ('shopkeeper', 'admin')",
        [username, hash, name, contact, shopId, shopkeeperId]
      );
    } else {
      await runQuery(
        "UPDATE users SET username = ?, name = ?, contact = ?, shop_id = ? WHERE id = ? AND role IN ('shopkeeper', 'admin')",
        [username, name, contact, shopId, shopkeeperId]
      );
    }

    sessionUserCache.delete(shopkeeperId);
    await audit(req, 'Updated shopkeeper login', 'user', shopkeeperId, `${name} (@${username})`);
    res.json({ id: shopkeeperId, username, name, contact, shop_id: shopId });
  } catch (error) {
    console.error('[Shopkeepers] Update failed:', error);
    res.status(500).json({ error: 'Unable to update this shopkeeper right now.' });
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

app.get('/api/reference-data', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  let user = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      user = await getSessionUser(decoded.id);
    } catch {
      // ignore invalid token for reference-data
    }
  }
  res.json(await getReferenceData(user));
});

app.post('/api/reference-data/:type', authenticateToken, requireShopStaff, async (req, res) => {
  const tables = { categories: 'categories', colours: 'colours', brands: 'brands', 'manufacturing-brands': 'manufacturing_brands', suppliers: 'suppliers' };
  const table = tables[req.params.type];
  const name = String(req.body.name || '').trim();
  if (!table || !name) return res.status(400).json({ error: 'Choose a valid reference type and enter a name.' });
  
  // Non-superadmins (shopkeepers) can add colours and suppliers. Brands and categories are superadmin-only.
  if (req.user.role !== 'superadmin' && req.params.type !== 'colours' && req.params.type !== 'suppliers') {
    return res.status(403).json({ error: 'Only the Super Admin can add categories or brands.' });
  }
  
  let reference;
  if (table === 'suppliers') {
    const isSuperAdmin = req.user.role === 'superadmin';
    const shopId = isSuperAdmin ? null : Number(req.user.shop_id);
    const existing = await getRecord(
      shopId 
        ? 'SELECT id, name, is_active, shop_id, branch_id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND shop_id = ?' 
        : 'SELECT id, name, is_active, shop_id, branch_id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND shop_id IS NULL',
      shopId ? [name, shopId] : [name]
    );
    if (existing) {
      await runQuery('UPDATE suppliers SET is_active = TRUE WHERE id = ?', [existing.id]);
      reference = { ...existing, is_active: true };
    } else {
      const result = await runQuery(
        'INSERT INTO suppliers (name, shop_id, branch_id, created_by, is_active) VALUES (?, ?, ?, ?, TRUE)',
        [name, shopId, shopId, req.user.id]
      );
      reference = { id: result.id, name, shop_id: shopId, branch_id: shopId, is_active: true };
    }
  } else {
    reference = await ensureReference(table, name);
  }

  const singularType = { categories: 'category', colours: 'colour', brands: 'brand', 'manufacturing-brands': 'manufacturing_brand', suppliers: 'supplier' }[req.params.type];
  invalidateCache('reference-data');
  await audit(req, `Added ${singularType}`, singularType, reference.id, reference.name);
  res.status(201).json(reference);
});

app.put('/api/reference-data/:type/:id', authenticateToken, requireShopStaff, async (req, res) => {
  const tables = { categories: 'categories', colours: 'colours', brands: 'brands', 'manufacturing-brands': 'manufacturing_brands', suppliers: 'suppliers' };
  const table = tables[req.params.type];
  const name = String(req.body.name || '').trim();
  const id = Number(req.params.id);
  if (!table || !name || isNaN(id)) return res.status(400).json({ error: 'Invalid reference update request.' });

  // Only Super Admin can rename brands, categories. Colours and suppliers can be modified by shop staff.
  if (req.user.role !== 'superadmin' && table !== 'colours' && table !== 'suppliers') {
    return res.status(403).json({ error: 'Only the Super Admin can modify categories or brands.' });
  }

  const oldItem = await getRecord(`SELECT id, name, ${table === 'suppliers' ? 'shop_id' : 'NULL'} AS shop_id FROM ${table} WHERE id = ?`, [id]);
  if (!oldItem) return res.status(404).json({ error: 'Reference item not found.' });

  if (table === 'suppliers' && req.user.role !== 'superadmin') {
    const ownShopId = Number(req.user.shop_id);
    if (!oldItem.shop_id || Number(oldItem.shop_id) !== ownShopId) {
      return res.status(403).json({ error: 'You can only modify suppliers belonging to your branch.' });
    }
  }

  // Case-insensitive duplicate check scoped by shop
  let duplicate = null;
  if (table === 'suppliers') {
    const shopId = oldItem.shop_id ? Number(oldItem.shop_id) : null;
    duplicate = await getRecord(
      shopId
        ? `SELECT id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND shop_id = ? AND id != ?`
        : `SELECT id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND shop_id IS NULL AND id != ?`,
      shopId ? [name, shopId, id] : [name, id]
    );
  } else {
    duplicate = await getRecord(`SELECT id FROM ${table} WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?`, [name, id]);
  }
  if (duplicate) return res.status(409).json({ error: 'A reference item with this name already exists.' });

  const is_active = req.body.is_active !== undefined ? Boolean(req.body.is_active) : null;
  await runTransaction(async (tx) => {
    if (name) {
      await tx.runQuery(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, id]);
    }
    if (is_active !== null) {
      await tx.runQuery(`UPDATE ${table} SET is_active = ? WHERE id = ?`, [is_active, id]);
    }
    if (table === 'brands') {
      await tx.runQuery('UPDATE products SET brand = ? WHERE brand = ?', [name, oldItem.name]);
    } else if (table === 'categories') {
      await tx.runQuery('UPDATE products SET category = ? WHERE category = ?', [name, oldItem.name]);
    } else if (table === 'colours') {
      await tx.runQuery('UPDATE products SET colours = array_replace(colours, ?, ?) WHERE ? = ANY(colours)', [oldItem.name, name, oldItem.name]);
      await tx.runQuery('UPDATE inventory_batches SET colour = ? WHERE colour = ?', [name, oldItem.name]);
    }
  });

  invalidateCache('reference-data');
  await audit(req, `Renamed ${req.params.type.slice(0, -1)}`, req.params.type.slice(0, -1), id, `${oldItem.name} -> ${name}`);
  res.json({ success: true, id, name });
});

app.delete('/api/reference-data/:type/:id', authenticateToken, requireShopStaff, async (req, res) => {
  const tables = { categories: 'categories', colours: 'colours', brands: 'brands', 'manufacturing-brands': 'manufacturing_brands', suppliers: 'suppliers' };
  const table = tables[req.params.type];
  const id = Number(req.params.id);
  if (!table || isNaN(id)) return res.status(400).json({ error: 'Invalid reference delete request.' });

  // Only Super Admin can delete categories, brands. Colours and suppliers can be deleted by shop staff.
  if (req.user.role !== 'superadmin' && table !== 'colours' && table !== 'suppliers') {
    return res.status(403).json({ error: 'Only the Super Admin can delete categories or brands.' });
  }

  const item = await getRecord(`SELECT id, name, ${table === 'suppliers' ? 'shop_id' : 'NULL'} AS shop_id FROM ${table} WHERE id = ?`, [id]);
  if (!item) return res.status(404).json({ error: 'Reference item not found.' });

  if (table === 'suppliers' && req.user.role !== 'superadmin') {
    const ownShopId = Number(req.user.shop_id);
    if (!item.shop_id || Number(item.shop_id) !== ownShopId) {
      return res.status(403).json({ error: 'You can only delete suppliers belonging to your branch.' });
    }
  }

  if (table === 'manufacturing_brands') {
    const referenced = await getRecord(`
      SELECT 
        (SELECT COUNT(*) FROM products WHERE manufacturing_brand_id = ?) AS product_count,
        (SELECT COUNT(*) FROM sales WHERE manufacturing_brand_id = ?) AS sale_count,
        (SELECT COUNT(*) FROM inventory_batches WHERE manufacturing_brand_id = ?) AS batch_count
    `, [id, id, id]);
    const totalRefs = Number(referenced?.product_count || 0) + Number(referenced?.sale_count || 0) + Number(referenced?.batch_count || 0);
    if (totalRefs > 0) {
      return res.status(400).json({ error: 'This Manufacturing Brand is linked to existing products or transaction records. It cannot be permanently deleted. Mark it as Inactive instead.' });
    }
    await runTransaction(async (tx) => {
      await tx.runQuery(`DELETE FROM ${table} WHERE id = ?`, [id]);
    });
  } else if (table === 'suppliers') {
    const referenced = await getRecord(`
      SELECT COUNT(*) AS count FROM inventory_batches WHERE supplier_id = ?
    `, [id]);
    if (Number(referenced?.count || 0) > 0) {
      return res.status(400).json({ error: 'This Supplier is linked to existing stock records. It cannot be permanently deleted. Mark it as Inactive instead.' });
    }
    await runTransaction(async (tx) => {
      await tx.runQuery(`DELETE FROM ${table} WHERE id = ?`, [id]);
    });
  } else {
    await runTransaction(async (tx) => {
      await tx.runQuery(`UPDATE ${table} SET is_active = FALSE WHERE id = ?`, [id]);
    });
  }

  invalidateCache('reference-data');
  await audit(req, `Archived ${req.params.type.slice(0, -1)}`, req.params.type.slice(0, -1), id, item.name);
  res.json({ success: true, id });
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
    const exportShopId = isShopStaffRole(req.user.role) ? Number(req.user.shop_id) : (req.query.shopId ? Number(req.query.shopId) : null);
    let scopeFilter = "(p.shop_id IS NULL OR p.shop_id = (SELECT id FROM shops WHERE location_type = 'warehouse' LIMIT 1))";
    if (exportShopId) {
      scopeFilter = `(p.shop_id IS NULL OR p.shop_id = ${exportShopId})`;
    }
    return res.json(await allRecords(`
      SELECT ${columns} 
      FROM products p 
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN part_categories pc ON pc.id = p.part_category_id
      LEFT JOIN product_variants pv ON pv.id = p.product_variant_id
      WHERE p.is_active = 1 AND ${scopeFilter}
      ORDER BY p.brand, COALESCE(p.short_name, p.name)
    `));
  }

  const shopId = isShopStaffRole(req.user.role) ? Number(req.user.shop_id) : Number(req.query.shopId || 0);
  const visibility = await getPriceVisibility();
   // Use product level prices for the export instead of batch-level prices.
  const priceColumns = req.user.role === 'superadmin'
    ? 'p.purchase_price, p.wholesale_price, p.sale_price,'
    : 'p.wholesale_price, p.sale_price,';
  const params = [];
  const where = ['1 = 1', 'p.is_active = 1'];
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
  
  // Scopes and permissions checks
  if (req.user.role === 'superadmin' && shopkeeperId) {
    where.push('ib.assigned_user_id = ?');
    params.push(shopkeeperId);
  }

  // Filter by stock status
  const stockQuantitySql = 'COALESCE(SUM(ib.quantity_remaining), 0)';
  const having = [];
  if (status === 'in_stock') having.push(`${stockQuantitySql} > COALESCE(sh.low_stock_threshold, 4)`);
  if (status === 'out_of_stock') having.push(`${stockQuantitySql} = 0`);
  if (status === 'low_stock') having.push(`${stockQuantitySql} > 0 AND ${stockQuantitySql} <= COALESCE(sh.low_stock_threshold, 4)`);

  const rows = await allRecords(`
    SELECT p.short_name AS product_name, p.full_model_list AS model_name, p.brand, p.category, p.model,
      ib.colour, ${priceColumns} SUM(ib.quantity_remaining) AS quantity, SUM(ib.quantity_received) AS quantity_received,
      sh.name AS shop_name, u.name AS shopkeeper_name, MAX(ib.received_date) AS date_added,
      CASE
        WHEN SUM(ib.quantity_remaining) = 0 THEN 'Out of Stock'
        WHEN SUM(ib.quantity_remaining) <= COALESCE(sh.low_stock_threshold, 4) THEN 'Low Stock'
        ELSE 'In Stock'
      END AS stock_status
    FROM inventory_batches ib
    JOIN products p ON p.id = ib.product_id
    JOIN shops sh ON sh.id = ib.shop_id
    LEFT JOIN users u ON u.id = ib.assigned_user_id
    WHERE ${where.join(' AND ')} ${batchAccessSql(req.user)}
    GROUP BY p.id, p.short_name, p.full_model_list, p.brand, p.category, p.model, ib.colour,
      p.purchase_price, p.wholesale_price, p.sale_price, sh.name, u.name
    ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
    ORDER BY p.brand, COALESCE(p.short_name, p.name)
  `, params);
  res.json(rows);
});

app.get('/api/brands', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = await getReadableInventoryScope(req);
  const scope = inventoryJoinScope(req, shopId);
  const rows = await allRecords(`
    SELECT b.id, b.name AS brand,
      COUNT(DISTINCT p.id) AS product_count,
      COALESCE(SUM(ib.quantity_remaining), 0) AS quantity,
      COALESCE(SUM(ib.quantity_remaining * COALESCE(p.sale_price, p.retail_price, p.official_price, 0)), 0) AS stock_value,
      COUNT(DISTINCT p.id) FILTER (WHERE ib.quantity_remaining > 0 AND ib.quantity_remaining <= COALESCE(sh.low_stock_threshold, 4)) AS low_stock_products,
      MAX(ib.received_date) AS last_stocked_at
    FROM brands b
    LEFT JOIN products p ON LOWER(TRIM(p.brand)) = LOWER(TRIM(b.name)) AND p.is_active = 1
    LEFT JOIN inventory_batches ib ON ib.product_id = p.id ${scope.sql}
    LEFT JOIN shops sh ON sh.id = ib.shop_id
    WHERE b.is_active = TRUE
    GROUP BY b.id, b.name
    ORDER BY b.name
  `, scope.params);
  res.json(rows);
});

app.get('/api/manufacturing-brands', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = await getReadableInventoryScope(req);
  const scope = inventoryJoinScope(req, shopId);
  const rows = await allRecords(`
    SELECT mb.id, mb.name AS brand, mb.is_active,
      COUNT(DISTINCT p.id) AS product_count,
      COALESCE(SUM(ib.quantity_remaining), 0) AS quantity,
      COALESCE(SUM(ib.quantity_remaining * COALESCE(p.sale_price, p.retail_price, p.official_price, 0)), 0) AS stock_value,
      COUNT(DISTINCT p.id) FILTER (WHERE ib.quantity_remaining > 0 AND ib.quantity_remaining <= COALESCE(sh.low_stock_threshold, 4)) AS low_stock_products,
      MAX(ib.received_date) AS last_stocked_at
    FROM manufacturing_brands mb
    LEFT JOIN products p ON p.manufacturing_brand_id = mb.id AND p.is_active = 1
    LEFT JOIN inventory_batches ib ON ib.product_id = p.id ${scope.sql}
    LEFT JOIN shops sh ON sh.id = ib.shop_id
    GROUP BY mb.id, mb.name, mb.is_active
    ORDER BY mb.name
  `, scope.params);
  res.json(rows);
});

app.get('/api/brand-products', authenticateToken, requireShopStaff, async (req, res) => {
  const brand = cleanQueryText(req.query.brand, 120);
  if (!brand) return res.status(400).json({ error: 'Brand is required.' });
  
  const shopId = await getReadableInventoryScope(req);
  const includeWarehouse = isShopStaffRole(req.user.role) && String(req.query.includeWarehouse || '').toLowerCase() === 'true';
  const warehouse = includeWarehouse ? await getWarehouse() : null;

  const joinClauses = [];
  const joinParams = [];

  if (shopId && includeWarehouse && warehouse?.id && Number(warehouse.id) !== Number(shopId)) {
    joinClauses.push('(ib.shop_id = ? OR ib.shop_id = ?)');
    joinParams.push(shopId, Number(warehouse.id));
  } else if (shopId) {
    joinClauses.push('ib.shop_id = ?');
    joinParams.push(shopId);
  }

  if (isShopStaffRole(req.user.role)) {
    joinClauses.push(`(ib.assigned_user_id IS NULL OR ib.assigned_user_id = ${Number(req.user.id)})`);
  }

  const joinSql = joinClauses.length ? ` AND ${joinClauses.join(' AND ')}` : '';
  const extraPrices = req.user.role === 'superadmin'
    ? ', p.purchase_price, p.wholesale_price'
    : ', p.wholesale_price';
  const officialPrice = req.user.role === 'superadmin' || visibility.show_official_price_shopkeeper ? ', p.official_price' : '';
  const productScopeSql = shopId 
    ? `AND (p.shop_id IS NULL OR p.shop_id = ${Number(shopId)})`
    : `AND (p.shop_id IS NULL OR p.shop_id = (SELECT id FROM shops WHERE location_type = 'warehouse' LIMIT 1))`;
    const rows = await allRecords(`
    SELECT p.id, p.name, p.short_name, p.full_model_list, p.brand, p.category, p.model,
      p.sale_price, p.retail_price, p.description, p.colours, p.updated_at,
      p.company_brand_id, b.name AS company_brand_name,
      p.manufacturing_brand_id, mb.name AS manufacturing_brand_name, p.model AS display_model
      ${officialPrice}${extraPrices},
      COALESCE(SUM(ib.quantity_remaining), 0) AS quantity,
      COALESCE(SUM(CASE WHEN ib.assigned_user_id IS NULL THEN ib.quantity_remaining ELSE 0 END), 0) AS owner_quantity,
      COALESCE(SUM(CASE WHEN ib.assigned_user_id IS NOT NULL THEN ib.quantity_remaining ELSE 0 END), 0) AS shopkeeper_quantity,
      COALESCE(SUM(CASE WHEN ib.assigned_user_id = ${Number(req.user.id)} THEN ib.quantity_remaining ELSE 0 END), 0) AS my_quantity,
      MAX(ib.received_date) AS last_stocked_at,
      STRING_AGG(DISTINCT NULLIF(TRIM(ib.colour), ''), ', ') FILTER (WHERE NULLIF(TRIM(ib.colour), '') IS NOT NULL) AS stock_colours
    FROM products p
    LEFT JOIN brands b ON b.id = p.company_brand_id
    LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
    LEFT JOIN inventory_batches ib ON ib.product_id = p.id ${joinSql}
    WHERE p.is_active = 1 ${productScopeSql} AND LOWER(TRIM(p.brand)) = LOWER(TRIM(?))
    GROUP BY p.id, b.id, mb.id
    ORDER BY COALESCE(p.short_name, p.name)
  `, [...joinParams, brand]);
  res.json(rows);
});

const buildImportProductPayload = (row, rowNumber) => {
  const shortName = cleanImportText(getImportValue(row, ['short_name', 'short name', 'product_name', 'product name', 'display_name', 'display name', 'name']), 180);
  const fullModelList = cleanImportText(getImportValue(row, ['full_model_list', 'compatible_models', 'compatible models', 'models', 'model_list', 'model list', 'compatibility']), 600) || shortName;
  const model = cleanImportText(getImportValue(row, ['model', 'mobile_model', 'mobile model', 'phone_model', 'phone model', 'model_code', 'model code']), 160);
  const detectedBrand = detectBrandFromProductText(`${shortName} ${fullModelList} ${model}`);
  const brand = cleanImportText(getImportValue(row, ['brand', 'company', 'mobile_brand', 'mobile brand']), 120) || detectedBrand;
  const category = cleanImportText(getImportValue(row, ['category', 'product_category', 'product category', 'type']), 120) || 'Displays';
  const manufacturing_brand = cleanImportText(getImportValue(row, ['manufacturing_brand', 'manufacturing brand', 'mfg_brand', 'mfg brand', 'maker']), 120);
  const colour = cleanImportText(getImportValue(row, ['colour', 'color', 'shade']), 120);
  const quantity = parseImportInteger(getImportValue(row, ['quantity', 'qty', 'stock', 'opening_stock', 'opening stock', 'pieces', 'pcs']), 0);
  const salePrice = parseImportNumber(getImportValue(row, ['sale_price', 'sale price', 'selling_price', 'selling price', 'retail_price', 'retail price', 'price', 'mrp']), null);
  const purchasePrice = parseImportNumber(getImportValue(row, ['purchase_price', 'purchase price', 'cost_price', 'cost price', 'cost']), null);
  const wholesalePrice = parseImportNumber(getImportValue(row, ['wholesale_price', 'wholesale price', 'wholesale']), null);
  const description = cleanImportText(getImportValue(row, ['description', 'notes', 'note']), 600);
  const receivedDate = cleanImportText(getImportValue(row, ['received_date', 'received date', 'date', 'stock_date', 'stock date']), 20) || today();
  const colours = normalizeColours([
    colour,
    ...String(getImportValue(row, ['colours', 'colors']) || '').split(','),
  ]);

  if (!shortName) throw importRowError(rowNumber, 'Product name is required.');
  if (!brand) throw importRowError(rowNumber, 'Brand is required, or include iPhone/iPad/Apple in the product name for auto-detection.');
  if (!category) throw importRowError(rowNumber, 'Category is required.');
  if (quantity === null || quantity < 0) throw importRowError(rowNumber, 'Quantity must be a whole number 0 or more.');
  if (salePrice !== null && salePrice <= 0) throw importRowError(rowNumber, 'Sale price must be greater than 0 when provided.');
  if ([purchasePrice, wholesalePrice].some((price) => price !== null && price < 0)) throw importRowError(rowNumber, 'Cost and wholesale prices must be 0 or more.');

  return {
    shortName,
    fullModelList,
    brand,
    category,
    manufacturing_brand,
    model,
    colour,
    colours,
    quantity,
    salePrice,
    purchasePrice,
    wholesalePrice,
    description,
    receivedDate,
  };
};

const resolveImportShopId = async (tx, req, row, fallbackShopId, rowNumber, needsStock) => {
  if (isShopStaffRole(req.user.role)) return Number(req.user.shop_id);
  const rawShopId = getImportValue(row, ['shop_id', 'shop id', 'branch_id', 'branch id']);
  if (rawShopId) return requireScopedShopId(req, rawShopId);

  const shopName = cleanImportText(getImportValue(row, ['shop', 'shop_name', 'shop name', 'branch', 'branch_name', 'branch name']), 160);
  if (shopName) {
    const shop = await tx.getRecord(`
      SELECT id FROM shops
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR LOWER(TRIM(area)) = LOWER(TRIM(?))
      ORDER BY id LIMIT 1
    `, [shopName, shopName]);
    if (!shop) throw importRowError(rowNumber, `Shop or branch "${shopName}" was not found.`);
    return requireScopedShopId(req, shop.id);
  }

  if (fallbackShopId) return requireScopedShopId(req, fallbackShopId);
  if (!needsStock) return null;
  throw importRowError(rowNumber, 'Select a shop before importing stock, or include a shop column.');
};

const findImportProduct = async (tx, payload) => tx.getRecord(`
  SELECT * FROM products
  WHERE is_active = 1
    AND company_brand_id = ?
    AND manufacturing_brand_id = ?
    AND (
      LOWER(TRIM(short_name)) = LOWER(TRIM(?))
      OR LOWER(TRIM(name)) = LOWER(TRIM(?))
      OR LOWER(TRIM(full_model_list)) = LOWER(TRIM(?))
      OR (? <> '' AND LOWER(TRIM(model)) = LOWER(TRIM(?)))
    )
  ORDER BY id LIMIT 1
`, [payload.company_brand_id, payload.manufacturing_brand_id, payload.shortName, payload.shortName, payload.fullModelList, payload.model || '', payload.model || '']);

const handleGetBrands = async (req, res) => {
  try {
    const rows = await allRecords(`
      SELECT p.brand, COUNT(DISTINCT p.id) AS product_count, COALESCE(SUM(ib.quantity_remaining), 0) AS quantity, COALESCE(SUM(ib.quantity_remaining * p.sale_price), 0) AS stock_value
      FROM products p
      LEFT JOIN inventory_batches ib ON ib.product_id = p.id
      WHERE p.is_active = 1 AND p.brand IS NOT NULL AND TRIM(p.brand) != ''
      GROUP BY p.brand
      ORDER BY p.brand ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[BrandsAPI] Error fetching brands:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch brands summary' });
  }
};

app.get(['/api/products', '/products'], authenticateToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';
    const isShopkeeper = isShopStaffRole(req.user.role);
    const visibility = await getPriceVisibility();
    const extraPrices = isSuperAdmin
      ? ', p.purchase_price, p.wholesale_price'
      : `${visibility.show_purchase_price_shopkeeper ? ', p.purchase_price' : ''}${visibility.show_wholesale_price_shopkeeper ? ', p.wholesale_price' : ''}`;
    const officialPrice = isSuperAdmin || visibility.show_official_price_shopkeeper ? ', p.official_price' : '';

    const limit = req.query.limit ? Math.min(Number(req.query.limit), 10000) : 10000;
    const search = cleanQueryText(req.query.search, 120);

    const where = ['p.is_active = 1'];
    const params = [];

    if (search) {
      appendSearchFilter(where, params, search, [
        'p.name',
        "COALESCE(p.short_name, '')",
        "COALESCE(p.full_model_list, '')",
        "COALESCE(p.brand, '')",
        "COALESCE(p.category, '')",
        "COALESCE(p.part_category, '')",
        "COALESCE(p.quality_variant, '')",
        "COALESCE(p.model, '')",
        "COALESCE(p.description, '')",
      ]);
    }

    const rows = await allRecords(`
      SELECT p.id, p.name, p.short_name, p.full_model_list, p.brand,
        COALESCE(p.part_category, p.category, 'Display') AS category,
        COALESCE(p.part_category, p.category, 'Display') AS part_category,
        p.quality_variant, p.part_category_id, p.product_variant_id, p.model,
        p.sale_price, p.retail_price, p.wholesale_price, p.purchase_price, p.description, p.colours,
        p.company_brand_id, b.name AS company_brand_name,
        p.manufacturing_brand_id, mb.name AS manufacturing_brand_name,
        p.supplier_id, s.name AS supplier_name,
        pc.name AS part_category_name, pv.name AS product_variant_name
        ${officialPrice}
      FROM products p
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN part_categories pc ON pc.id = p.part_category_id
      LEFT JOIN product_variants pv ON pv.id = p.product_variant_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.brand, COALESCE(p.short_name, p.name)
      LIMIT ?
    `, [...params, limit]);

    res.json(rows);
  } catch (error) {
    console.error('[ProductsAPI] Error fetching products:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch products' });
  }
});

app.put(['/api/products/:id', '/products/:id'], authenticateToken, async (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ error: 'Invalid product ID' });

  const isSuperAdmin = req.user.role === 'superadmin';
  const isShopkeeper = req.user.role === 'shopkeeper' || req.user.role === 'admin' || req.user.role === 'shop_staff';
  const canEditSellingPrice = isSuperAdmin || isShopkeeper;
  const { short_name, name, brand, category, part_category, quality_variant, full_model_list, model, sale_price, retail_price, wholesale_price, purchase_price, official_price, description, colours, shop_id, manufacturing_brand_id, supplier_id, stock_status, set_stock_zero, stock_quantity, image_url, image_urls } = req.body;
 
  // Shopkeepers and Superadmins can update selling price (sale_price). Cost and wholesale are superadmin only.
  const targetSalePrice = sale_price ?? retail_price;
  const newSalePrice = canEditSellingPrice && targetSalePrice !== undefined && targetSalePrice !== null && targetSalePrice !== '' ? Number(targetSalePrice) : null;
  const newWholesalePrice = isSuperAdmin && wholesale_price !== undefined && wholesale_price !== null && wholesale_price !== '' ? Number(wholesale_price) : null;
  const newPurchasePrice = isSuperAdmin && purchase_price !== undefined && purchase_price !== null && purchase_price !== '' ? Number(purchase_price) : null;
  const newOfficialPrice = isSuperAdmin && official_price !== undefined && official_price !== null && official_price !== '' ? Number(official_price) : (newSalePrice ?? null);

  try {
    const oldProduct = await getRecord('SELECT * FROM products WHERE id = ?', [productId]);
    if (!oldProduct) return res.status(404).json({ error: 'Product not found.' });

    // Clean up old R2 image if image changed/removed
    if (image_url !== undefined && oldProduct.image_url && oldProduct.image_url !== image_url) {
      deleteImageFromR2(oldProduct.image_url).catch((err) => console.warn('[R2 Delete Old Image Warning]', err.message));
    }

    const finalImageUrl = image_url !== undefined ? (image_url ? String(image_url).trim() : null) : oldProduct.image_url;
    const finalImageUrls = image_urls !== undefined 
      ? (typeof image_urls === 'string' ? image_urls : JSON.stringify(image_urls))
      : (oldProduct.image_urls ? (typeof oldProduct.image_urls === 'string' ? oldProduct.image_urls : JSON.stringify(oldProduct.image_urls)) : JSON.stringify(finalImageUrl ? [finalImageUrl] : []));

    const brandRef = brand ? await ensureReference('brands', brand) : null;
    const canonicalBrand = brandRef ? brandRef.name : (brand || oldProduct.brand || null);
    const companyBrandId = brandRef ? brandRef.id : oldProduct.company_brand_id;
    const targetMfgBrandId = manufacturing_brand_id !== undefined ? (manufacturing_brand_id ? Number(manufacturing_brand_id) : null) : oldProduct.manufacturing_brand_id;

    if (targetMfgBrandId) {
      const mfgBrand = await getRecord('SELECT id FROM manufacturing_brands WHERE id = ?', [targetMfgBrandId]);
      if (!mfgBrand) return res.status(400).json({ error: 'Selected manufacturing brand is invalid.' });
    }

    const targetSupplierId = supplier_id !== undefined ? (supplier_id ? Number(supplier_id) : null) : oldProduct.supplier_id;
    if (targetSupplierId) {
      const supplier = await getRecord('SELECT id FROM suppliers WHERE id = ?', [targetSupplierId]);
      if (!supplier) return res.status(400).json({ error: 'Selected supplier is invalid.' });
    }

    const rawCategoryInput = part_category || req.body.part_category_name || category || oldProduct.part_category || oldProduct.category || 'Display';
    const partCategoryRef = rawCategoryInput ? await ensureReference('part_categories', rawCategoryInput) : null;
    const rawVariantInput = quality_variant !== undefined ? quality_variant : (req.body.product_variant_name !== undefined ? req.body.product_variant_name : oldProduct.quality_variant);
    const productVariantRef = (rawVariantInput && String(rawVariantInput).trim()) ? await ensureReference('product_variants', rawVariantInput) : null;
    const targetPartCategoryId = partCategoryRef ? partCategoryRef.id : (req.body.part_category_id ? Number(req.body.part_category_id) : oldProduct.part_category_id);
    const targetProductVariantId = productVariantRef ? productVariantRef.id : (quality_variant === '' || quality_variant === null ? null : oldProduct.product_variant_id);
    const canonicalPartCategory = partCategoryRef ? partCategoryRef.name : String(rawCategoryInput).trim();
    const canonicalQualityVariant = productVariantRef ? productVariantRef.name : (quality_variant !== undefined ? (quality_variant ? String(quality_variant).trim() : null) : oldProduct.quality_variant);

    let canonicalColours = undefined;
    if (colours !== undefined) {
      canonicalColours = [];
      for (const colour of normalizeColours(colours)) {
        const colRef = await ensureReference('colours', colour);
        if (colRef) canonicalColours.push(colRef.name);
      }
    }

    // Check duplicate composite combination
    let duplicate = null;
    const cleanModel = String(model !== undefined ? (model || '') : (oldProduct.model || '')).trim();
    if (cleanModel && targetPartCategoryId) {
      duplicate = await getRecord(
        `SELECT id FROM products 
         WHERE company_brand_id IS NOT DISTINCT FROM ? 
           AND LOWER(TRIM(model)) = LOWER(?) 
           AND part_category_id IS NOT DISTINCT FROM ?
           AND product_variant_id IS NOT DISTINCT FROM ?
           AND manufacturing_brand_id IS NOT DISTINCT FROM ?
           AND supplier_id IS NOT DISTINCT FROM ?
           AND is_active = 1
           AND id <> ?`,
        [
          companyBrandId || null,
          cleanModel,
          targetPartCategoryId,
          targetProductVariantId,
          targetMfgBrandId,
          targetSupplierId,
          productId
        ]
      );
    }
    if (duplicate) {
      return res.status(409).json({ error: 'A product matching this exact Brand, Model, Category, Variant, Manufacturer, and Supplier combination already exists.' });
    }

    await runTransaction(async (tx) => {
      await tx.runQuery(`
        UPDATE products SET
          short_name = COALESCE(?, short_name),
          name = COALESCE(?, name),
          brand = COALESCE(?, brand),
          category = ?,
          part_category = ?,
          quality_variant = ?,
          part_category_id = ?,
          product_variant_id = ?,
          full_model_list = COALESCE(?, full_model_list),
          model = COALESCE(?, model),
          sale_price = COALESCE(?, sale_price),
          retail_price = COALESCE(?, retail_price),
          wholesale_price = COALESCE(?, wholesale_price),
          purchase_price = COALESCE(?, purchase_price),
          official_price = COALESCE(?, official_price),
          description = COALESCE(?, description),
          colours = COALESCE(?, colours),
          company_brand_id = COALESCE(?, company_brand_id),
          manufacturing_brand_id = ?,
          supplier_id = ?,
          image_url = ?,
          image_urls = ?::jsonb,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        short_name || null,
        name || short_name || null,
        canonicalBrand,
        canonicalPartCategory,
        canonicalPartCategory,
        canonicalQualityVariant,
        targetPartCategoryId,
        targetProductVariantId,
        full_model_list || null,
        model || null,
        newSalePrice,
        newSalePrice,
        newWholesalePrice,
        newPurchasePrice,
        newOfficialPrice,
        description !== undefined ? description : null,
        canonicalColours !== undefined ? canonicalColours : null,
        companyBrandId,
        targetMfgBrandId,
        targetSupplierId,
        finalImageUrl,
        finalImageUrls,
        productId
      ]);

      // Stock status update: if set_stock_zero or stock_status === 'no_stock' or stock_quantity === 0
      if (stock_status === 'no_stock' || set_stock_zero === true || stock_quantity === 0) {
        await tx.runQuery(
          'UPDATE inventory_batches SET quantity_remaining = 0 WHERE product_id = ?',
          [productId]
        );
        await tx.runQuery(
          'UPDATE stock SET quantity = 0, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?',
          [productId]
        );
      } else if (stock_quantity !== undefined && Number(stock_quantity) > 0 && (stock_status === 'in_stock' || stock_status === 'low_stock')) {
        const targetQty = Number(stock_quantity);
        const warehouseShop = await tx.getRecord("SELECT id FROM shops WHERE location_type = 'warehouse' ORDER BY id ASC LIMIT 1");
        const targetShopId = shop_id || (warehouseShop ? warehouseShop.id : req.user.shop_id);
        if (targetShopId) {
          const currentBatchQty = await tx.getRecord(
            'SELECT COALESCE(SUM(quantity_remaining), 0) AS qty FROM inventory_batches WHERE shop_id = ? AND product_id = ?',
            [targetShopId, productId]
          );
          const currentStock = Number(currentBatchQty?.qty || 0);
          if (currentStock !== targetQty) {
            const diff = targetQty - currentStock;
            if (diff > 0) {
              await tx.runQuery(
                `INSERT INTO inventory_batches (
                  shop_id, product_id, purchase_price, wholesale_price, official_price, retail_price,
                  quantity_received, quantity_remaining, received_date, notes, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?, ?)`,
                [
                  targetShopId, productId, newPurchasePrice || oldProduct.purchase_price, newWholesalePrice || oldProduct.wholesale_price,
                  newSalePrice || oldProduct.sale_price, newSalePrice || oldProduct.sale_price,
                  diff, diff, 'Stock set via product edit', req.user.id
                ]
              );
            } else {
              let toRemove = Math.abs(diff);
              const batches = await tx.allRecords(
                'SELECT id, quantity_remaining FROM inventory_batches WHERE shop_id = ? AND product_id = ? AND quantity_remaining > 0 ORDER BY id ASC',
                [targetShopId, productId]
              );
              for (const b of batches) {
                if (toRemove <= 0) break;
                const rem = Math.min(toRemove, Number(b.quantity_remaining));
                await tx.runQuery('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [rem, b.id]);
                toRemove -= rem;
              }
            }
            await syncStockFromBatches(tx, targetShopId, productId);
          }
        }
      }

      // If price was updated, also update prices on inventory_batches for the shop
      if (newSalePrice) {
        const activeShopId = shop_id || req.user.shop_id;
        if (activeShopId) {
          await tx.runQuery(`
            UPDATE inventory_batches SET
              retail_price = ?,
              official_price = ?
            WHERE product_id = ? AND shop_id = ?
          `, [newSalePrice, newSalePrice, productId, activeShopId]);
        }
      }
    });

    const updatedProduct = await getRecord(`
      SELECT p.*, b.name AS brand_name, mb.name AS manufacturing_brand_name, s.name AS supplier_name,
        pc.name AS part_category_name, pv.name AS product_variant_name
      FROM products p
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN part_categories pc ON pc.id = p.part_category_id
      LEFT JOIN product_variants pv ON pv.id = p.product_variant_id
      WHERE p.id = ?
    `, [productId]);

    invalidateCache('reference-data', 'catalog', 'products');
    res.json({
      success: true,
      message: 'Product selling price & details updated successfully',
      id: productId,
      data: updatedProduct,
      ...updatedProduct,
    });
  } catch (error) {
    console.error('[ProductsAPI] Error updating product:', error);
    res.status(500).json({ error: error.message || 'Failed to update product' });
  }
});

app.post('/api/stock-import', authenticateToken, requireShopStaff, async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'Import file has no rows.' });
  if (rows.length > 500) return res.status(400).json({ error: 'Import up to 500 rows at a time.' });

  const stats = {
    totalRows: rows.length,
    createdProducts: 0,
    updatedProducts: 0,
    stockBatches: 0,
    importedQuantity: 0,
  };
  const createdProductIds = new Set();
  const updatedProductIds = new Set();

  try {
    await runTransaction(async (tx) => {
      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const payload = buildImportProductPayload(row, rowNumber);
        const shopId = await resolveImportShopId(tx, req, row, req.body.shop_id || req.body.shopId, rowNumber, payload.quantity > 0);
        const categoryRef = await ensureReferenceInTransaction(tx, 'categories', payload.category);
        const brandRef = await ensureReferenceInTransaction(tx, 'brands', payload.brand);
        const companyBrandId = brandRef ? brandRef.id : null;

        let mfgBrandId = null;
        if (payload.manufacturing_brand) {
          const mfgRef = await ensureReferenceInTransaction(tx, 'manufacturing_brands', payload.manufacturing_brand);
          mfgBrandId = mfgRef ? mfgRef.id : null;
        } else if (req.body.default_manufacturing_brand_id) {
          mfgBrandId = Number(req.body.default_manufacturing_brand_id);
        } else {
          const unknownMfgBrand = await tx.getRecord("SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'unknown' LIMIT 1");
          mfgBrandId = unknownMfgBrand ? unknownMfgBrand.id : null;
        }

        const canonicalColours = [];
        for (const colour of payload.colours) {
          const colourRef = await ensureReferenceInTransaction(tx, 'colours', colour);
          if (colourRef) canonicalColours.push(colourRef.name);
        }

        const canonicalBrand = brandRef?.name || payload.brand;
        const canonicalCategory = categoryRef?.name || payload.category;
        const productPayload = { ...payload, brand: canonicalBrand, category: canonicalCategory, colours: canonicalColours, company_brand_id: companyBrandId, manufacturing_brand_id: mfgBrandId };
        const existing = await findImportProduct(tx, productPayload);
        let productId = existing?.id;
        const existingSalePrice = parseImportNumber(existing?.sale_price ?? existing?.official_price ?? existing?.retail_price, null);
        const salePrice = productPayload.salePrice ?? existingSalePrice;
        if (!salePrice || salePrice <= 0) throw importRowError(rowNumber, 'Sale price is required for new products or products without a saved price.');

        if (existing) {
          await tx.runQuery(
            `UPDATE products SET
              name = ?, short_name = ?, full_model_list = ?, brand = ?, category = ?, model = ?,
              official_price = ?, purchase_price = ?, sale_price = ?, wholesale_price = ?, retail_price = ?,
              description = ?, colours = ?, is_active = 1, company_brand_id = ?, manufacturing_brand_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
              productPayload.fullModelList, productPayload.shortName, productPayload.fullModelList, canonicalBrand, canonicalCategory, productPayload.model,
              salePrice, productPayload.purchasePrice ?? existing.purchase_price, salePrice, productPayload.wholesalePrice ?? existing.wholesale_price,
              salePrice, productPayload.description || existing.description || '', canonicalColours.length ? canonicalColours : existing.colours || [], 
              companyBrandId, mfgBrandId, productId,
            ]
          );
          updatedProductIds.add(Number(productId));
        } else {
          const inserted = await tx.runQuery(
            `INSERT INTO products (
              name, short_name, full_model_list, brand, category, model, official_price,
              purchase_price, sale_price, wholesale_price, retail_price, description, colours,
              company_brand_id, manufacturing_brand_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              productPayload.fullModelList, productPayload.shortName, productPayload.fullModelList, canonicalBrand, canonicalCategory, productPayload.model,
              salePrice, productPayload.purchasePrice, salePrice, productPayload.wholesalePrice, salePrice, productPayload.description, canonicalColours,
              companyBrandId, mfgBrandId
            ]
          );
          productId = inserted.id;
          createdProductIds.add(Number(productId));
          const shops = await tx.allRecords('SELECT id FROM shops');
          for (const shop of shops) {
            await tx.runQuery('INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, 0) ON CONFLICT(shop_id, product_id) DO NOTHING', [shop.id, productId]);
          }
        }

        if (payload.quantity > 0) {
          if (!shopId) throw importRowError(rowNumber, 'Shop is required when quantity is greater than 0.');
          await tx.runQuery(
            `INSERT INTO inventory_batches (
              shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
              colour, quantity_received, quantity_remaining, received_date, notes, created_by, manufacturing_brand_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              shopId, productId, isShopStaffRole(req.user.role) ? req.user.id : null,
              productPayload.purchasePrice ?? existing?.purchase_price, productPayload.wholesalePrice ?? existing?.wholesale_price,
              salePrice, salePrice, productPayload.colour || null, payload.quantity, payload.quantity,
              productPayload.receivedDate, productPayload.description || 'CSV stock import', req.user.id, mfgBrandId,
            ]
          );
          await syncStockFromBatches(tx, shopId, productId);
          stats.stockBatches += 1;
          stats.importedQuantity += payload.quantity;
        }
      }
    });

    stats.createdProducts = createdProductIds.size;
    stats.updatedProducts = [...updatedProductIds].filter((id) => !createdProductIds.has(id)).length;
    invalidateCache('reference-data');
    await audit(req, 'Imported stock CSV', 'inventory_batch', null, `${stats.totalRows} rows, ${stats.importedQuantity} units`);
    res.status(201).json({ success: true, ...stats });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to import stock.' });
  }
});

// --- Cloudflare R2 Image Upload Endpoints ---
app.post(['/api/upload/image', '/upload/image'], authenticateToken, requireShopStaff, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum allowed size is 10 MB.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message || 'File upload error.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }
    const result = await uploadImageToR2(req.file.buffer, req.file.originalname, 'products');
    res.json(result);
  } catch (error) {
    console.error('[UploadAPI Error]', error);
    res.status(500).json({ error: error.message || 'Failed to optimize and upload image.' });
  }
});

app.post(['/api/upload/images', '/upload/images'], authenticateToken, requireShopStaff, (req, res, next) => {
  upload.array('images', 10)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'One or more files exceed the 10 MB limit.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message || 'File upload error.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided.' });
    }
    const uploadPromises = req.files.map((file) => uploadImageToR2(file.buffer, file.originalname, 'products'));
    const results = await Promise.all(uploadPromises);
    res.json({
      success: true,
      images: results.map((r) => ({ url: r.url, key: r.key, size: r.size, width: r.width, height: r.height, fallback: r.fallback })),
    });
  } catch (error) {
    console.error('[BatchUploadAPI Error]', error);
    res.status(500).json({ error: error.message || 'Failed to upload batch images.' });
  }
});

app.delete(['/api/upload/image', '/upload/image'], authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const { url, key } = req.body || {};
    const target = url || key || req.query.url || req.query.key;
    if (!target) {
      return res.status(400).json({ error: 'Image URL or key is required for deletion.' });
    }
    const result = await deleteImageFromR2(target);
    res.json(result);
  } catch (error) {
    console.error('[DeleteUploadAPI Error]', error);
    res.status(500).json({ error: error.message || 'Failed to delete image.' });
  }
});

app.get(['/api/images/*', '/images/*'], async (req, res) => {
  try {
    const rawPath = req.params[0] || req.path.replace(/^\/(?:api\/)?images\//, '');
    const key = rawPath.replace(/^\/+/, '');
    if (!key) return res.status(404).send('Image key missing');

    const imageBuffer = await getImageBufferFromStorage(key);
    if (!imageBuffer) return res.status(404).send('Image not found');

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(imageBuffer);
  } catch (err) {
    console.error('[Serve Image Error]', err.message);
    res.status(404).send('Image not found');
  }
});

app.get('/api/low-stock', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const productsData = await getProductsForRole(req.user.role, { ...req.query, limit: 5000 }, req.user);
    const rows = Array.isArray(productsData) ? productsData : (productsData?.data || []);
    const lowStockRows = rows.filter((p) => {
      const qty = Number(p.warehouse_stock ?? p.available_stock ?? p.quantity ?? p.stock_quantity ?? p.total_stock ?? p.stock ?? 0);
      return qty <= 4;
    });
    res.json({
      data: lowStockRows,
      total: lowStockRows.length,
      totalAlerts: lowStockRows.length,
      outOfStock: lowStockRows.filter(p => Number(p.warehouse_stock ?? p.available_stock ?? p.quantity ?? p.stock_quantity ?? p.total_stock ?? p.stock ?? 0) === 0).length,
      lowStock: lowStockRows.filter(p => {
        const q = Number(p.warehouse_stock ?? p.available_stock ?? p.quantity ?? p.stock_quantity ?? p.total_stock ?? p.stock ?? 0);
        return q >= 1 && q <= 4;
      }).length
    });
  } catch (error) {
    console.error('[API LOW STOCK ERROR]', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Failed to fetch low stock alerts' });
  }
});

app.get('/api/products', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const productsData = await getProductsForRole(req.user.role, req.query, req.user);
    res.json(productsData);
  } catch (error) {
    console.error('[API PRODUCTS ERROR]', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch products',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post('/api/products', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const {
      name, short_name, full_model_list, brand, category, model, official_price,
      purchase_price, sale_price, wholesale_price, retail_price, description, colours,
      manufacturing_brand_id, supplier_id, part_category, quality_variant,
      image_url, image_urls
    } = req.body;
    let compatibilityModels = String(full_model_list || name || '').trim();
    let displayName = String(short_name || '').trim();
    const cleanModel = String(model || (full_model_list && !full_model_list.includes(',') ? full_model_list : '') || '').trim();

    const parsePrice = (val, fallback = null) => {
      if (val === '' || val === null || val === undefined) return fallback;
      const num = Number(val);
      return isNaN(num) ? fallback : num;
    };
    
    const effectiveBrand = String(brand || '').trim() || 'Generic';
    const effectiveCategory = String(category || '').trim() || 'Other';
    
    let effectiveMfgBrandId = manufacturing_brand_id ? Number(manufacturing_brand_id) : null;
    if (!effectiveMfgBrandId) {
      const unknownMfg = await getRecord("SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'unknown' LIMIT 1");
      if (unknownMfg) {
        effectiveMfgBrandId = unknownMfg.id;
      }
    }

    const salePriceNum = sale_price !== undefined && sale_price !== '' && sale_price !== null ? Number(sale_price) : 0;
    const purchasePriceNum = parsePrice(purchase_price, null);
    const wholesalePriceNum = parsePrice(wholesale_price, null);
    const officialPriceNum = salePriceNum;
    const retailPriceNum = salePriceNum;

    const categoryRef = await ensureReference('categories', effectiveCategory);
    const brandRef = await ensureReference('brands', effectiveBrand);
    
    if (effectiveMfgBrandId) {
      const mfgBrand = await getRecord('SELECT id FROM manufacturing_brands WHERE id = ? AND is_active = TRUE', [effectiveMfgBrandId]);
      if (!mfgBrand) {
        return res.status(400).json({ error: 'Selected manufacturing brand is invalid or inactive.' });
      }
    }

    let effectiveSupplierId = supplier_id ? Number(supplier_id) : null;
    if (effectiveSupplierId) {
      const supplier = await getRecord('SELECT id FROM suppliers WHERE id = ? AND is_active = TRUE', [effectiveSupplierId]);
      if (!supplier) {
        return res.status(400).json({ error: 'Selected supplier is invalid or inactive.' });
      }
    }

    const canonicalColours = [];
    for (const colour of normalizeColours(colours)) {
      const colRef = await ensureReference('colours', colour);
      if (colRef) canonicalColours.push(colRef.name);
    }
    const canonicalBrand = brandRef ? brandRef.name : effectiveBrand.trim();
    const canonicalCategory = categoryRef ? categoryRef.name : effectiveCategory.trim();
    const companyBrandId = brandRef ? brandRef.id : null;

    const partCategoryRef = await ensureReference('part_categories', part_category || req.body.part_category_name || category);
    const productVariantRef = quality_variant ? await ensureReference('product_variants', quality_variant || req.body.product_variant_name) : null;
    const effectivePartCategoryId = partCategoryRef ? partCategoryRef.id : (req.body.part_category_id ? Number(req.body.part_category_id) : null);
    const effectiveProductVariantId = productVariantRef ? productVariantRef.id : (req.body.product_variant_id ? Number(req.body.product_variant_id) : null);
    const canonicalPartCategory = partCategoryRef ? partCategoryRef.name : String(part_category || category || '').trim();
    const canonicalQualityVariant = productVariantRef ? productVariantRef.name : (quality_variant ? String(quality_variant).trim() : null);

    const cleanPartCat = canonicalPartCategory || 'Display';
    const autoGeneratedName = [canonicalBrand, cleanModel, cleanPartCat].filter(Boolean).join(' ');
    if (!displayName) {
      displayName = autoGeneratedName || compatibilityModels || 'Unnamed Product';
    }
    if (!compatibilityModels) {
      compatibilityModels = cleanModel || displayName;
    }

    const targetImageUrl = image_url ? String(image_url).trim() : null;
    const targetImageUrls = image_urls 
      ? (typeof image_urls === 'string' ? image_urls : JSON.stringify(image_urls)) 
      : JSON.stringify(targetImageUrl ? [targetImageUrl] : []);

    // Determine product creator tenancy scope
    const isStaff = isShopStaffRole(req.user.role);
    let creatorShopId = isStaff ? Number(req.user.shop_id) : null;
    if (!isStaff && req.user.role === 'superadmin' && (req.body.shop_id || req.query.shopId)) {
      const targetShop = await getRecord('SELECT id, location_type FROM shops WHERE id = ?', [req.body.shop_id || req.query.shopId]);
      if (targetShop && targetShop.location_type !== 'warehouse') {
        creatorShopId = Number(targetShop.id);
      }
    }
    const productScope = creatorShopId ? 'BRANCH' : 'GLOBAL';

    // Composite Duplicate combination check (requires exact match across ALL core variant attributes within the same shop tenancy)
    if (cleanModel && effectivePartCategoryId) {
      const duplicateCombination = await getRecord(
        `SELECT id, purchase_price, wholesale_price, official_price, retail_price, sale_price, manufacturing_brand_id, supplier_id, shop_id FROM products 
         WHERE COALESCE(shop_id, 0) = COALESCE(?, 0)
           AND company_brand_id IS NOT DISTINCT FROM ? 
           AND LOWER(TRIM(model)) = LOWER(?) 
           AND part_category_id IS NOT DISTINCT FROM ?
           AND product_variant_id IS NOT DISTINCT FROM ?
           AND manufacturing_brand_id IS NOT DISTINCT FROM ?
           AND supplier_id IS NOT DISTINCT FROM ?
           AND is_active = 1`,
        [creatorShopId, companyBrandId, cleanModel, effectivePartCategoryId, effectiveProductVariantId, effectiveMfgBrandId, effectiveSupplierId]
      );
      if (duplicateCombination) {
        const openingStockNum = req.body.opening_stock !== undefined && req.body.opening_stock !== '' && req.body.opening_stock !== null ? Number(req.body.opening_stock) : 0;
        const targetShopId = creatorShopId || scopeShopId(req) || (await allRecords('SELECT id FROM shops'))[0]?.id;

        if (openingStockNum > 0 && targetShopId) {
          const effectiveAssignedUserId = isShopStaffRole(req.user.role) ? req.user.id : null;
          await runQuery(
            `INSERT INTO inventory_batches (
              shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
              quantity_received, quantity_remaining, received_date, notes, created_by, manufacturing_brand_id, supplier_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              targetShopId, duplicateCombination.id, effectiveAssignedUserId,
              duplicateCombination.purchase_price, duplicateCombination.wholesale_price, duplicateCombination.official_price, duplicateCombination.retail_price || duplicateCombination.sale_price,
              openingStockNum, openingStockNum, today(), 'Stock added from product form', req.user.id,
              duplicateCombination.manufacturing_brand_id, duplicateCombination.supplier_id
            ]
          );

          await runQuery(
            'INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT(shop_id, product_id) DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity',
            [targetShopId, duplicateCombination.id, openingStockNum]
          );
        }

        invalidateCache('reference-data', 'catalog');

        const existingProduct = await getRecord(`
          SELECT p.*, b.name AS brand_name, mb.name AS manufacturing_brand_name, s.name AS supplier_name
          FROM products p
          LEFT JOIN brands b ON b.id = p.company_brand_id
          LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
          LEFT JOIN suppliers s ON s.id = p.supplier_id
          WHERE p.id = ?
        `, [duplicateCombination.id]);

        await audit(req, 'Updated existing product branch stock', 'product', duplicateCombination.id, `${displayName} (${canonicalBrand})`);

        return res.status(200).json({
          success: true,
          message: openingStockNum > 0 ? `Product exists in catalog. Added ${openingStockNum} pcs to your branch stock.` : 'Product already exists in catalog.',
          data: existingProduct,
          id: duplicateCombination.id,
          already_exists: true,
        });
      }

      // Check if a soft-deleted / archived product exists with the exact same FULL composite combination -> RESTORE IT!
      const inactiveProduct = await getRecord(
        `SELECT id FROM products 
         WHERE COALESCE(shop_id, 0) = COALESCE(?, 0)
           AND company_brand_id IS NOT DISTINCT FROM ? 
           AND LOWER(TRIM(model)) = LOWER(?) 
           AND part_category_id IS NOT DISTINCT FROM ?
           AND product_variant_id IS NOT DISTINCT FROM ?
           AND manufacturing_brand_id IS NOT DISTINCT FROM ?
           AND supplier_id IS NOT DISTINCT FROM ?
           AND is_active = 0
         ORDER BY id DESC LIMIT 1`,
        [creatorShopId, companyBrandId, cleanModel, effectivePartCategoryId, effectiveProductVariantId, effectiveMfgBrandId, effectiveSupplierId]
      );

      if (inactiveProduct) {
        await runQuery(
          `UPDATE products SET
            name = ?, short_name = ?, full_model_list = ?, brand = ?, category = ?, part_category = ?, quality_variant = ?, model = ?,
            official_price = ?, purchase_price = ?, sale_price = ?, wholesale_price = ?, retail_price = ?, description = ?, colours = ?,
            company_brand_id = ?, manufacturing_brand_id = ?, supplier_id = ?, part_category_id = ?, product_variant_id = ?,
            image_url = COALESCE(?, image_url), image_urls = COALESCE(?::jsonb, image_urls),
            shop_id = ?, branch_id = ?, scope = ?,
            is_active = 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            compatibilityModels, displayName, compatibilityModels, canonicalBrand, canonicalPartCategory, canonicalPartCategory, canonicalQualityVariant, cleanModel, officialPriceNum,
            purchasePriceNum, salePriceNum, wholesalePriceNum, retailPriceNum, description || '', canonicalColours,
            companyBrandId, effectiveMfgBrandId, effectiveSupplierId, effectivePartCategoryId, effectiveProductVariantId,
            targetImageUrl, targetImageUrls,
            creatorShopId, creatorShopId, productScope,
            inactiveProduct.id
          ]
        );

        const openingStockNum = req.body.opening_stock !== undefined && req.body.opening_stock !== '' && req.body.opening_stock !== null ? Number(req.body.opening_stock) : 0;
        const shops = await allRecords('SELECT id FROM shops');
        const targetShopId = creatorShopId || scopeShopId(req) || shops[0]?.id;
        for (const shop of shops) {
          const qty = (shop.id === targetShopId || String(shop.id) === String(targetShopId)) ? openingStockNum : 0;
          await runQuery('INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT(shop_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity', [shop.id, inactiveProduct.id, qty]);
        }
        await audit(req, 'Restored soft-deleted product and updated details', 'product', inactiveProduct.id, `${displayName} at ${officialPriceNum}`);
        return res.status(200).json({ id: inactiveProduct.id, name: compatibilityModels, short_name: displayName, full_model_list: compatibilityModels, restored: true });
      }
    }

    const result = await runQuery(
      `INSERT INTO products (
        name, short_name, full_model_list, brand, category, part_category, quality_variant, model, official_price,
        purchase_price, sale_price, wholesale_price, retail_price, description, colours,
        company_brand_id, manufacturing_brand_id, supplier_id, part_category_id, product_variant_id,
        image_url, image_urls, is_active, shop_id, branch_id, scope
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, 1, ?, ?, ?)`,
      [
        compatibilityModels, displayName, compatibilityModels, canonicalBrand, canonicalPartCategory, canonicalPartCategory, canonicalQualityVariant, cleanModel, officialPriceNum,
        purchasePriceNum, salePriceNum, wholesalePriceNum, retailPriceNum, description || '', canonicalColours,
        companyBrandId, effectiveMfgBrandId, effectiveSupplierId, effectivePartCategoryId, effectiveProductVariantId,
        targetImageUrl, targetImageUrls,
        creatorShopId, creatorShopId, productScope
      ]
    );

    const productId = result.id;
    const openingStockNum = req.body.opening_stock !== undefined && req.body.opening_stock !== '' && req.body.opening_stock !== null ? Number(req.body.opening_stock) : 0;
    const shops = await allRecords('SELECT id FROM shops');
    const targetShopId = creatorShopId || scopeShopId(req) || shops[0]?.id;
    for (const shop of shops) {
      const qty = (shop.id === targetShopId || String(shop.id) === String(targetShopId)) ? openingStockNum : 0;
      await runQuery('INSERT INTO stock (shop_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT(shop_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity', [shop.id, productId, qty]);
    }
    if (targetShopId) {
      await runQuery(`
        INSERT INTO inventory_batches (
          shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
          quantity_received, quantity_remaining, received_date, notes, created_by, manufacturing_brand_id, supplier_id
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, CURRENT_DATE, 'Initial product entry', ?, ?, ?)
      `, [
        targetShopId, productId,
        purchasePriceNum, wholesalePriceNum, officialPriceNum, retailPriceNum,
        openingStockNum, openingStockNum, req.user?.id || 1,
        effectiveMfgBrandId, effectiveSupplierId
      ]);
    }

    invalidateCache('reference-data', 'catalog', 'products');
    
    const createdProduct = await getRecord(`
      SELECT p.*, b.name AS brand_name, mb.name AS manufacturing_brand_name, s.name AS supplier_name,
        pc.name AS part_category_name, pv.name AS product_variant_name
      FROM products p
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN part_categories pc ON pc.id = p.part_category_id
      LEFT JOIN product_variants pv ON pv.id = p.product_variant_id
      WHERE p.id = ?
    `, [productId]);

    await audit(req, 'Created product', 'product', productId, `${displayName} (${canonicalBrand})`);
    
    res.status(201).json({
      success: true,
      id: productId,
      message: 'Product created successfully',
      data: createdProduct,
      ...createdProduct,
    });
  } catch (error) {
    console.error('Error in POST /api/products:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create product',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.get(['/api/products/:id', '/products/:id'], authenticateToken, async (req, res) => {
  try {
    const isSupplier = req.user.role === 'supplier';
    const isShopkeeper = isShopStaffRole(req.user.role);
    const ownShopId = isShopkeeper ? Number(req.user.shop_id) : null;

    const columns = await productColumnsForRole(req.user.role, req.query, req.user);

    const product = await getRecord(`
      SELECT ${columns}
      FROM products p
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN part_categories pc ON pc.id = p.part_category_id
      LEFT JOIN product_variants pv ON pv.id = p.product_variant_id
      WHERE p.id = ?
    `, [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    if (isShopkeeper && product.shop_id && Number(product.shop_id) !== ownShopId) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch product.' });
  }
});

app.delete('/api/products/:id', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const product = await getRecord('SELECT id, name, short_name, image_url, image_urls FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const history = await getRecord(
      `SELECT
        (SELECT COUNT(*) FROM sales WHERE product_id = ?) AS sale_count,
        (SELECT COUNT(*) FROM stock_requests WHERE product_id = ?) AS request_count,
        (SELECT COUNT(*) FROM stock_transfers WHERE product_id = ?) AS transfer_count`,
      [req.params.id, req.params.id, req.params.id]
    );
    const historyCount = Number(history?.sale_count || 0) + Number(history?.request_count || 0) + Number(history?.transfer_count || 0);
    
    // Soft delete / archive product if it has sales, request, or transfer history
    if (historyCount > 0) {
      await runQuery('UPDATE products SET is_active = 0 WHERE id = ?', [req.params.id]);
      await audit(req, 'Soft deleted product (archived due to history)', 'product', req.params.id, product.short_name || product.name);
      return res.json({ success: true, archived: true });
    }

    // Clean up product image(s) from Cloudflare R2 bucket
    if (product.image_url) {
      deleteImageFromR2(product.image_url).catch((err) => console.warn('[R2 Delete Image Warning]', err.message));
    }
    if (product.image_urls) {
      let urls = [];
      try {
        urls = typeof product.image_urls === 'string' ? JSON.parse(product.image_urls) : product.image_urls;
      } catch {}
      if (Array.isArray(urls)) {
        urls.forEach((u) => {
          const urlStr = typeof u === 'string' ? u : u?.url;
          if (urlStr && urlStr !== product.image_url) {
            deleteImageFromR2(urlStr).catch((err) => console.warn('[R2 Delete Gallery Image Warning]', err.message));
          }
        });
      }
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

// --- Other Products ---
app.get('/api/other-products', authenticateToken, async (req, res) => {
  try {
    const rows = await allRecords(`
      SELECT op.*, c.name as category_name
      FROM other_products op
      LEFT JOIN categories c ON op.product_category_id = c.id
      ORDER BY op.id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('[OtherProducts] Get failed:', error);
    res.status(500).json({ error: 'Failed to fetch other products' });
  }
});

app.post('/api/other-products', authenticateToken, async (req, res) => {
  try {
    const { product_name, product_company, price, product_category_id } = req.body;
    if (!product_name) return res.status(400).json({ error: 'Product name is required' });
    const result = await runQuery(
      'INSERT INTO other_products (product_name, product_company, price, product_category_id) VALUES (?, ?, ?, ?) RETURNING *',
      [product_name, product_company, price || 0, product_category_id || null]
    );
    res.status(201).json({ success: true, id: result.id });
  } catch (error) {
    console.error('[OtherProducts] Create failed:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/other-products/:id', authenticateToken, async (req, res) => {
  try {
    const { product_name, product_company, price, product_category_id } = req.body;
    if (!product_name) return res.status(400).json({ error: 'Product name is required' });
    await runQuery(
      'UPDATE other_products SET product_name = ?, product_company = ?, price = ?, product_category_id = ? WHERE id = ?',
      [product_name, product_company, price || 0, product_category_id || null, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[OtherProducts] Update failed:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// --- Reference Data Endpoints for Part Categories and Product Variants ---
app.post(['/api/reference-data/part-categories', '/reference-data/part-categories'], authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const cleanName = String(name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'Name is required' });
    const existing = await getRecord('SELECT * FROM part_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))', [cleanName]);
    if (existing) {
      await runQuery('UPDATE part_categories SET is_active = TRUE WHERE id = ?', [existing.id]);
      return res.json(existing);
    }
    const result = await runQuery('INSERT INTO part_categories (name) VALUES (?)', [cleanName]);
    invalidateCache('reference-data');
    res.status(201).json({ id: result.id, name: cleanName });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to add part category' });
  }
});

app.post(['/api/reference-data/product-variants', '/reference-data/product-variants'], authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const cleanName = String(name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'Name is required' });
    const existing = await getRecord('SELECT * FROM product_variants WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))', [cleanName]);
    if (existing) {
      await runQuery('UPDATE product_variants SET is_active = TRUE WHERE id = ?', [existing.id]);
      return res.json(existing);
    }
    const result = await runQuery('INSERT INTO product_variants (name) VALUES (?)', [cleanName]);
    invalidateCache('reference-data');
    res.status(201).json({ id: result.id, name: cleanName });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to add product variant' });
  }
});

app.delete('/api/other-products/:id', authenticateToken, async (req, res) => {
  try {
    await runQuery('DELETE FROM other_products WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[OtherProducts] Delete failed:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.get('/api/stock', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const requestedShopId = scopeReadableShopId(req);
    const shopId = requestedShopId
      ? await assertShopReadAccess(req, requestedShopId)
      : (isShopStaffRole(req.user.role) ? Number(req.user.shop_id) : null);
    const includeWarehouse = isShopStaffRole(req.user.role) && String(req.query.includeWarehouse || '').toLowerCase() === 'true';
    const warehouse = includeWarehouse ? await getWarehouse() : null;
    const pagination = parsePagination(req.query);
    const visibility = await getPriceVisibility();
    const extraPrices = req.user.role === 'superadmin'
      ? ', p.purchase_price, p.wholesale_price'
      : `${visibility.show_purchase_price_shopkeeper ? ', p.purchase_price' : ''}${visibility.show_wholesale_price_shopkeeper ? ', p.wholesale_price' : ''}`;
    const officialPrice = req.user.role === 'superadmin' || visibility.show_official_price_shopkeeper ? ', p.official_price' : '';
    
    // Only show active products in the live stock list
    const where = ['p.is_active = 1'];
    const whereParams = [];
    if (hasQueryValue(req.query.colour)) {
      where.push('LOWER(TRIM(ib.colour)) = LOWER(TRIM(?))');
      whereParams.push(String(req.query.colour).trim());
    }
    if (hasQueryValue(req.query.batch) || hasQueryValue(req.query.batchId)) {
      where.push('ib.id = ?');
      whereParams.push(Number(req.query.batch || req.query.batchId));
    }
    if (req.user.role === 'superadmin' && hasQueryValue(req.query.shopkeeperId)) {
      where.push('ib.assigned_user_id = ?');
      whereParams.push(Number(req.query.shopkeeperId));
    }
    if (req.query.ownership === 'owner') where.push('ib.assigned_user_id IS NULL');
    if (req.query.ownership === 'shopkeeper') where.push('ib.assigned_user_id IS NOT NULL');
    if (req.query.ownership === 'mine') where.push(`ib.assigned_user_id = ${Number(req.user.id)}`);
    if (shopId && includeWarehouse && warehouse?.id && Number(warehouse.id) !== Number(shopId)) {
      where.push('(ib.shop_id = ? OR ib.shop_id = ?)');
      whereParams.push(shopId, Number(warehouse.id));
    } else if (shopId) {
      where.push('ib.shop_id = ?');
      whereParams.push(shopId);
    }
    if (isShopStaffRole(req.user.role)) {
      where.push(`(ib.assigned_user_id IS NULL OR ib.assigned_user_id = ${Number(req.user.id)})`);
    }
    appendSearchFilter(where, whereParams, req.query.search, [
      'p.name',
      "COALESCE(p.short_name, '')",
      "COALESCE(p.full_model_list, '')",
      "COALESCE(p.brand, '')",
      "COALESCE(p.category, '')",
      "COALESCE(p.model, '')",
      "COALESCE(p.description, '')",
      "COALESCE(sh.name, '')",
      "COALESCE(array_to_string(p.colours, ','), '')",
      "COALESCE(ib.colour, '')",
      "COALESCE(ib.notes, '')",
    ]);
    appendExactFilter(where, whereParams, req.query.brand, 'p.brand = ?');
    appendExactFilter(where, whereParams, req.query.category, 'LOWER(TRIM(p.category)) = LOWER(TRIM(?))');
    appendExactFilter(where, whereParams, req.query.model, 'LOWER(TRIM(p.model)) = LOWER(TRIM(?))');
    
    const stockQuantitySql = 'COALESCE(SUM(ib.quantity_remaining), 0)';
    const having = [];
    if (req.query.status === 'in_stock') having.push(`${stockQuantitySql} > COALESCE(sh.low_stock_threshold, 4)`);
    if (req.query.status === 'out_of_stock') having.push(`${stockQuantitySql} = 0`);
    if (req.query.status === 'low_stock') having.push(`${stockQuantitySql} > 0 AND ${stockQuantitySql} <= COALESCE(sh.low_stock_threshold, 4)`);
    
    const baseSql = `
      FROM inventory_batches ib
      JOIN products p ON p.id = ib.product_id
      JOIN shops sh ON sh.id = ib.shop_id
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
      WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
      GROUP BY ib.shop_id, sh.id, p.id, b.id, mb.id
      ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
    `;
    const params = whereParams;
    
    let orderBy = 'p.brand, COALESCE(p.short_name, p.name)';
    if (req.query.status === 'recently_added') {
      orderBy = 'MAX(ib.received_date) DESC, MAX(ib.id) DESC';
    }

    const rows = await runPaginatedList({
      dataSql: `
      SELECT MIN(ib.id) AS id, ib.shop_id, sh.name AS shop_name, sh.location_type, p.id AS product_id, p.name, p.short_name, p.full_model_list,
        p.brand, COALESCE(p.part_category, p.category, 'Display') AS category, COALESCE(p.part_category, p.category, 'Display') AS part_category,
        p.quality_variant, p.part_category_id, p.product_variant_id, p.model, p.sale_price, p.retail_price, p.description, p.colours,
        p.company_brand_id, b.name AS company_brand_name, p.manufacturing_brand_id, mb.name AS manufacturing_brand_name, p.model AS display_model
        ${officialPrice}${extraPrices},
        ${stockQuantitySql} AS quantity,
        COALESCE(SUM(CASE WHEN ib.assigned_user_id IS NULL THEN ib.quantity_remaining ELSE 0 END), 0) AS owner_quantity,
        COALESCE(SUM(CASE WHEN ib.assigned_user_id IS NOT NULL THEN ib.quantity_remaining ELSE 0 END), 0) AS shopkeeper_quantity,
        COALESCE(SUM(CASE WHEN ib.assigned_user_id = ${Number(req.user.id)} THEN ib.quantity_remaining ELSE 0 END), 0) AS my_quantity,
        COUNT(ib.id) FILTER (WHERE ib.quantity_remaining > 0) AS batch_count,
        COALESCE((
          SELECT jsonb_object_agg(COALESCE(NULLIF(TRIM(ib_col.colour), ''), 'Standard'), ib_col.sub_qty)
          FROM (
            SELECT ib2.colour, SUM(ib2.quantity_remaining) AS sub_qty
            FROM inventory_batches ib2
            WHERE ib2.shop_id = ib.shop_id AND ib2.product_id = p.id AND ib2.quantity_remaining > 0
            GROUP BY ib2.colour
          ) ib_col
        ), '{}'::jsonb) AS colour_stock
      ${baseSql}
      ORDER BY ${orderBy}
    `,
      countSql: `SELECT COUNT(*) AS total FROM (SELECT ib.shop_id, p.id ${baseSql}) counted`,
      params,
      pagination,
      totalKey: 'totalStockItems',
    });
    if (req.query.includeSummary === 'true') {
      const summaryRows = await allRecords(`
        SELECT category,
          COUNT(*) AS stock_rows,
          COUNT(DISTINCT product_id) AS products,
          COALESCE(SUM(quantity), 0) AS quantity,
          COALESCE(SUM(owner_quantity), 0) AS owner_quantity,
          COALESCE(SUM(shopkeeper_quantity), 0) AS shopkeeper_quantity,
          COALESCE(SUM(my_quantity), 0) AS my_quantity,
          COALESCE(SUM(CASE WHEN location_type = 'warehouse' THEN quantity ELSE 0 END), 0) AS warehouse_quantity
        FROM (
          SELECT ib.shop_id, p.id AS product_id, sh.location_type, COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category,
            ${stockQuantitySql} AS quantity,
            COALESCE(SUM(CASE WHEN ib.assigned_user_id IS NULL THEN ib.quantity_remaining ELSE 0 END), 0) AS owner_quantity,
            COALESCE(SUM(CASE WHEN ib.assigned_user_id IS NOT NULL THEN ib.quantity_remaining ELSE 0 END), 0) AS shopkeeper_quantity,
            COALESCE(SUM(CASE WHEN ib.assigned_user_id = ${Number(req.user.id)} THEN ib.quantity_remaining ELSE 0 END), 0) AS my_quantity
          ${baseSql}
        ) stock_summary
        GROUP BY category
        ORDER BY category
      `, params);
      const totals = summaryRows.reduce((acc, row) => ({
        products: acc.products + Number(row.products || 0),
        stock_rows: acc.stock_rows + Number(row.stock_rows || 0),
        quantity: acc.quantity + Number(row.quantity || 0),
        owner_quantity: acc.owner_quantity + Number(row.owner_quantity || 0),
        shopkeeper_quantity: acc.shopkeeper_quantity + Number(row.shopkeeper_quantity || 0),
        my_quantity: acc.my_quantity + Number(row.my_quantity || 0),
        warehouse_quantity: acc.warehouse_quantity + Number(row.warehouse_quantity || 0),
      }), {
        products: 0,
        stock_rows: 0,
        quantity: 0,
        owner_quantity: 0,
        shopkeeper_quantity: 0,
        my_quantity: 0,
        warehouse_quantity: 0,
      });
      const response = Array.isArray(rows) ? { data: rows } : rows;
      return res.json({
        ...response,
        summary: {
          categories: summaryRows,
          totals,
        },
      });
    }
    return res.json(rows);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to load stock.' });
  }
});

app.put('/api/stock', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const {
      product_id,
      quantity,
      adjustment_mode = 'set', // 'set' | 'add' | 'deduct'
      color_quantities,
      colour_breakdown,
      purchase_price,
      wholesale_price,
      official_price,
      retail_price,
      colour,
      received_date,
      notes,
      assigned_user_id,
      supplier_id,
    } = req.body;

    if (!product_id) return res.status(400).json({ error: 'Product is required.' });

    const effectiveAssignedUserId = isShopStaffRole(req.user.role) ? req.user.id : assigned_user_id || null;
    const product = await getRecord('SELECT purchase_price, wholesale_price, official_price, retail_price, manufacturing_brand_id FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // Prepare color map if multi-color split is provided
    let colorEntries = null;
    if (color_quantities && typeof color_quantities === 'object' && Object.keys(color_quantities).length > 0) {
      colorEntries = Object.entries(color_quantities).map(([c, q]) => ({
        colour: c === 'Generic' || c === 'Standard' || c === 'No Colour' || !c ? null : String(c).trim(),
        quantity: Number(q || 0),
      }));
    } else if (Array.isArray(colour_breakdown) && colour_breakdown.length > 0) {
      colorEntries = colour_breakdown.map((item) => ({
        colour: item.colour === 'Generic' || item.colour === 'Standard' || item.colour === 'No Colour' || !item.colour ? null : String(item.colour).trim(),
        quantity: Number(item.quantity || 0),
      }));
    }

    await runTransaction(async (tx) => {
      const accessSql = ownedBatchAccessSql(req.user);

      if (colorEntries && colorEntries.length > 0) {
        // Multi-color breakdown processing
        for (const item of colorEntries) {
          const colName = item.colour;
          const colQty = Math.max(0, Number(item.quantity || 0));

          let colourSql = '';
          let colourParams = [];
          if (colName) {
            colourSql = 'AND LOWER(TRIM(colour)) = LOWER(TRIM(?))';
            colourParams = [colName];
          } else {
            colourSql = 'AND (colour IS NULL OR TRIM(colour) = \'\')';
          }

          const current = await tx.getRecord(
            `SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity FROM inventory_batches ib WHERE shop_id = ? AND product_id = ? ${colourSql} ${accessSql}`,
            [shopId, product_id, ...colourParams]
          );
          const currentQty = Number(current?.quantity || 0);

          let targetQty = colQty;
          if (adjustment_mode === 'add') {
            targetQty = currentQty + colQty;
          } else if (adjustment_mode === 'deduct') {
            targetQty = Math.max(0, currentQty - colQty);
          }

          const delta = targetQty - currentQty;
          if (delta > 0) {
            await tx.runQuery(
              `INSERT INTO inventory_batches (
                shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
                colour, quantity_received, quantity_remaining, received_date, notes, created_by, manufacturing_brand_id, supplier_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                shopId, product_id, effectiveAssignedUserId, purchase_price ?? product?.purchase_price, wholesale_price ?? product?.wholesale_price,
                official_price ?? product?.official_price, retail_price ?? product?.retail_price, colName || null,
                delta, delta, received_date || today(), notes || (colName ? `Stock update for colour ${colName}` : 'Stock quantity update'), req.user.id, product?.manufacturing_brand_id,
                req.user.role === 'superadmin' && supplier_id ? Number(supplier_id) : null
              ]
            );
          } else if (delta < 0) {
            let remaining = Math.abs(delta);
            const batches = await tx.allRecords(
              `SELECT id, quantity_remaining FROM inventory_batches ib
               WHERE shop_id = ? AND product_id = ? AND quantity_remaining > 0 ${colourSql} ${accessSql}
               ORDER BY received_date ASC, id ASC`,
              [shopId, product_id, ...colourParams]
            );
            for (const batch of batches) {
              if (remaining <= 0) break;
              const used = Math.min(remaining, Number(batch.quantity_remaining));
              await tx.runQuery('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [used, batch.id]);
              remaining -= used;
            }
          }
        }
      } else {
        // Single color or lump-sum stock adjustment
        if (quantity === undefined || quantity === null || isNaN(Number(quantity))) {
          throw new Error('Valid stock quantity is required.');
        }

        const inputQty = Number(quantity);
        let colourSql = '';
        let colourParams = [];
        if (colour) {
          colourSql = 'AND LOWER(TRIM(colour)) = LOWER(TRIM(?))';
          colourParams = [colour];
        } else {
          colourSql = 'AND (colour IS NULL OR TRIM(colour) = \'\')';
        }

        const current = await tx.getRecord(
          `SELECT COALESCE(SUM(quantity_remaining), 0) AS quantity FROM inventory_batches ib WHERE shop_id = ? AND product_id = ? ${colourSql} ${accessSql}`,
          [shopId, product_id, ...colourParams]
        );
        const currentQty = Number(current?.quantity || 0);

        let targetStockQuantity = inputQty;
        if (adjustment_mode === 'add') {
          targetStockQuantity = currentQty + inputQty;
        } else if (adjustment_mode === 'deduct') {
          targetStockQuantity = Math.max(0, currentQty - inputQty);
        }

        const delta = targetStockQuantity - currentQty;
        if (delta > 0) {
          await tx.runQuery(
            `INSERT INTO inventory_batches (
              shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
              colour, quantity_received, quantity_remaining, received_date, notes, created_by, manufacturing_brand_id, supplier_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              shopId, product_id, effectiveAssignedUserId, (purchase_price !== undefined && purchase_price !== null && purchase_price !== '') ? Number(purchase_price) : product?.purchase_price, wholesale_price ?? product?.wholesale_price,
              official_price ?? product?.official_price, retail_price ?? product?.retail_price, colour || null,
              delta, delta, received_date || today(), notes || 'Stock quantity update', req.user.id, product?.manufacturing_brand_id,
              supplier_id ? Number(supplier_id) : (product?.supplier_id ? Number(product.supplier_id) : null)
            ]
          );
        } else if (delta < 0) {
          let remaining = Math.abs(delta);
          const batches = await tx.allRecords(
            `SELECT id, quantity_remaining FROM inventory_batches ib
             WHERE shop_id = ? AND product_id = ? AND quantity_remaining > 0 ${colourSql} ${accessSql}
             ORDER BY received_date ASC, id ASC`,
            [shopId, product_id, ...colourParams]
          );
          for (const batch of batches) {
            if (remaining <= 0) break;
            const used = Math.min(remaining, Number(batch.quantity_remaining));
            await tx.runQuery('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [used, batch.id]);
            remaining -= used;
          }
          if (remaining > 0) {
            const error = new Error('Not enough accessible batch stock to deduct this quantity.');
            error.status = 400;
            throw error;
          }
        }
      }

      if (retail_price || official_price) {
        const updatePrice = Number(retail_price || official_price);
        if (!isNaN(updatePrice) && updatePrice > 0) {
          await tx.runQuery(
            'UPDATE inventory_batches SET retail_price = ?, official_price = ? WHERE shop_id = ? AND product_id = ?',
            [updatePrice, updatePrice, shopId, product_id]
          );
          await tx.runQuery(
            'UPDATE products SET sale_price = ?, retail_price = ? WHERE id = ?',
            [updatePrice, updatePrice, product_id]
          );
        }
      }

      await syncStockFromBatches(tx, shopId, product_id);
    });

    invalidateCache('reference-data', 'catalog', 'products');
    await audit(req, 'Updated stock', 'stock', product_id, `Shop ${shopId} updated stock`);
    res.json({ success: true, message: 'Stock updated successfully' });
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
      "COALESCE(p.model, '')",
      "COALESCE(p.description, '')",
      "COALESCE(ib.colour, '')",
      "COALESCE(u.name, '')",
      "COALESCE(sh.name, '')",
      "COALESCE(array_to_string(p.colours, ','), '')",
      "COALESCE(ib.notes, '')",
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
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = ib.manufacturing_brand_id
      WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
    `;
    const rows = await runPaginatedList({
      dataSql: `
      SELECT ib.id, ib.shop_id, ib.product_id, ib.assigned_user_id, ${costs}${official}
        ib.retail_price, ib.colour, ib.quantity_received, ib.quantity_remaining, ib.received_date, ib.notes, ib.created_at,
        p.name, p.short_name, p.full_model_list, p.brand, p.category, sh.name AS shop_name, sh.location_type, u.name AS assigned_user_name,
        p.company_brand_id, b.name AS company_brand_name, ib.manufacturing_brand_id, mb.name AS manufacturing_brand_name, p.model AS display_model
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
      return res.status(400).json({ error: 'Product and stock quantity of at least 1 are required.' });
    }
    const effectiveAssignedUserId = isShopStaffRole(req.user.role) ? req.user.id : assigned_user_id || null;
    if (effectiveAssignedUserId) {
      const assigned = await getRecord("SELECT id FROM users WHERE id = ? AND shop_id = ? AND role IN ('shopkeeper', 'admin')", [effectiveAssignedUserId, shopId]);
      if (!assigned) return res.status(400).json({ error: 'Assigned shopkeeper must belong to the selected shop.' });
    }
    const result = await runTransaction(async (tx) => {
      const product = await tx.getRecord('SELECT purchase_price, wholesale_price, official_price, retail_price, manufacturing_brand_id FROM products WHERE id = ?', [product_id]);
      if (!product) {
        const error = new Error('Product not found.');
        error.status = 404;
        throw error;
      }
      const inserted = await tx.runQuery(
        `INSERT INTO inventory_batches (
          shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
          colour, quantity_received, quantity_remaining, received_date, notes, created_by, manufacturing_brand_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId, product_id, effectiveAssignedUserId, purchase_price ?? product.purchase_price, wholesale_price ?? product.wholesale_price,
          official_price ?? product.official_price, retail_price ?? product.retail_price, colour || null,
          batchQuantity, batchQuantity, received_date || today(), notes || '', req.user.id, product.manufacturing_brand_id,
        ]
      );
      await syncStockFromBatches(tx, shopId, product_id);
      return inserted;
    });
    await audit(req, 'Added inventory stock entry', 'inventory_batch', result.id, `${batchQuantity} units for product ${product_id}`);
    res.status(201).json({ id: result.id });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to add inventory stock.' });
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
    "COALESCE(c.gstin, '')",
    "COALESCE(sh.name, '')",
  ]);
  appendDateRangeFilter(where, params, req.query.dateFrom || req.query.from, req.query.dateTo || req.query.to, 'c.created_at');
  if (isShopStaffRole(req.user.role)) {
    where.push('(c.created_by IS NULL OR c.created_by = ?)');
    params.push(req.user.id);
  }
  const pendingSql = '(COALESCE(SUM(s.pending_amount), 0) + COALESCE(c.opening_balance, 0))';
  const having = [];
  if (req.query.status === 'pending') having.push(`${pendingSql} > 0`);
  if (req.query.status === 'paid') having.push(`${pendingSql} = 0`);
  const baseSql = `
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id AND s.pending_amount > 0
    LEFT JOIN shops sh ON sh.id = c.shop_id
    WHERE ${where.join(' AND ')}
    GROUP BY c.id, sh.id
    ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
  `;
  const rows = await runPaginatedList({
    dataSql: `
    SELECT c.*, sh.name AS shop_name, (COALESCE(SUM(s.pending_amount), 0) + COALESCE(c.opening_balance, 0)) AS pending
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
    const { name, mobile, address, notes, gstin, customer_type } = req.body;
    if (!name || !mobile) return res.status(400).json({ error: 'Customer name and mobile are required.' });
    
    const cleanName = String(name).trim();
    const cleanMobile = String(mobile).trim();
    const cleanAddress = String(address || '').trim();
    const cleanGstin = gstin ? String(gstin).trim().toUpperCase() : null;
    const cleanType = (customer_type && String(customer_type).trim().toLowerCase() === 'wholesaler') ? 'wholesaler' : 'retailer';

    // Only reuse existing customer if shop, name, mobile, AND address are all identical
    const existing = await getRecord(
      'SELECT * FROM customers WHERE shop_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND TRIM(mobile) = TRIM(?) AND LOWER(TRIM(COALESCE(address, \'\'))) = LOWER(TRIM(?))',
      [shopId, cleanName, cleanMobile, cleanAddress]
    );
    if (existing) {
      return res.status(200).json(existing);
    }

    const result = await runQuery(
      'INSERT INTO customers (shop_id, name, mobile, address, notes, gstin, customer_type, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [shopId, cleanName, cleanMobile, cleanAddress, notes || '', cleanGstin, cleanType, req.user.id]
    );
    await audit(req, 'Created customer', 'customer', result.id, cleanName);
    res.status(201).json({ id: result.id, shop_id: shopId, name: cleanName, mobile: cleanMobile, address: cleanAddress, notes, gstin: cleanGstin, customer_type: cleanType });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to create customer.' });
  }
});

app.put(['/api/customers/:id', '/customers/:id'], authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!customerId || isNaN(customerId)) {
      return res.status(400).json({ error: 'Valid customer ID is required.' });
    }
    const customer = await getRecord('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    if (isShopStaffRole(req.user.role) && customer.created_by && customer.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to edit this customer.' });
    }
    const { name, mobile, address, notes, default_payment_terms_days, opening_balance, gstin, customer_type } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    const cleanName = String(name).trim();
    const cleanMobile = mobile !== undefined ? String(mobile).trim() : customer.mobile;
    const cleanAddress = address !== undefined ? String(address).trim() : customer.address;
    const cleanNotes = notes !== undefined ? String(notes).trim() : customer.notes;
    const cleanGstin = gstin !== undefined ? (String(gstin).trim().toUpperCase() || null) : (customer.gstin || null);
    const cleanType = customer_type !== undefined
      ? (String(customer_type).trim().toLowerCase() === 'wholesaler' ? 'wholesaler' : 'retailer')
      : (customer.customer_type || 'retailer');
    const paymentTerms = default_payment_terms_days !== undefined && !isNaN(Number(default_payment_terms_days))
      ? Number(default_payment_terms_days)
      : (customer.default_payment_terms_days || 15);
    const cleanOpeningBalance = opening_balance !== undefined && !isNaN(Number(opening_balance))
      ? money(Number(opening_balance))
      : money(Number(customer.opening_balance || 0));

    await runQuery(
      `UPDATE customers
       SET name = ?, mobile = ?, address = ?, notes = ?, default_payment_terms_days = ?, opening_balance = ?, gstin = ?, customer_type = ?
       WHERE id = ?`,
      [cleanName, cleanMobile, cleanAddress, cleanNotes, paymentTerms, cleanOpeningBalance, cleanGstin, cleanType, customerId]
    );

    const updated = await getRecord(`
      SELECT c.*, sh.name AS shop_name, (COALESCE(SUM(s.pending_amount), 0) + COALESCE(c.opening_balance, 0)) AS pending
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id AND s.pending_amount > 0
      LEFT JOIN shops sh ON sh.id = c.shop_id
      WHERE c.id = ?
      GROUP BY c.id, sh.id
    `, [customerId]);

    await audit(req, 'Updated customer', 'customer', customerId, `${cleanName} (Opening Balance: ${cleanOpeningBalance})`);
    res.json(updated || { id: customerId, name: cleanName, mobile: cleanMobile, address: cleanAddress, notes: cleanNotes, opening_balance: cleanOpeningBalance });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to update customer.' });
  }
});

app.delete(['/api/customers/:id', '/customers/:id'], authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!customerId || isNaN(customerId)) {
      return res.status(400).json({ error: 'Valid customer ID is required.' });
    }
    const customer = await getRecord('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    if (isShopStaffRole(req.user.role) && customer.created_by && customer.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to delete this customer.' });
    }

    await runQuery('DELETE FROM customers WHERE id = ?', [customerId]);
    await audit(req, 'Deleted customer', 'customer', customerId, customer.name);
    res.json({ success: true, message: 'Customer deleted successfully.' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to delete customer.' });
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
    "sa.id::text",
    "'INV-' || LPAD(sa.id::text, 6, '0')",
    'p.name',
    "COALESCE(p.short_name, '')",
    "COALESCE(p.full_model_list, '')",
    "COALESCE(p.brand, '')",
    "COALESCE(p.category, '')",
    "COALESCE(p.model, '')",
    "COALESCE(p.description, '')",
    "COALESCE(sh.name, '')",
    "COALESCE(sa.price_type, '')",
    "COALESCE(sa.payment_mode, '')",
    "COALESCE(sa.notes, '')",
    "COALESCE(sa.colour, '')",
  ]);
  appendExactFilter(where, params, req.query.priceType, 'sa.price_type = ?');
  appendExactFilter(where, params, req.query.paymentMode, 'sa.payment_mode = ?');
  appendExactFilter(where, params, req.query.status, 'sa.status = ?');
  if (hasQueryValue(req.query.customerId)) {
    where.push('sa.customer_id = ?');
    params.push(Number(req.query.customerId));
  }
  if (hasQueryValue(req.query.productId)) {
    where.push('(sa.product_id = ? OR EXISTS (SELECT 1 FROM sale_items si_chk WHERE si_chk.sale_id = sa.id AND si_chk.product_id = ?))');
    params.push(Number(req.query.productId), Number(req.query.productId));
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
    JOIN shops sh ON sh.id = sa.shop_id
    LEFT JOIN products p ON p.id = sa.product_id
    LEFT JOIN customers c ON c.id = sa.customer_id
    LEFT JOIN brands b ON b.id = p.company_brand_id
    LEFT JOIN manufacturing_brands mb ON mb.id = COALESCE(sa.manufacturing_brand_id, p.manufacturing_brand_id)
    LEFT JOIN (
      SELECT si.sale_id, json_agg(json_build_object(
        'id', si.id,
        'product_id', si.product_id,
        'quantity', si.quantity,
        'unit_price', si.unit_price,
        'total_price', si.total_price,
        'price_type', si.price_type,
        'colour', si.colour,
        'custom_product_name', si.custom_product_name,
        'custom_brand_name', si.custom_brand_name,
        'name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
        'product_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
        'short_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
        'product_short_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
        'brand', p_item.brand,
        'brand_name', COALESCE(si.custom_brand_name, mb_item.name, p_item.brand),
        'mfg_brand', COALESCE(si.custom_brand_name, mb_item.name, p_item.brand),
        'manufacturing_brand_id', COALESCE(p_item.manufacturing_brand_id, mb_item.id),
        'manufacturing_brand_name', COALESCE(si.custom_brand_name, mb_item.name, p_item.brand),
        'category', COALESCE(p_item.part_category, p_item.category, 'Display'),
        'quality_variant', p_item.quality_variant,
        'model', p_item.model,
        'full_model_list', p_item.full_model_list,
        'description', p_item.description
      ) ORDER BY si.id ASC) AS items
      FROM sale_items si
      JOIN products p_item ON p_item.id = si.product_id
      LEFT JOIN manufacturing_brands mb_item ON mb_item.id = p_item.manufacturing_brand_id
      GROUP BY si.sale_id
    ) si_agg ON si_agg.sale_id = sa.id
    LEFT JOIN (
      SELECT sale_id, json_agg(json_build_object('id', id, 'expense_type', expense_type, 'expense_name', expense_name, 'amount', amount)) AS expenses
      FROM sale_expenses
      GROUP BY sale_id
    ) se ON se.sale_id = sa.id
    LEFT JOIN (
      SELECT sale_id, json_agg(json_build_object(
        'id', id,
        'amount', amount,
        'payment_date', payment_date,
        'payment_mode', payment_mode,
        'note', note,
        'created_at', created_at
      ) ORDER BY payment_date ASC, id ASC) AS payments
      FROM payments
      GROUP BY sale_id
    ) pm ON pm.sale_id = sa.id
    WHERE ${where.join(' AND ')}
  `;
  const rows = await runPaginatedList({
    dataSql: `
    SELECT sa.*, 
      COALESCE(si_agg.items, '[]'::json) AS items,
      COALESCE(se.expenses, '[]'::json) AS expenses,
      COALESCE(pm.payments, '[]'::json) AS payments,
      p.name AS product_name, p.short_name AS product_short_name, p.full_model_list, p.brand, p.category, p.description,
      c.name AS customer_name, c.mobile, c.address, COALESCE(c.advance_balance, 0) AS customer_advance_balance, COALESCE(c.advance_balance, 0) AS advance_balance,
      sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone,
      p.company_brand_id, b.name AS company_brand_name, sa.manufacturing_brand_id, mb.name AS manufacturing_brand_name, p.model AS display_model
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

app.get(['/api/sales/customers', '/sales/customers'], authenticateToken, requireShopStaff, async (req, res) => {
  try {
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
      "COALESCE(c.address, '')",
      "COALESCE(sh.name, '')",
    ]);
    if (hasQueryValue(req.query.customerId)) {
      where.push('sa.customer_id = ?');
      params.push(Number(req.query.customerId));
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
      LEFT JOIN customers c ON c.id = sa.customer_id
      JOIN shops sh ON sh.id = sa.shop_id
      WHERE ${where.join(' AND ')}
      GROUP BY c.id, c.name, c.mobile, c.address, sh.id, sh.name
    `;

    const rows = await runPaginatedList({
      dataSql: `
        SELECT 
          c.id AS customer_id,
          COALESCE(c.name, 'Walk-in Customer') AS customer_name,
          c.mobile AS customer_mobile,
          c.address AS customer_address,
          sh.id AS shop_id,
          sh.name AS shop_name,
          COUNT(DISTINCT sa.id) AS total_invoices,
          SUM(sa.total_amount) AS total_purchase_amount,
          SUM(sa.paid_amount) AS total_paid,
          -- [FIX B3] Only add opening_balance for the customer's registered shop to prevent double-counting
          -- across shops (MAX(opening_balance) was added once per shop group, inflating multi-shop totals).
          (COALESCE(SUM(sa.pending_amount), 0) + COALESCE(MAX(CASE WHEN c.shop_id = sa.shop_id THEN c.opening_balance ELSE 0 END), 0)) AS total_pending,
          MAX(COALESCE(sa.invoice_date::TEXT, sa.sale_date::TEXT)) AS last_purchase_date
        ${baseSql}
        ORDER BY MAX(COALESCE(sa.invoice_date::TEXT, sa.sale_date::TEXT)) DESC, c.id DESC
      `,
      countSql: `SELECT COUNT(*) AS total FROM (SELECT c.id ${baseSql}) counted`,
      params,
      pagination,
      totalKey: 'totalCustomerGroups',
    });
    res.json(rows);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to load customer sales groups.' });
  }
});

app.get(['/api/sales/customer/:customerId', '/sales/customer/:customerId'], authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const customerId = Number(req.params.customerId);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Valid customer ID is required.' });
    }
    const requestedShopId = scopeShopId(req);
    const shopId = requestedShopId ? assertShopAccess(req, requestedShopId) : null;
    const params = [customerId];
    let whereShop = '';
    if (shopId) {
      whereShop = ' AND sa.shop_id = ?';
      params.push(shopId);
    }

    const customer = await getRecord('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const invoices = await allRecords(`
      SELECT sa.*, 
        COALESCE(si_agg.items, '[]'::json) AS items,
        COALESCE(se.expenses, '[]'::json) AS expenses,
        COALESCE(cnr_agg.credit_redemptions, '[]'::json) AS credit_redemptions,
        COALESCE(pm.payments, '[]'::json) AS payments,
        p.name AS product_name, p.short_name AS product_short_name, p.full_model_list, p.brand, p.category, p.description,
        sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone,
        p.company_brand_id, b.name AS company_brand_name, sa.manufacturing_brand_id, mb.name AS manufacturing_brand_name
      FROM sales sa
      JOIN shops sh ON sh.id = sa.shop_id
      LEFT JOIN products p ON p.id = sa.product_id
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = COALESCE(sa.manufacturing_brand_id, p.manufacturing_brand_id)
      LEFT JOIN (
        SELECT si.sale_id, json_agg(json_build_object(
          'id', si.id,
          'product_id', si.product_id,
          'quantity', si.quantity,
          'unit_price', si.unit_price,
          'total_price', si.total_price,
          'price_type', si.price_type,
          'colour', si.colour,
          'custom_product_name', si.custom_product_name,
          'custom_brand_name', si.custom_brand_name,
          'name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
          'product_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
          'short_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
          'product_short_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
          'brand', p_item.brand,
          'manufacturing_brand_id', COALESCE(p_item.manufacturing_brand_id, mb_item.id),
          'manufacturing_brand_name', COALESCE(si.custom_brand_name, mb_item.name),
          'category', COALESCE(p_item.part_category, p_item.category, 'Display'),
          'quality_variant', p_item.quality_variant,
          'model', p_item.model,
          'full_model_list', p_item.full_model_list,
          'description', p_item.description
        ) ORDER BY si.id ASC) AS items
        FROM sale_items si
        JOIN products p_item ON p_item.id = si.product_id
        LEFT JOIN manufacturing_brands mb_item ON mb_item.id = p_item.manufacturing_brand_id
        GROUP BY si.sale_id
      ) si_agg ON si_agg.sale_id = sa.id
      LEFT JOIN (
        SELECT sale_id, json_agg(json_build_object('id', id, 'expense_type', expense_type, 'expense_name', expense_name, 'amount', amount)) AS expenses
        FROM sale_expenses
        GROUP BY sale_id
      ) se ON se.sale_id = sa.id
      LEFT JOIN (
        SELECT cnr.sale_id, json_agg(json_build_object('id', cnr.id, 'credit_note_id', cnr.credit_note_id, 'credit_note_number', cn.credit_note_number, 'amount', cnr.amount)) AS credit_redemptions
        FROM credit_note_redemptions cnr
        JOIN credit_notes cn ON cn.id = cnr.credit_note_id
        GROUP BY cnr.sale_id
      ) cnr_agg ON cnr_agg.sale_id = sa.id
      LEFT JOIN (
        SELECT sale_id, json_agg(json_build_object(
          'id', id,
          'amount', amount,
          'payment_date', payment_date,
          'payment_mode', payment_mode,
          'note', note,
          'created_at', created_at
        ) ORDER BY payment_date ASC, id ASC) AS payments
        FROM payments
        GROUP BY sale_id
      ) pm ON pm.sale_id = sa.id
      WHERE sa.customer_id = ? ${whereShop}
      ORDER BY sa.id DESC
    `, params);

    const openingBalance = money(customer.opening_balance || 0);
    const summary = {
      total_amount: invoices.reduce((sum, inv) => sum + money(inv.total_amount), 0),
      paid_amount: invoices.reduce((sum, inv) => sum + money(inv.paid_amount), 0),
      pending_amount: money(
        invoices.reduce((sum, inv) => sum + money(inv.pending_amount), 0) + openingBalance
      ),
      opening_balance: openingBalance,
    };
    res.json({ customer, invoices, sales: invoices, summary });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to load customer invoices.' });
  }
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
      SELECT sa.*, 
        COALESCE(si_agg.items, '[]'::json) AS items,
        COALESCE(se.expenses, '[]'::json) AS expenses,
        COALESCE(cnr_agg.credit_redemptions, '[]'::json) AS credit_redemptions,
        COALESCE(pm.payments, '[]'::json) AS payments,
        p.name AS product_name, p.short_name AS product_short_name, p.full_model_list, p.brand, p.category, p.description,
        c.name AS customer_name, c.mobile, c.address,
        sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone,
        p.company_brand_id, b.name AS company_brand_name, sa.manufacturing_brand_id, mb.name AS manufacturing_brand_name, p.model AS display_model
      FROM sales sa
      JOIN products p ON p.id = sa.product_id
      JOIN customers c ON c.id = sa.customer_id
      JOIN shops sh ON sh.id = sa.shop_id
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = COALESCE(sa.manufacturing_brand_id, p.manufacturing_brand_id)
      LEFT JOIN (
        SELECT si.sale_id, json_agg(json_build_object(
          'id', si.id,
          'product_id', si.product_id,
          'quantity', si.quantity,
          'unit_price', si.unit_price,
          'total_price', si.total_price,
          'price_type', si.price_type,
          'colour', si.colour,
          'custom_product_name', si.custom_product_name,
          'custom_brand_name', si.custom_brand_name,
          'name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
          'product_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
          'short_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
          'product_short_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
          'brand', p_item.brand,
          'brand_name', COALESCE(si.custom_brand_name, mb_item.name, p_item.brand),
          'mfg_brand', COALESCE(si.custom_brand_name, mb_item.name, p_item.brand),
          'manufacturing_brand_id', COALESCE(p_item.manufacturing_brand_id, mb_item.id),
          'manufacturing_brand_name', COALESCE(si.custom_brand_name, mb_item.name, p_item.brand),
          'category', COALESCE(p_item.part_category, p_item.category, 'Display'),
          'quality_variant', p_item.quality_variant,
          'model', p_item.model,
          'full_model_list', p_item.full_model_list,
          'description', p_item.description
        ) ORDER BY si.id ASC) AS items
        FROM sale_items si
        JOIN products p_item ON p_item.id = si.product_id
        LEFT JOIN manufacturing_brands mb_item ON mb_item.id = p_item.manufacturing_brand_id
        GROUP BY si.sale_id
      ) si_agg ON si_agg.sale_id = sa.id
      LEFT JOIN (
        SELECT sale_id, json_agg(json_build_object('id', id, 'expense_type', expense_type, 'expense_name', expense_name, 'amount', amount)) AS expenses
        FROM sale_expenses
        GROUP BY sale_id
      ) se ON se.sale_id = sa.id
      LEFT JOIN (
        SELECT cnr.sale_id, json_agg(json_build_object('id', cnr.id, 'credit_note_id', cnr.credit_note_id, 'credit_note_number', cn.credit_note_number, 'amount', cnr.amount)) AS credit_redemptions
        FROM credit_note_redemptions cnr
        JOIN credit_notes cn ON cn.id = cnr.credit_note_id
        GROUP BY cnr.sale_id
      ) cnr_agg ON cnr_agg.sale_id = sa.id
      LEFT JOIN (
        SELECT sale_id, json_agg(json_build_object(
          'id', id,
          'amount', amount,
          'payment_date', payment_date,
          'payment_mode', payment_mode,
          'note', note,
          'created_at', created_at
        ) ORDER BY payment_date ASC, id ASC) AS payments
        FROM payments
        GROUP BY sale_id
      ) pm ON pm.sale_id = sa.id
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

// Customer Balance and Available Credits endpoint
app.get(['/api/customers/:id/balance', '/customers/:id/balance'], authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Valid customer ID is required.' });
    }
    const customer = await getRecord('SELECT id, name, mobile, address, shop_id, COALESCE(opening_balance, 0) AS opening_balance, COALESCE(advance_balance, 0) AS advance_balance FROM customers WHERE id = ?', [customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    // Outstanding balance across customer's open sales (only pending_amount > 0)
    const balanceRow = await getRecord(
      'SELECT COALESCE(SUM(pending_amount), 0) AS outstanding_balance FROM sales WHERE customer_id = ? AND pending_amount > 0',
      [customerId]
    );
    const invoiceOutstanding = money(balanceRow?.outstanding_balance || 0);
    const openingBalance = money(customer.opening_balance || 0);
    const advanceBalance = money(customer.advance_balance || 0);

    // Active credit notes with remaining balance
    const creditNotes = await allRecords(
      `SELECT id, credit_note_number, amount, used_amount, balance_amount, reason, status, return_date, sale_id, created_at
       FROM credit_notes
       WHERE customer_id = ? AND status IN ('active', 'partially_used') AND balance_amount > 0
       ORDER BY return_date ASC, id ASC`,
      [customerId]
    );
    const availableCredits = creditNotes.reduce((sum, cn) => sum + money(cn.balance_amount), 0);
    // [FIX A7] Do NOT subtract availableCredits here.
    // Credit notes are already FIFO-applied against pending_amount at creation time (lines 3833-3880).
    // Deducting them again produces a displayed balance that is lower than actual outstanding.
    // available_credits is returned separately as a distinct informational field.
    const totalPending = money(invoiceOutstanding + openingBalance);

    res.json({
      customer,
      outstanding_balance: totalPending,
      invoices_outstanding: invoiceOutstanding,
      opening_balance: openingBalance,
      advance_balance: advanceBalance,
      available_credits: money(availableCredits),
      credit_notes: creditNotes,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load customer balance.' });
  }
});

// List Credit Notes with filters and pagination
app.get(['/api/credit-notes', '/credit-notes'], authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const requestedShopId = scopeShopId(req);
    const shopId = requestedShopId ? assertShopAccess(req, requestedShopId) : null;
    const pagination = parsePagination(req.query);
    const params = [];
    const where = ['1 = 1'];
    if (shopId) {
      where.push('cn.shop_id = ?');
      params.push(shopId);
    }
    if (req.query.customer_id) {
      where.push('cn.customer_id = ?');
      params.push(Number(req.query.customer_id));
    }
    if (req.query.status) {
      where.push('cn.status = ?');
      params.push(req.query.status);
    }
    appendSearchFilter(where, params, req.query.search, [
      'cn.credit_note_number',
      'c.name',
      "COALESCE(c.mobile, '')",
      "COALESCE(cn.reason, '')",
    ]);
    appendDateRangeFilter(where, params, req.query.dateFrom || req.query.from, req.query.dateTo || req.query.to, 'cn.return_date');

    const baseSql = `
      FROM credit_notes cn
      JOIN customers c ON c.id = cn.customer_id
      JOIN shops sh ON sh.id = cn.shop_id
      LEFT JOIN sales s ON s.id = cn.sale_id
      WHERE ${where.join(' AND ')}
    `;

    const rows = await runPaginatedList({
      dataSql: `
        SELECT cn.*, c.name AS customer_name, c.mobile AS customer_mobile, sh.name AS shop_name, s.invoice_date AS sale_invoice_date,
          (SELECT COUNT(*) FROM sales_returns sr WHERE sr.credit_note_id = cn.id) AS items_returned_count
        ${baseSql}
        ORDER BY cn.created_at DESC, cn.id DESC
      `,
      countSql: `SELECT COUNT(*) AS total ${baseSql}`,
      params,
      pagination,
      totalKey: 'totalCreditNotes',
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to list credit notes.' });
  }
});

// Create Sales Return & Issue Credit Note (with strict row-locking & inventory restock)
app.post(['/api/credit-notes', '/credit-notes'], authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { customer_id, sale_id, reason = '', return_date, items = [] } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Please select a customer.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one product item must be returned.' });
    }

    const returnDateStr = /^\d{4}-\d{2}-\d{2}$/.test(String(return_date || ''))
      ? String(return_date)
      : today();

    const result = await runTransaction(async (tx) => {
      // 1. Lock customer row to guarantee sequential integrity
      const customer = await tx.getRecord('SELECT id, name, mobile FROM customers WHERE id = ? FOR UPDATE', [customer_id]);
      if (!customer) {
        const error = new Error('Customer not found.');
        error.status = 404;
        throw error;
      }

      // 2. If sale_id provided, lock sale row and validate against sale
      let originalSale = null;
      if (sale_id) {
        originalSale = await tx.getRecord('SELECT * FROM sales WHERE id = ? FOR UPDATE', [sale_id]);
        if (!originalSale) {
          const error = new Error('Original sale not found.');
          error.status = 404;
          throw error;
        }
        if (Number(originalSale.customer_id) !== Number(customer_id)) {
          const error = new Error('Selected sale does not belong to this customer.');
          error.status = 400;
          throw error;
        }
      }

      // 3. Validate returned items
      const validatedItems = [];
      let totalAmount = 0;
      for (const item of items) {
        const productId = Number(item.product_id);
        const qty = Number(item.quantity);
        const unitPrice = money(item.unit_price);
        if (!productId || isNaN(qty) || qty <= 0 || unitPrice < 0) {
          const error = new Error('Invalid product, quantity, or unit price in return items.');
          error.status = 400;
          throw error;
        }
        const prod = await tx.getRecord('SELECT id, name, short_name FROM products WHERE id = ?', [productId]);
        if (!prod) {
          const error = new Error(`Product ID ${productId} not found.`);
          error.status = 404;
          throw error;
        }

        const lineTotal = money(qty * unitPrice);
        totalAmount += lineTotal;
        validatedItems.push({
          product_id: productId,
          product_name: prod.short_name || prod.name,
          quantity: qty,
          unit_price: unitPrice,
          total_amount: lineTotal,
          colour: item.colour ? String(item.colour).trim() : null,
          restock_inventory: item.restock_inventory !== false,
          return_reason: item.return_reason || reason || 'Customer return',
        });
      }

      totalAmount = money(totalAmount);
      if (totalAmount <= 0) {
        const error = new Error('Total return amount must be greater than zero.');
        error.status = 400;
        throw error;
      }

      // 4. [FIX A3] Generate Credit Note number via PostgreSQL sequence (race-safe).
      // The previous pattern (SELECT MAX id LIMIT 1 FOR UPDATE) was racy under concurrent requests
      // — two transactions could read the same max-id before either inserts.
      // nextval() is atomic and guaranteed unique across all concurrent sessions.
      const seqRow = await tx.getRecord("SELECT nextval('credit_note_seq') AS seq");
      const creditNoteNumber = `CN-${String(Number(seqRow.seq)).padStart(6, '0')}`;

      // 5. Deduct Return Amount from Pending Invoices
      let remainingReturnToApply = totalAmount;
      let usedAmount = 0;

      // 5a. If specific sale_id provided, prioritize deducting from that invoice first
      if (originalSale && money(originalSale.pending_amount) > 0) {
        const alloc = Math.min(remainingReturnToApply, money(originalSale.pending_amount));
        if (alloc > 0) {
          const newPaid = money(money(originalSale.paid_amount) + alloc);
          const newPending = Math.max(money(money(originalSale.total_amount) - newPaid), 0);
          await tx.runQuery(
            'UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?',
            [newPaid, newPending, newPending <= 0 ? 'paid' : 'open', originalSale.id]
          );
          await tx.runQuery(
            'INSERT INTO payments (sale_id, amount, payment_date, payment_mode, note) VALUES (?, ?, ?, ?, ?)',
            [originalSale.id, alloc, returnDateStr, 'credit_note', `Deducted via Sales Return (${creditNoteNumber})`]
          );
          remainingReturnToApply = money(remainingReturnToApply - alloc);
          usedAmount = money(usedAmount + alloc);
        }
      }

      // 5b. If return value remains, allocate FIFO to any other open pending invoices for this customer
      if (remainingReturnToApply > 0) {
        const otherPendingSales = await tx.allRecords(
          `SELECT * FROM sales WHERE customer_id = ? AND pending_amount > 0 ${sale_id ? 'AND id != ?' : ''} ORDER BY due_date ASC, id ASC FOR UPDATE`,
          sale_id ? [customer_id, sale_id] : [customer_id]
        );
        for (const os of otherPendingSales) {
          if (remainingReturnToApply <= 0) break;
          const alloc = Math.min(remainingReturnToApply, money(os.pending_amount));
          if (alloc > 0) {
            const newPaid = money(money(os.paid_amount) + alloc);
            const newPending = Math.max(money(money(os.total_amount) - newPaid), 0);
            await tx.runQuery(
              'UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?',
              [newPaid, newPending, newPending <= 0 ? 'paid' : 'open', os.id]
            );
            await tx.runQuery(
              'INSERT INTO payments (sale_id, amount, payment_date, payment_mode, note) VALUES (?, ?, ?, ?, ?)',
              [os.id, alloc, returnDateStr, 'credit_note', `Deducted via Sales Return (${creditNoteNumber})`]
            );
            remainingReturnToApply = money(remainingReturnToApply - alloc);
            usedAmount = money(usedAmount + alloc);
          }
        }
      }

      // 5c. If excess return amount remains after fully clearing all pending dues, credit to customer's advance_balance!
      if (remainingReturnToApply > 0) {
        await tx.runQuery(
          'UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + ? WHERE id = ?',
          [remainingReturnToApply, customer_id]
        );
      }

      const creditNoteStatus = remainingReturnToApply <= 0 ? 'redeemed' : (usedAmount > 0 ? 'partially_used' : 'active');

      // 6. Insert Credit Note
      const cnInsert = await tx.runQuery(
        `INSERT INTO credit_notes (
          credit_note_number, shop_id, customer_id, sale_id, amount, used_amount, balance_amount,
          reason, status, return_date, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [creditNoteNumber, shopId, customer_id, sale_id || null, totalAmount, usedAmount, remainingReturnToApply, reason || 'Sales return', creditNoteStatus, returnDateStr, req.user.id]
      );
      const creditNoteId = cnInsert.id;

      // 6. Insert Sales Return items and restock inventory
      for (const vItem of validatedItems) {
        await tx.runQuery(
          `INSERT INTO sales_returns (
            credit_note_id, sale_id, shop_id, customer_id, product_id, quantity, unit_price,
            total_amount, colour, restock_inventory, return_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            creditNoteId,
            sale_id || null,
            shopId,
            customer_id,
            vItem.product_id,
            vItem.quantity,
            vItem.unit_price,
            vItem.total_amount,
            vItem.colour,
            vItem.restock_inventory,
            vItem.return_reason
          ]
        );

        if (vItem.restock_inventory) {
          const existingBatch = await tx.getRecord(
            `SELECT id FROM inventory_batches
             WHERE shop_id = ? AND product_id = ? ${vItem.colour ? 'AND LOWER(TRIM(colour)) = LOWER(TRIM(?))' : ''}
             ORDER BY id DESC LIMIT 1`,
            vItem.colour ? [shopId, vItem.product_id, vItem.colour] : [shopId, vItem.product_id]
          );
          if (existingBatch) {
            await tx.runQuery(
              'UPDATE inventory_batches SET quantity_remaining = quantity_remaining + ? WHERE id = ?',
              [vItem.quantity, existingBatch.id]
            );
          } else {
            await tx.runQuery(
              `INSERT INTO inventory_batches (shop_id, product_id, batch_number, quantity_received, quantity_remaining, purchase_price, colour, received_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                shopId,
                vItem.product_id,
                `RET-${creditNoteNumber}`,
                vItem.quantity,
                vItem.quantity,
                vItem.unit_price,
                vItem.colour || null,
                returnDateStr
              ]
            );
          }
          await syncStockFromBatches(tx, shopId, vItem.product_id);
        }
      }

      return {
        id: creditNoteId,
        credit_note_number: creditNoteNumber,
        amount: totalAmount,
        balance_amount: totalAmount,
        status: 'active',
        items: validatedItems,
      };
    });

    await audit(req, 'Created credit note', 'credit_note', result.id, `${result.credit_note_number}, amount ${result.amount}, customer ${customer_id}`);
    res.status(201).json({ success: true, credit_note: result });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to create credit note.' });
  }
});

app.post('/api/sales', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { customer_id, paid_amount, notes, payment_mode = 'credit', applied_credit_amount = 0 } = req.body;
    const items = Array.isArray(req.body.items) && req.body.items.length
      ? req.body.items
      : [{ product_id: req.body.product_id, quantity: req.body.quantity ?? 1, batch_id: req.body.batch_id, selling_price: req.body.selling_price || req.body.unit_price, price_type: req.body.price_type || 'retail' }];
    if (!customer_id) {
      return res.status(400).json({ error: 'Please select a customer.' });
    }
    if (items.some((item) => !item.product_id)) {
      return res.status(400).json({ error: 'Please select a product for all sale items.' });
    }

    // 1. Resolve and validate Invoice Date, Terms Days, and independently calculate Due Date
    const invoiceDateStr = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.invoice_date || ''))
      ? String(req.body.invoice_date)
      : today();
    const paymentTermsDays = Number.isInteger(Number(req.body.payment_terms_days)) && Number(req.body.payment_terms_days) >= 0
      ? Number(req.body.payment_terms_days)
      : 15;

    const invoiceDateObj = new Date(invoiceDateStr + 'T00:00:00');
    const validInvoiceDate = isNaN(invoiceDateObj.getTime()) ? new Date() : invoiceDateObj;
    const dueDateObj = new Date(validInvoiceDate);
    dueDateObj.setDate(dueDateObj.getDate() + paymentTermsDays);
    const dueY = dueDateObj.getFullYear();
    const dueM = String(dueDateObj.getMonth() + 1).padStart(2, '0');
    const dueD = String(dueDateObj.getDate()).padStart(2, '0');
    const calculatedDueDate = `${dueY}-${dueM}-${dueD}`;

    // 2. Validate Extra Expenses
    const rawExpenses = Array.isArray(req.body.expenses) ? req.body.expenses : [];
    const validExpenses = [];
    for (const exp of rawExpenses) {
      if (!exp) continue;
      const amt = Number(exp.amount || 0);
      if (isNaN(amt) || amt < 0) {
        return res.status(400).json({ error: 'Expense amount cannot be negative.' });
      }
      const expName = String(exp.expense_name || exp.description || '').trim();
      if (amt > 0 && expName) {
        validExpenses.push({
          expense_type: String(exp.expense_type || 'custom').trim().slice(0, 50),
          expense_name: expName.slice(0, 255),
          amount: money(amt),
        });
      }
    }
    const extraExpensesTotal = validExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    const result = await runTransaction(async (tx) => {
      // Lock customer record for race-condition safe balance tracking
      const customer = await tx.getRecord('SELECT id, name, mobile, COALESCE(opening_balance, 0) AS opening_balance, COALESCE(advance_balance, 0) AS advance_balance FROM customers WHERE id = ? FOR UPDATE', [customer_id]);
      if (!customer) {
        const error = new Error('Selected customer not found.');
        error.status = 404;
        throw error;
      }

      // Fetch live previous outstanding balance for this customer (open sales pending + customer opening balance)
      const prevBalRow = await tx.getRecord(
        'SELECT COALESCE(SUM(pending_amount), 0) AS prev_balance FROM sales WHERE customer_id = ? AND pending_amount > 0',
        [customer_id]
      );
      const existingSalesPending = money(prevBalRow?.prev_balance || 0);
      const customerOpeningBal = money(customer.opening_balance || 0);
      const livePrevBalance = money(existingSalesPending + customerOpeningBal);

      const previousBalance = (req.body.previous_balance !== undefined && req.body.previous_balance !== null && req.body.previous_balance !== '' && !isNaN(Number(req.body.previous_balance)))
        ? money(req.body.previous_balance)
        : livePrevBalance;

      // [FIX A5] opening_balance is a fixed historical seed value — it must NEVER be mutated during
      // a sale transaction. Mutating it made it impossible to produce a stable Party Ledger opening
      // figure and caused running-balance drift on every invoice creation.
      // Running balance is now computed from journal_entry_lines using a window function.
      // opening_balance remains read-only after initial customer onboarding.

      const preparedItems = [];
      const reservedByBatch = new Map();
      for (const item of items) {
        const saleQuantity = Number(item.quantity);
        if (!Number.isInteger(saleQuantity) || saleQuantity <= 0) {
          const error = new Error('Every item quantity must be at least 1.');
          error.status = 400;
          throw error;
        }
        const product = await tx.getRecord('SELECT id, short_name, name, sale_price, wholesale_price, manufacturing_brand_id, colours FROM products WHERE id = ?', [item.product_id]);
        let unitPrice = 0;
        if (item.selling_price !== undefined && item.selling_price !== null && item.selling_price !== '' && !isNaN(Number(item.selling_price))) {
          unitPrice = money(item.selling_price);
        } else if (item.unit_price !== undefined && item.unit_price !== null && item.unit_price !== '' && !isNaN(Number(item.unit_price))) {
          unitPrice = money(item.unit_price);
        } else {
          unitPrice = money(item.price_type === 'wholesale' ? product?.wholesale_price : product?.sale_price);
        }
        if (!product || unitPrice <= 0) {
          const error = new Error(`Selling price must be greater than 0 for "${product?.short_name || product?.name || 'this product'}".`);
          error.status = 400;
          throw error;
        }

        // Validate selected colour(s) strictly against Product Master available colours
        const rawColours = product?.available_colours || product?.colours;
        let productColours = [];
        if (Array.isArray(rawColours)) {
          productColours = rawColours.map(c => String(c).trim()).filter(Boolean);
        } else if (typeof rawColours === 'string' && rawColours.trim()) {
          try {
            const parsed = JSON.parse(rawColours);
            if (Array.isArray(parsed)) productColours = parsed.map(c => String(c).trim()).filter(Boolean);
            else productColours = rawColours.split(',').map(c => c.trim()).filter(Boolean);
          } catch {
            productColours = rawColours.split(',').map(c => c.trim()).filter(Boolean);
          }
        }

        const colorBreakdown = Array.isArray(item.color_breakdown) 
          ? item.color_breakdown.filter(c => c && c.color && Number(c.qty) > 0) 
          : [];

        if (productColours.length > 0 && colorBreakdown.length > 0) {
          for (const cb of colorBreakdown) {
            if (!productColours.some(pc => pc.toLowerCase() === String(cb.color).trim().toLowerCase())) {
              const error = new Error(`Invalid colour "${cb.color}" selected for "${product.short_name || product.name}". Available colours: ${productColours.join(', ')}`);
              error.status = 400;
              throw error;
            }
          }
        }

        const batches = await tx.allRecords(
          `SELECT id, purchase_price, quantity_remaining, colour FROM inventory_batches ib
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
          const prodName = product.short_name || product.name || 'Selected product';
          const error = new Error(`Not enough stock for "${prodName}" in this workspace. (Available: ${available}, Requested: ${saleQuantity})`);
          error.status = 400;
          throw error;
        }

        let toReserve = saleQuantity;
        const reservedBatches = [];

        // If color breakdown is provided, prioritize batches matching the specific colors
        if (colorBreakdown.length > 0) {
          for (const cb of colorBreakdown) {
            let colorNeed = Number(cb.qty);
            for (const batch of availableBatches) {
              if (colorNeed <= 0) break;
              if (batch.quantity_remaining > 0 && String(batch.colour || '').trim().toLowerCase() === String(cb.color).trim().toLowerCase()) {
                const take = Math.min(colorNeed, batch.quantity_remaining);
                reservedByBatch.set(batch.id, Number(reservedByBatch.get(batch.id) || 0) + take);
                reservedBatches.push({ ...batch, quantity_remaining: take });
                batch.quantity_remaining -= take;
                colorNeed -= take;
                toReserve -= take;
              }
            }
          }
        }

        // Fill remaining quantity from FIFO order
        for (const batch of availableBatches) {
          if (toReserve <= 0) break;
          if (batch.quantity_remaining <= 0) continue;
          const reserved = Math.min(toReserve, batch.quantity_remaining);
          reservedByBatch.set(batch.id, Number(reservedByBatch.get(batch.id) || 0) + reserved);
          reservedBatches.push({ ...batch, quantity_remaining: reserved });
          batch.quantity_remaining -= reserved;
          toReserve -= reserved;
        }
        preparedItems.push({ ...item, saleQuantity, saleTotal: unitPrice * saleQuantity, batches: reservedBatches, unitPrice, product, colorBreakdown, productColours });
      }

      const productsTotal = preparedItems.reduce((sum, item) => sum + item.saleTotal, 0);
      const originalTotal = money(productsTotal + extraExpensesTotal);
      const requestedFinalTotal = req.body.final_total_amount !== undefined && req.body.final_total_amount !== null && req.body.final_total_amount !== '' && !isNaN(Number(req.body.final_total_amount))
        ? money(req.body.final_total_amount)
        : (req.body.total_amount !== undefined && !isNaN(Number(req.body.total_amount)) ? money(req.body.total_amount) : originalTotal);

      const currentInvoiceTotal = requestedFinalTotal >= 0 ? requestedFinalTotal : originalTotal;
      const discountAmount = Math.max(money(originalTotal - currentInvoiceTotal), 0);
      const discountPercentage = originalTotal > 0 ? Number(((discountAmount / originalTotal) * 100).toFixed(2)) : 0;

      // 3. Handle Credit Note Redemption with Row-Level Locks
      let requestedCredit = money(applied_credit_amount);
      let actualAppliedCredit = 0;
      const redemptions = [];

      if (requestedCredit > 0) {
        const activeCreditNotes = await tx.allRecords(
          `SELECT * FROM credit_notes
           WHERE customer_id = ? AND status IN ('active', 'partially_used') AND balance_amount > 0
           ORDER BY return_date ASC, id ASC FOR UPDATE`,
          [customer_id]
        );
        const totalAvailCredit = activeCreditNotes.reduce((sum, cn) => sum + money(cn.balance_amount), 0);
        if (requestedCredit > totalAvailCredit) {
          const error = new Error(`Requested credit note amount (₹${requestedCredit}) exceeds available credit (₹${totalAvailCredit}).`);
          error.status = 400;
          throw error;
        }

        const maxAllowableCredit = currentInvoiceTotal + previousBalance;
        if (requestedCredit > maxAllowableCredit) {
          requestedCredit = maxAllowableCredit;
        }

        let remainingToRedeem = requestedCredit;
        for (const cn of activeCreditNotes) {
          if (remainingToRedeem <= 0) break;
          const canRedeem = Math.min(remainingToRedeem, money(cn.balance_amount));
          const newUsed = money(money(cn.used_amount) + canRedeem);
          const newBalance = money(money(cn.balance_amount) - canRedeem);
          const newStatus = newBalance === 0 ? 'redeemed' : 'partially_used';

          await tx.runQuery(
            'UPDATE credit_notes SET used_amount = ?, balance_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newUsed, newBalance, newStatus, cn.id]
          );
          redemptions.push({ credit_note_id: cn.id, amount: canRedeem });
          actualAppliedCredit = money(actualAppliedCredit + canRedeem);
          remainingToRedeem = money(remainingToRedeem - canRedeem);
        }
      }

      // 3.5 Automated Advance / Store Credit Auto-Adjustment
      const availableAdvance = money(customer.advance_balance || 0);
      const shouldApplyAdvance = req.body.apply_advance !== false && req.body.apply_store_credit !== false;
      let advanceDeduction = 0;

      const saleNetInvoiceTotal = Math.max(0, money(currentInvoiceTotal - actualAppliedCredit));

      if (shouldApplyAdvance && availableAdvance > 0 && previousBalance >= 0) {
        advanceDeduction = Math.min(saleNetInvoiceTotal, availableAdvance);
      }

      if (advanceDeduction > 0) {
        await tx.runQuery(
          'UPDATE customers SET advance_balance = GREATEST(0, advance_balance - ?) WHERE id = ?',
          [advanceDeduction, customer_id]
        );
      }

      // If previousBalance is negative (e.g. -100000), it directly represents customer advance credit
      const advanceFromNegativePrevBal = previousBalance < 0 ? Math.min(saleNetInvoiceTotal, Math.abs(previousBalance)) : 0;
      const totalAdvanceApplied = money(advanceDeduction + advanceFromNegativePrevBal);

      // Net amount to be paid directly after advance deduction
      const netAfterAdvance = Math.max(0, money(saleNetInvoiceTotal - totalAdvanceApplied));
      const netBalance = money(netAfterAdvance + (previousBalance < 0 ? (previousBalance + advanceFromNegativePrevBal) : previousBalance));
      const netPayableAmount = Math.max(netBalance, 0);
      const numPaid = money(paid_amount);

      if (numPaid < 0) {
        const error = new Error('Paid amount cannot be negative.');
        error.status = 400;
        throw error;
      }
      if (netPayableAmount > 0 && numPaid > netPayableAmount) {
        const error = new Error(`Paid amount (₹${numPaid}) cannot exceed the Net Payable amount (₹${netPayableAmount}).`);
        error.status = 400;
        throw error;
      }
      const closingBalance = money(netBalance - numPaid);

      // If previous balance was negative or closing balance is negative, update customer advance pool
      if (closingBalance < 0) {
        await tx.runQuery(
          'UPDATE customers SET advance_balance = ? WHERE id = ?',
          [Math.abs(closingBalance), customer_id]
        );
      } else if (previousBalance < 0 && closingBalance >= 0) {
        await tx.runQuery(
          'UPDATE customers SET advance_balance = 0 WHERE id = ?',
          [customer_id]
        );
      }

      // Portion of direct paid amount covering this sale
      const directPaidForThisSale = Math.min(numPaid, netAfterAdvance);
      const thisSalePaid = money(totalAdvanceApplied + directPaidForThisSale);
      const thisSalePending = Math.max(0, money(saleNetInvoiceTotal - thisSalePaid));
      const excessPaid = Math.max(0, money(numPaid - netAfterAdvance));

      // If fully paid or covered by advance, payment terms is 0 days and due date is invoice date
      const isPaidInFull = thisSalePending <= 0;
      const finalPaymentTerms = isPaidInFull ? 0 : paymentTermsDays;
      const finalDueDate = isPaidInFull ? invoiceDateStr : calculatedDueDate;

      // Prepare colours summary
      const primaryProduct = preparedItems[0];
      const totalQty = preparedItems.reduce((s, it) => s + Number(it.saleQuantity || 0), 0);
      const colourSummaries = preparedItems.map((it) => {
        if (it.colorBreakdown && it.colorBreakdown.length === 1) return it.colorBreakdown[0].color;
        if (it.colorBreakdown && it.colorBreakdown.length > 1) return it.colorBreakdown.map((c) => `${c.color}: ${c.qty}`).join(', ');
        if (it.selected_colour || it.colour) return String(it.selected_colour || it.colour).trim();
        if (it.productColours && it.productColours.length === 1) return it.productColours[0];
        return null;
      }).filter(Boolean);
      const overallColourStr = colourSummaries.length ? colourSummaries.join(', ') : null;

      const publicToken = crypto.randomUUID();

      // 5. Insert SINGLE sales record representing the entire invoice with snapshots
      const insertResult = await tx.runQuery(
        `INSERT INTO sales (
          shop_id, product_id, customer_id, quantity, total_amount, paid_amount, pending_amount, 
          due_date, sale_date, invoice_date, payment_terms_days, products_total, extra_expenses_total,
          notes, status, created_by, payment_mode, price_type, manufacturing_brand_id, original_amount,
          discount_amount, discount_percentage, colour,
          previous_balance, current_invoice_total, applied_credit_amount, net_payable_amount, closing_balance, advance_applied,
          public_token
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId, 
          primaryProduct.product_id, 
          customer_id, 
          totalQty, 
          saleNetInvoiceTotal, 
          thisSalePaid, 
          thisSalePending, 
          finalDueDate, 
          today(),
          invoiceDateStr,
          finalPaymentTerms,
          productsTotal,
          extraExpensesTotal,
          notes || '', 
          thisSalePending > 0 ? 'open' : 'paid', 
          req.user.id, 
          payment_mode, 
          primaryProduct.price_type || 'retail', 
          primaryProduct.product?.manufacturing_brand_id || null,
          originalTotal,
          discountAmount,
          discountPercentage,
          overallColourStr,
          previousBalance,
          currentInvoiceTotal,
          actualAppliedCredit,
          netPayableAmount,
          closingBalance,
          advanceDeduction,
          publicToken
        ]
      );

      const saleId = insertResult.id;
      const invNumber = `INV-${String(saleId).padStart(6, '0')}`;
      await tx.runQuery('UPDATE sales SET invoice_number = ? WHERE id = ?', [invNumber, saleId]);

      // 6. Record Credit Note Redemptions
      for (const r of redemptions) {
        await tx.runQuery(
          'INSERT INTO credit_note_redemptions (credit_note_id, sale_id, amount) VALUES (?, ?, ?)',
          [r.credit_note_id, saleId, r.amount]
        );
      }

      // 7. Insert individual items into sale_items and allocate stock batches
      for (const item of preparedItems) {
        let itemColourStr = null;
        if (item.colorBreakdown && item.colorBreakdown.length === 1) {
          itemColourStr = item.colorBreakdown[0].color;
        } else if (item.colorBreakdown && item.colorBreakdown.length > 1) {
          itemColourStr = item.colorBreakdown.map((c) => `${c.color}: ${c.qty}`).join(', ');
        } else if (item.selected_colour || item.colour) {
          itemColourStr = String(item.selected_colour || item.colour).trim();
        } else if (item.productColours && item.productColours.length === 1) {
          itemColourStr = item.productColours[0];
        }

        const customProductName = item.custom_product_name !== undefined && item.custom_product_name !== null
          ? (String(item.custom_product_name).trim() || null)
          : (item.product_name !== undefined ? (String(item.product_name).trim() || null) : null);

        const customBrandName = item.custom_brand_name !== undefined && item.custom_brand_name !== null
          ? (String(item.custom_brand_name).trim() || null)
          : (item.manufacturing_brand_name !== undefined ? (String(item.manufacturing_brand_name).trim() || null) : null);

        await tx.runQuery(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price, price_type, colour, custom_product_name, custom_brand_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            item.product_id,
            item.saleQuantity,
            item.unitPrice,
            item.saleTotal,
            item.price_type || 'retail',
            itemColourStr,
            customProductName,
            customBrandName
          ]
        );

        let remaining = item.saleQuantity;
        for (const batch of item.batches) {
          if (remaining <= 0) break;
          const allocated = Math.min(remaining, Number(batch.quantity_remaining));
          await tx.runQuery('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [allocated, batch.id]);
          await tx.runQuery(
            'INSERT INTO sale_batch_allocations (sale_id, batch_id, quantity, purchase_price) VALUES (?, ?, ?, ?)',
            [saleId, batch.id, allocated, batch.purchase_price]
          );
          remaining -= allocated;
        }
        await syncStockFromBatches(tx, shopId, item.product_id);
      }

      // 8. Record extra expenses associated with the sale
      if (validExpenses.length > 0) {
        for (const exp of validExpenses) {
          await tx.runQuery(
            'INSERT INTO sale_expenses (sale_id, expense_type, expense_name, amount) VALUES (?, ?, ?, ?)',
            [saleId, exp.expense_type, exp.expense_name, exp.amount]
          );
        }
      }

      // 9. Record payment if initial amount was paid on this sale
      if (advanceDeduction > 0) {
        await tx.runQuery(
          'INSERT INTO payments (sale_id, amount, payment_date, payment_mode, note) VALUES (?, ?, ?, ?, ?)',
          [saleId, advanceDeduction, today(), 'store_credit', 'Auto-adjusted from Customer Advance / Store Credit']
        );
      }
      if (directPaidForThisSale > 0) {
        await tx.runQuery(
          'INSERT INTO payments (sale_id, amount, payment_date, payment_mode, note) VALUES (?, ?, ?, ?, ?)',
          [saleId, directPaidForThisSale, today(), payment_mode, 'Initial sale payment']
        );
      }

      // 10. If excess payment was made towards previous balance, allocate in FIFO to older sales
      if (excessPaid > 0) {
        const olderSales = await tx.allRecords(
          'SELECT * FROM sales WHERE customer_id = ? AND pending_amount > 0 AND id != ? ORDER BY due_date ASC, id ASC FOR UPDATE',
          [customer_id, saleId]
        );
        let remainingExcess = excessPaid;
        for (const os of olderSales) {
          if (remainingExcess <= 0) break;
          const alloc = Math.min(remainingExcess, money(os.pending_amount));
          const newOsPaid = money(money(os.paid_amount) + alloc);
          const newOsPending = Math.max(money(money(os.total_amount) - newOsPaid), 0);
          await tx.runQuery(
            'UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?',
            [newOsPaid, newOsPending, newOsPending > 0 ? 'open' : 'paid', os.id]
          );
          await tx.runQuery(
            'INSERT INTO payments (sale_id, amount, payment_date, payment_mode, note) VALUES (?, ?, ?, ?, ?)',
            [os.id, alloc, today(), payment_mode, `Payment applied via sale carry-forward (INV-${String(saleId).padStart(6, '0')})`]
          );
          remainingExcess = money(remainingExcess - alloc);
        }
        
        // If excess remains even after clearing all older sales, credit remainder to customer advance_balance!
        if (remainingExcess > 0) {
          await tx.runQuery(
            'UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + ? WHERE id = ?',
            [remainingExcess, customer_id]
          );
        }
      }

      if (advanceDeduction > 0) {
        await audit(req, 'Applied advance credit', 'sale', saleId, `Auto-adjusted ₹${advanceDeduction} advance credit for INV-${String(saleId).padStart(6, '0')}`);
      }

      return { 
        id: saleId,
        ids: [saleId], 
        invoice_number: `INV-${String(saleId).padStart(6, '0')}`,
        public_token: publicToken,
        public_url: `/invoice/public/${publicToken}`,
        pending_amount: thisSalePending, 
        total_amount: saleNetInvoiceTotal, 
        products_total: productsTotal,
        extra_expenses_total: extraExpensesTotal,
        original_total: originalTotal, 
        discount_amount: discountAmount, 
        discount_percentage: discountPercentage,
        previous_balance: previousBalance,
        current_invoice_total: currentInvoiceTotal,
        applied_credit_amount: actualAppliedCredit,
        advance_applied: advanceDeduction,
        net_payable_amount: netPayableAmount,
        paid_amount: numPaid,
        closing_balance: closingBalance,
        invoice_date: invoiceDateStr,
        payment_terms_days: paymentTermsDays,
        due_date: calculatedDueDate
      };
    });

    await audit(req, 'Created sale', 'sale', result.id, `${result.invoice_number}, products total ${result.products_total}, prev balance ${result.previous_balance}, applied credit ${result.applied_credit_amount}, net payable ${result.net_payable_amount}, closing balance ${result.closing_balance}`);
    res.status(201).json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to create sale.' });
  }
});

// Public invoice retrieval endpoint via secure public_token
app.get(['/api/public/invoice/:token', '/public/invoice/:token', '/api/invoice/public/:token', '/invoice/public/:token'], async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Invoice token is required.' });

    const sale = await getRecord(`
      SELECT sa.*, 
        c.name AS customer_name, c.mobile AS customer_mobile, c.address AS customer_address, c.gstin AS customer_gstin,
        COALESCE(c.advance_balance, 0) AS customer_advance_balance,
        sh.name AS shop_name, sh.area AS shop_area, sh.address AS shop_address, sh.phone AS shop_phone
      FROM sales sa
      JOIN shops sh ON sh.id = sa.shop_id
      LEFT JOIN customers c ON c.id = sa.customer_id
      WHERE sa.public_token = ?
    `, [token]);

    if (!sale) return res.status(404).json({ error: 'Invoice not found or invalid link.' });

    const items = await allRecords(`
      SELECT si.*, 
        COALESCE(si.custom_product_name, p.short_name, p.name) AS product_name,
        p.brand, p.category, p.model, p.full_model_list
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
      ORDER BY si.id ASC
    `, [sale.id]);

    const expenses = await allRecords(`
      SELECT * FROM sale_expenses WHERE sale_id = ? ORDER BY id ASC
    `, [sale.id]);

    const payments = await allRecords(`
      SELECT * FROM payments WHERE sale_id = ? ORDER BY payment_date ASC, id ASC
    `, [sale.id]);

    res.json({
      sale: {
        ...sale,
        items,
        expenses,
        payments
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load public invoice.' });
  }
});

const handleUpdateSale = async (req, res) => {
  try {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      return res.status(400).json({ error: 'Choose a valid sale.' });
    }

    const result = await runTransaction(async (tx) => {
      const sale = await tx.getRecord('SELECT * FROM sales WHERE id = ? FOR UPDATE', [saleId]);
      if (!sale) {
        const error = new Error('Sale not found.');
        error.status = 404;
        throw error;
      }

      // Assert shop access
      assertShopAccess(req, sale.shop_id);
      if (isShopStaffRole(req.user.role) && (Number(sale.shop_id) !== Number(req.user.shop_id))) {
        const error = new Error('You cannot edit sales outside your assigned shop.');
        error.status = 403;
        throw error;
      }

      // 1. Resolve invoice_date and payment_terms_days
      let invoiceDateStr = sale.invoice_date ? String(sale.invoice_date).slice(0, 10) : (sale.sale_date ? String(sale.sale_date).slice(0, 10) : today());
      if (req.body.invoice_date !== undefined || req.body.sale_date !== undefined) {
        const candidate = String(req.body.invoice_date || req.body.sale_date || '').trim().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
          invoiceDateStr = candidate;
        } else {
          const error = new Error('Invoice date must be in YYYY-MM-DD format.');
          error.status = 400;
          throw error;
        }
      }

      let paymentTermsDays = Number(sale.payment_terms_days !== undefined && sale.payment_terms_days !== null ? sale.payment_terms_days : 15);
      if (req.body.payment_terms !== undefined || req.body.payment_terms_days !== undefined) {
        const candidateTerms = Number(req.body.payment_terms ?? req.body.payment_terms_days);
        if (Number.isInteger(candidateTerms) && candidateTerms >= 0) {
          paymentTermsDays = candidateTerms;
        } else {
          const error = new Error('Payment terms must be a non-negative integer.');
          error.status = 400;
          throw error;
        }
      }

      // Recalculate due_date as invoice_date + payment_terms
      const invoiceDateObj = new Date(invoiceDateStr + 'T00:00:00');
      const validInvoiceDate = isNaN(invoiceDateObj.getTime()) ? new Date() : invoiceDateObj;
      const dueDateObj = new Date(validInvoiceDate);
      dueDateObj.setDate(dueDateObj.getDate() + paymentTermsDays);
      const dueY = dueDateObj.getFullYear();
      const dueM = String(dueDateObj.getMonth() + 1).padStart(2, '0');
      const dueD = String(dueDateObj.getDate()).padStart(2, '0');
      const calculatedDueDate = `${dueY}-${dueM}-${dueD}`;

      // 2. Resolve notes & payment_mode & customer_id
      let notes = sale.notes || '';
      if (req.body.notes !== undefined || req.body.remarks !== undefined) {
        notes = String(req.body.notes ?? req.body.remarks ?? '').trim();
      }
      const paymentMode = req.body.payment_mode || sale.payment_mode || 'cash';
      const targetCustomerId = req.body.customer_id ? Number(req.body.customer_id) : sale.customer_id;

      // 3. Resolve extra_expenses (Courier / Other charges)
      let extraExpensesTotal = Number(sale.extra_expenses_total || 0);
      let expensesUpdated = false;

      if (req.body.expenses !== undefined && Array.isArray(req.body.expenses)) {
        expensesUpdated = true;
        await tx.runQuery('DELETE FROM sale_expenses WHERE sale_id = ?', [saleId]);
        const validExpenses = [];
        for (const exp of req.body.expenses) {
          if (!exp) continue;
          const amt = Number(exp.amount || 0);
          if (isNaN(amt) || amt < 0) {
            const error = new Error('Expense amount cannot be negative.');
            error.status = 400;
            throw error;
          }
          const expName = String(exp.expense_name || exp.description || 'Extra Expense').trim();
          if (amt > 0) {
            validExpenses.push({
              expense_type: String(exp.expense_type || 'courier').trim().slice(0, 50),
              expense_name: expName.slice(0, 255),
              amount: money(amt),
            });
          }
        }
        for (const exp of validExpenses) {
          await tx.runQuery(
            'INSERT INTO sale_expenses (sale_id, expense_type, expense_name, amount) VALUES (?, ?, ?, ?)',
            [saleId, exp.expense_type, exp.expense_name, exp.amount]
          );
        }
        extraExpensesTotal = validExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      } else if (req.body.extra_expenses !== undefined || req.body.courier !== undefined || req.body.courier_charge !== undefined) {
        expensesUpdated = true;
        const amt = Number(req.body.extra_expenses ?? req.body.courier ?? req.body.courier_charge ?? 0);
        if (isNaN(amt) || amt < 0) {
          const error = new Error('Extra expenses cannot be negative.');
          error.status = 400;
          throw error;
        }
        extraExpensesTotal = money(amt);
        await tx.runQuery('DELETE FROM sale_expenses WHERE sale_id = ?', [saleId]);
        if (extraExpensesTotal > 0) {
          await tx.runQuery(
            'INSERT INTO sale_expenses (sale_id, expense_type, expense_name, amount) VALUES (?, ?, ?, ?)',
            [saleId, 'courier', 'Courier', extraExpensesTotal]
          );
        }
      }

      // 4. Handle Line Items Update & Stock Reconciliation
      let itemsUpdated = false;
      let preparedItems = [];
      let productsTotal = Number(sale.products_total || 0);
      let totalQty = Number(sale.quantity || 1);
      let primaryProductId = sale.product_id;
      let overallColourStr = sale.colour || null;

      if (req.body.items !== undefined && Array.isArray(req.body.items) && req.body.items.length > 0) {
        itemsUpdated = true;

        // A. Revert previous stock deductions back to inventory batches
        const oldAllocations = await tx.allRecords(
          `SELECT sba.batch_id, sba.quantity, ib.product_id
           FROM sale_batch_allocations sba
           JOIN inventory_batches ib ON ib.id = sba.batch_id
           WHERE sba.sale_id = ?`,
          [saleId]
        );
        for (const alloc of oldAllocations) {
          await tx.runQuery(
            'UPDATE inventory_batches SET quantity_remaining = quantity_remaining + ? WHERE id = ?',
            [alloc.quantity, alloc.batch_id]
          );
          await syncStockFromBatches(tx, sale.shop_id, alloc.product_id);
        }
        await tx.runQuery('DELETE FROM sale_batch_allocations WHERE sale_id = ?', [saleId]);
        await tx.runQuery('DELETE FROM sale_items WHERE sale_id = ?', [saleId]);

        // B. Allocate new stock items
        const reservedByBatch = new Map();
        for (const item of req.body.items) {
          const saleQuantity = Number(item.quantity);
          if (!Number.isInteger(saleQuantity) || saleQuantity <= 0) {
            const error = new Error('Every item quantity must be at least 1.');
            error.status = 400;
            throw error;
          }
          const product = await tx.getRecord('SELECT id, short_name, name, sale_price, wholesale_price, manufacturing_brand_id, colours FROM products WHERE id = ?', [item.product_id]);
          let unitPrice = 0;
          if (item.selling_price !== undefined && item.selling_price !== null && item.selling_price !== '' && !isNaN(Number(item.selling_price))) {
            unitPrice = money(item.selling_price);
          } else if (item.unit_price !== undefined && item.unit_price !== null && item.unit_price !== '' && !isNaN(Number(item.unit_price))) {
            unitPrice = money(item.unit_price);
          } else {
            unitPrice = money(item.price_type === 'wholesale' ? product?.wholesale_price : product?.sale_price);
          }
          if (!product || unitPrice <= 0) {
            const error = new Error(`Selling price must be greater than 0 for "${product?.short_name || product?.name || 'this product'}".`);
            error.status = 400;
            throw error;
          }

          const rawColours = product?.available_colours || product?.colours;
          let productColours = [];
          if (Array.isArray(rawColours)) {
            productColours = rawColours.map(c => String(c).trim()).filter(Boolean);
          } else if (typeof rawColours === 'string' && rawColours.trim()) {
            try {
              const parsed = JSON.parse(rawColours);
              if (Array.isArray(parsed)) productColours = parsed.map(c => String(c).trim()).filter(Boolean);
              else productColours = rawColours.split(',').map(c => c.trim()).filter(Boolean);
            } catch {
              productColours = rawColours.split(',').map(c => c.trim()).filter(Boolean);
            }
          }

          const colorBreakdown = Array.isArray(item.color_breakdown) 
            ? item.color_breakdown.filter(c => c && c.color && Number(c.qty) > 0) 
            : [];

          const batches = await tx.allRecords(
            `SELECT id, purchase_price, quantity_remaining, colour FROM inventory_batches ib
             WHERE shop_id = ? AND product_id = ? AND quantity_remaining > 0
               ${item.batch_id ? 'AND id = ?' : ''}${batchAccessSql(req.user)}
             ORDER BY received_date ASC, id ASC`,
            item.batch_id ? [sale.shop_id, item.product_id, item.batch_id] : [sale.shop_id, item.product_id]
          );
          const availableBatches = batches.map((batch) => ({
            ...batch,
            quantity_remaining: Math.max(Number(batch.quantity_remaining || 0) - Number(reservedByBatch.get(batch.id) || 0), 0),
          })).filter((batch) => batch.quantity_remaining > 0);
          const available = availableBatches.reduce((sum, batch) => sum + batch.quantity_remaining, 0);
          if (available < saleQuantity) {
            const prodName = product.short_name || product.name || 'Selected product';
            const error = new Error(`Not enough stock for "${prodName}" in this workspace. (Available: ${available}, Requested: ${saleQuantity})`);
            error.status = 400;
            throw error;
          }

          let toReserve = saleQuantity;
          const reservedBatches = [];

          if (colorBreakdown.length > 0) {
            for (const cb of colorBreakdown) {
              let colorNeed = Number(cb.qty);
              for (const batch of availableBatches) {
                if (colorNeed <= 0) break;
                if (batch.quantity_remaining > 0 && String(batch.colour || '').trim().toLowerCase() === String(cb.color).trim().toLowerCase()) {
                  const take = Math.min(colorNeed, batch.quantity_remaining);
                  reservedByBatch.set(batch.id, Number(reservedByBatch.get(batch.id) || 0) + take);
                  reservedBatches.push({ ...batch, quantity_remaining: take });
                  batch.quantity_remaining -= take;
                  colorNeed -= take;
                  toReserve -= take;
                }
              }
            }
          }

          for (const batch of availableBatches) {
            if (toReserve <= 0) break;
            if (batch.quantity_remaining <= 0) continue;
            const reserved = Math.min(toReserve, batch.quantity_remaining);
            reservedByBatch.set(batch.id, Number(reservedByBatch.get(batch.id) || 0) + reserved);
            reservedBatches.push({ ...batch, quantity_remaining: reserved });
            batch.quantity_remaining -= reserved;
            toReserve -= reserved;
          }
          preparedItems.push({ ...item, saleQuantity, saleTotal: unitPrice * saleQuantity, batches: reservedBatches, unitPrice, product, colorBreakdown, productColours });
        }

        // Insert new sale items and batch allocations
        for (const item of preparedItems) {
          let itemColourStr = null;
          if (item.colorBreakdown && item.colorBreakdown.length === 1) {
            itemColourStr = item.colorBreakdown[0].color;
          } else if (item.colorBreakdown && item.colorBreakdown.length > 1) {
            itemColourStr = item.colorBreakdown.map((c) => `${c.color}: ${c.qty}`).join(', ');
          } else if (item.selected_colour || item.colour) {
            itemColourStr = String(item.selected_colour || item.colour).trim();
          } else if (item.productColours && item.productColours.length === 1) {
            itemColourStr = item.productColours[0];
          }

          const customProductName = item.custom_product_name !== undefined && item.custom_product_name !== null
            ? (String(item.custom_product_name).trim() || null)
            : null;
          const customBrandName = item.custom_brand_name !== undefined && item.custom_brand_name !== null
            ? (String(item.custom_brand_name).trim() || null)
            : null;

          await tx.runQuery(
            `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price, price_type, colour, custom_product_name, custom_brand_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              saleId,
              item.product_id,
              item.saleQuantity,
              item.unitPrice,
              item.saleTotal,
              item.price_type || 'retail',
              itemColourStr,
              customProductName,
              customBrandName
            ]
          );

          let remaining = item.saleQuantity;
          for (const batch of item.batches) {
            if (remaining <= 0) break;
            const allocated = Math.min(remaining, Number(batch.quantity_remaining));
            await tx.runQuery('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [allocated, batch.id]);
            await tx.runQuery(
              'INSERT INTO sale_batch_allocations (sale_id, batch_id, quantity, purchase_price) VALUES (?, ?, ?, ?)',
              [saleId, batch.id, allocated, batch.purchase_price]
            );
            remaining -= allocated;
          }
          await syncStockFromBatches(tx, sale.shop_id, item.product_id);
        }

        productsTotal = preparedItems.reduce((sum, item) => sum + item.saleTotal, 0);
        totalQty = preparedItems.reduce((sum, item) => sum + item.saleQuantity, 0);
        primaryProductId = preparedItems[0]?.product_id || sale.product_id;

        const colourSummaries = preparedItems.map((it) => {
          if (it.colorBreakdown && it.colorBreakdown.length === 1) return it.colorBreakdown[0].color;
          if (it.colorBreakdown && it.colorBreakdown.length > 1) return it.colorBreakdown.map((c) => `${c.color}: ${c.qty}`).join(', ');
          if (it.selected_colour || it.colour) return String(it.selected_colour || it.colour).trim();
          return null;
        }).filter(Boolean);
        overallColourStr = colourSummaries.length ? colourSummaries.join(', ') : null;
      } else if (!productsTotal || productsTotal <= 0) {
        const itemTotals = await tx.getRecord(
          'SELECT COALESCE(SUM(total_price), 0) AS pt FROM sale_items WHERE sale_id = ?',
          [saleId]
        );
        productsTotal = Number(itemTotals?.pt || sale.total_amount || 0);
      }

      // 5. Customer Opening Balance Synchronization if previous_balance was provided
      let previousBalance = Number(sale.previous_balance || 0);
      if (req.body.previous_balance !== undefined && req.body.previous_balance !== null && req.body.previous_balance !== '' && !isNaN(Number(req.body.previous_balance))) {
        previousBalance = money(req.body.previous_balance);
        const otherSalesPendingRow = await tx.getRecord(
          'SELECT COALESCE(SUM(pending_amount), 0) AS p FROM sales WHERE customer_id = ? AND id != ? AND pending_amount > 0',
          [targetCustomerId, saleId]
        );
        const otherPending = Number(otherSalesPendingRow?.p || 0);
        const newOpeningBal = Math.max(0, money(previousBalance - otherPending));
        await tx.runQuery(
          'UPDATE customers SET opening_balance = ? WHERE id = ?',
          [newOpeningBal, targetCustomerId]
        );
      }

      // 6. Recalculate totals and financials
      const discountAmount = Number(sale.discount_amount || 0);
      const currentInvoiceTotal = (itemsUpdated || expensesUpdated)
        ? Math.max(money(productsTotal + extraExpensesTotal - discountAmount), 0)
        : Number(sale.current_invoice_total || sale.total_amount || 0);

      const appliedCreditAmount = Number(sale.applied_credit_amount || 0);
      const netPayableAmount = (itemsUpdated || expensesUpdated || req.body.previous_balance !== undefined)
        ? Math.max(money(currentInvoiceTotal + previousBalance - appliedCreditAmount), 0)
        : Number(sale.net_payable_amount || (currentInvoiceTotal + previousBalance - appliedCreditAmount));

      let paidAmount = Number(sale.paid_amount || 0);
      if (req.body.paid_amount !== undefined && !isNaN(Number(req.body.paid_amount))) {
        paidAmount = money(req.body.paid_amount);
      }

      const pendingAmount = Math.max(money(currentInvoiceTotal - paidAmount), 0);
      const closingBalance = Math.max(money(netPayableAmount - paidAmount), 0);
      const status = pendingAmount > 0 ? 'open' : 'paid';

      // 7. Update sales record
      await tx.runQuery(
        `UPDATE sales
         SET customer_id = ?,
             product_id = ?,
             quantity = ?,
             invoice_date = ?,
             sale_date = ?,
             payment_terms_days = ?,
             due_date = ?,
             notes = ?,
             payment_mode = ?,
             colour = ?,
             previous_balance = ?,
             extra_expenses_total = ?,
             products_total = ?,
             total_amount = ?,
             current_invoice_total = ?,
             net_payable_amount = ?,
             paid_amount = ?,
             pending_amount = ?,
             closing_balance = ?,
             status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          targetCustomerId,
          primaryProductId,
          totalQty,
          invoiceDateStr,
          invoiceDateStr,
          paymentTermsDays,
          calculatedDueDate,
          notes,
          paymentMode,
          overallColourStr,
          previousBalance,
          extraExpensesTotal,
          productsTotal,
          currentInvoiceTotal,
          currentInvoiceTotal,
          netPayableAmount,
          paidAmount,
          pendingAmount,
          closingBalance,
          status,
          saleId
        ]
      );

      const updatedSale = await tx.getRecord(
        `SELECT sa.*, 
                c.name AS customer_name, c.mobile AS customer_mobile, c.address AS customer_address,
                sh.name AS shop_name
         FROM sales sa
         JOIN shops sh ON sh.id = sa.shop_id
         LEFT JOIN customers c ON c.id = sa.customer_id
         WHERE sa.id = ?`,
        [saleId]
      );

      const items = await tx.allRecords('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC', [saleId]);
      const expList = await tx.allRecords('SELECT * FROM sale_expenses WHERE sale_id = ? ORDER BY id ASC', [saleId]);

      return {
        ...updatedSale,
        items,
        expenses: expList
      };
    });

    await audit(
      req, 
      'Updated sale', 
      'sale', 
      saleId, 
      `INV-${String(saleId).padStart(6, '0')}, date ${result.invoice_date}, terms ${result.payment_terms_days}d, due ${result.due_date}, total ₹${result.total_amount}`
    );

    res.json({
      success: true,
      message: `Sale INV-${String(saleId).padStart(6, '0')} updated successfully.`,
      sale: result
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to update sale.' });
  }
};

app.put('/api/sales/:id', authenticateToken, requireShopStaff, handleUpdateSale);
app.patch('/api/sales/:id', authenticateToken, requireShopStaff, handleUpdateSale);

app.delete('/api/sales/:id', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) return res.status(400).json({ error: 'Choose a valid sale.' });

    const result = await runTransaction(async (tx) => {
      const sale = await tx.getRecord(
        `SELECT sa.*, p.short_name, p.name AS product_name
         FROM sales sa
         LEFT JOIN products p ON p.id = sa.product_id
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

      // Fetch all items in this sale
      const saleItems = await tx.allRecords('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]).catch(() => []);
      const productIdsToSync = new Set();
      if (sale.product_id) productIdsToSync.add(sale.product_id);
      for (const it of saleItems) {
        if (it.product_id) productIdsToSync.add(it.product_id);
      }

      // 1. Restore batch allocations
      const allocations = await tx.allRecords(
        'SELECT batch_id, quantity FROM sale_batch_allocations WHERE sale_id = ?',
        [saleId]
      ).catch(() => []);

      let restoredQty = 0;
      if (allocations.length > 0) {
        for (const allocation of allocations) {
          const allocQty = Number(allocation.quantity || 0);
          if (allocQty > 0) {
            await tx.runQuery(
              'UPDATE inventory_batches SET quantity_remaining = quantity_remaining + ? WHERE id = ?',
              [allocQty, allocation.batch_id]
            );
            restoredQty += allocQty;
          }
        }
      }

      // Fallback: If no allocations were found (or partial), restore to the product's batch for each item
      if (allocations.length === 0) {
        if (saleItems.length > 0) {
          for (const it of saleItems) {
            const qty = Number(it.quantity || 1);
            const batch = await tx.getRecord(
              'SELECT id FROM inventory_batches WHERE product_id = ? AND shop_id = ? ORDER BY id DESC LIMIT 1',
              [it.product_id, sale.shop_id]
            );
            if (batch) {
              await tx.runQuery(
                'UPDATE inventory_batches SET quantity_remaining = quantity_remaining + ? WHERE id = ?',
                [qty, batch.id]
              );
            } else {
              await tx.runQuery(
                'UPDATE stock SET quantity = quantity + ? WHERE product_id = ? AND shop_id = ?',
                [qty, it.product_id, sale.shop_id]
              );
            }
          }
        } else {
          const saleQty = Number(sale.quantity || 0);
          if (saleQty > 0 && sale.product_id) {
            const batch = await tx.getRecord(
              'SELECT id FROM inventory_batches WHERE product_id = ? AND shop_id = ? ORDER BY id DESC LIMIT 1',
              [sale.product_id, sale.shop_id]
            );
            if (batch) {
              await tx.runQuery(
                'UPDATE inventory_batches SET quantity_remaining = quantity_remaining + ? WHERE id = ?',
                [saleQty, batch.id]
              );
            } else {
              await tx.runQuery(
                'UPDATE stock SET quantity = quantity + ? WHERE product_id = ? AND shop_id = ?',
                [saleQty, sale.product_id, sale.shop_id]
              );
            }
          }
        }
      }

      // 2. Restore any redeemed credit notes from this sale
      const redemptions = await tx.allRecords('SELECT * FROM credit_note_redemptions WHERE sale_id = ?', [saleId]).catch(() => []);
      for (const r of redemptions) {
        const amt = Number(r.amount || 0);
        if (amt > 0) {
          await tx.runQuery(
            `UPDATE credit_notes 
             SET used_amount = GREATEST(0, used_amount - ?), balance_amount = balance_amount + ?,
                 status = CASE WHEN balance_amount + ? >= amount THEN 'active' ELSE 'partially_used' END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [amt, amt, amt, r.credit_note_id]
          );
        }
      }
      await tx.runQuery('DELETE FROM credit_note_redemptions WHERE sale_id = ?', [saleId]).catch(() => {});

      // [FIX A6] Reverse advance_applied that was deducted from customer advance_balance at sale time.
      // Previously this was never reversed on deletion, permanently corrupting customer balance.
      const advanceApplied = money(sale.advance_applied || 0);
      if (advanceApplied > 0 && sale.customer_id) {
        await tx.runQuery(
          'UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + ? WHERE id = ?',
          [advanceApplied, sale.customer_id]
        );
      }

      // [FIX A6b] Reverse any excess payments that were forwarded from this sale to other older sales.
      // These are identified by their payment note containing the invoice number of the deleted sale.
      const invTag = `INV-${String(saleId).padStart(6, '0')}`;
      const forwardedPayments = await tx.allRecords(
        `SELECT p.id, p.sale_id, p.amount FROM payments p
         WHERE p.note LIKE ? AND p.sale_id != ? AND p.sale_id IS NOT NULL`,
        [`%${invTag}%`, saleId]
      ).catch(() => []);
      for (const fp of forwardedPayments) {
        const fpAmt = money(fp.amount || 0);
        if (fpAmt > 0) {
          // Re-open the older sale: subtract the allocated amount from paid, add back to pending
          const olderSale = await tx.getRecord('SELECT * FROM sales WHERE id = ? FOR UPDATE', [fp.sale_id]);
          if (olderSale) {
            const restoredPaid = Math.max(0, money(money(olderSale.paid_amount) - fpAmt));
            const settlementBase = money(olderSale.net_payable_amount) > 0
              ? money(olderSale.net_payable_amount)
              : money(olderSale.total_amount);
            const restoredPending = Math.max(0, money(settlementBase - restoredPaid));
            await tx.runQuery(
              'UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?',
              [restoredPaid, restoredPending, restoredPending > 0 ? 'open' : 'paid', fp.sale_id]
            );
          }
          await tx.runQuery('DELETE FROM payments WHERE id = ?', [fp.id]);
        }
      }

      // 3. Delete payment records, expenses, items, allocations
      await tx.runQuery('DELETE FROM payments WHERE sale_id = ?', [saleId]).catch(() => {});
      await tx.runQuery('DELETE FROM sale_expenses WHERE sale_id = ?', [saleId]).catch(() => {});
      await tx.runQuery('DELETE FROM sale_items WHERE sale_id = ?', [saleId]).catch(() => {});
      await tx.runQuery('DELETE FROM sale_batch_allocations WHERE sale_id = ?', [saleId]).catch(() => {});

      // 3. Delete sale record
      await tx.runQuery('DELETE FROM sales WHERE id = ?', [saleId]);

      // 4. Synchronize stock table for all affected products
      for (const pid of productIdsToSync) {
        if (sale.shop_id && pid) {
          await syncStockFromBatches(tx, sale.shop_id, pid);
        }
      }

      return sale;
    });

    await audit(req, 'Deleted sale and restored stock', 'sale', saleId, `Invoice INV-${String(saleId).padStart(6, '0')}`);
    res.json({ success: true, message: 'Sale deleted and stock restored.' });
  } catch (error) {
    console.error('[DELETE SALE ERROR]', error.message, error.stack);
    res.status(error.status || 500).json({ error: error.message || 'Unable to delete this sale.' });
  }
});

app.get('/api/branch/warehouse-stock', authenticateToken, async (req, res) => {
  try {
    const warehouse = await getWarehouse();
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not configured.' });

    const rows = await allRecords(`
      SELECT 
        p.id, p.name, p.short_name, p.brand, p.category, p.part_category, p.quality_variant,
        mb.name AS manufacturing_brand_name, p.full_model_list, p.model, p.colours,
        p.sale_price, p.wholesale_price, p.purchase_price, p.image_url,
        COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = p.id AND ib.shop_id = ?), 0) AS warehouse_stock
      FROM products p
      LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
      WHERE p.is_active = 1
        AND (
          COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = p.id AND ib.shop_id = ?), 0) > 0
          OR EXISTS (SELECT 1 FROM stock s WHERE s.product_id = p.id AND s.shop_id = ? AND s.quantity > 0)
        )
      ORDER BY p.name ASC
    `, [warehouse.id, warehouse.id, warehouse.id]);

    // Aggregate colour breakdown per product from active warehouse batches
    const batchRows = await allRecords(`
      SELECT product_id, COALESCE(NULLIF(TRIM(colour), ''), 'Standard') as colour, SUM(quantity_remaining) as qty
      FROM inventory_batches
      WHERE shop_id = ? AND quantity_remaining > 0
      GROUP BY product_id, COALESCE(NULLIF(TRIM(colour), ''), 'Standard')
    `, [warehouse.id]);

    const colourStockByProd = new Map();
    batchRows.forEach(b => {
      if (!colourStockByProd.has(b.product_id)) colourStockByProd.set(b.product_id, {});
      colourStockByProd.get(b.product_id)[b.colour] = Number(b.qty);
    });

    rows.forEach(r => {
      r.colour_stock = colourStockByProd.get(r.id) || {};
    });

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to fetch warehouse stock.' });
  }
});

app.get(['/api/stock-requests', '/api/requisitions', '/api/stock-orders'], authenticateToken, async (req, res) => {
  try {
    const warehouse = await getWarehouse();
    const warehouseId = warehouse?.id || null;

    let targetShopId = null;
    if (isShopStaffRole(req.user.role)) {
      targetShopId = req.user.shop_id;
    } else {
      const candidateShopId = req.query.shopId || req.query.branchId || req.query.branch_id;
      if (candidateShopId && candidateShopId !== 'all') {
        const parsed = Number(candidateShopId);
        // If superadmin is filtering by the warehouse (Workspace: Warehouse) or 'all',
        // do not filter by branch shop_id so all branch requests to the warehouse are shown.
        if (parsed && (!warehouseId || parsed !== Number(warehouseId))) {
          targetShopId = parsed;
        }
      }
    }

    const queryParams = [];
    const whereConditions = [];

    if (targetShopId) {
      whereConditions.push('sr.shop_id = ?');
      queryParams.push(targetShopId);
    }

    if (req.query.status && req.query.status !== 'all') {
      const statusParam = String(req.query.status).toLowerCase().trim();
      if (statusParam === 'pending' || statusParam === 'open') {
        whereConditions.push("LOWER(sr.status) IN ('pending', 'open')");
      } else if (statusParam === 'completed' || statusParam === 'approved' || statusParam === 'dispatched') {
        whereConditions.push("LOWER(sr.status) IN ('completed', 'approved', 'dispatched')");
      } else {
        whereConditions.push('LOWER(sr.status) = ?');
        queryParams.push(statusParam);
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const requests = await allRecords(`
      SELECT 
        sr.id, sr.request_number, sr.shop_id, sr.product_id, sr.model_name, sr.quantity,
        sr.total_items, sr.total_quantity, sr.message, sr.notes, sr.rejection_reason,
        sr.created_by, sr.status, sr.approved_by, sr.approved_at, sr.created_at, sr.updated_at,
        sr.resolved_at,
        sh.name AS shop_name, sh.area AS shop_area,
        u.name AS created_by_name,
        approver.name AS approved_by_name
      FROM stock_requests sr
      LEFT JOIN shops sh ON sh.id = sr.shop_id
      LEFT JOIN users u ON u.id = sr.created_by
      LEFT JOIN users approver ON approver.id = sr.approved_by
      ${whereClause}
      ORDER BY 
        CASE LOWER(sr.status) WHEN 'pending' THEN 0 WHEN 'open' THEN 1 WHEN 'approved' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END,
        sr.id DESC
    `, queryParams);

    if (requests.length > 0) {
      const requestIds = requests.map(r => r.id);
      const items = await allRecords(`
        SELECT 
          sri.*,
          p.short_name AS product_short_name,
          p.image_url,
          p.sale_price,
          p.wholesale_price,
          COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = sri.product_id AND ib.shop_id = ?), 0) AS warehouse_stock
        FROM stock_request_items sri
        LEFT JOIN products p ON p.id = sri.product_id
        WHERE sri.request_id IN (${requestIds.map(() => '?').join(', ')})
        ORDER BY sri.id ASC
      `, [warehouseId, ...requestIds]);

      const itemsByReq = new Map();
      items.forEach(item => {
        if (!itemsByReq.has(item.request_id)) itemsByReq.set(item.request_id, []);
        itemsByReq.get(item.request_id).push(item);
      });

      requests.forEach(r => {
        r.items = itemsByReq.get(r.id) || [];
      });
    }

    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load stock requisitions.' });
  }
});

app.post(['/api/stock-requests', '/api/requisitions', '/api/stock-orders'], authenticateToken, async (req, res) => {
  try {
    const warehouse = await getWarehouse();
    const warehouseId = warehouse?.id || null;

    let shopId = isShopStaffRole(req.user.role) 
      ? (req.user.shop_id || req.body.shop_id || req.body.branch_id || req.body.workspace_id)
      : (req.body.shop_id || req.body.branch_id || req.body.workspace_id || req.user.shop_id);

    // If shopId was somehow pointing to warehouse, fall back to first non-warehouse branch
    if (warehouseId && Number(shopId) === Number(warehouseId)) {
      const branchShops = await allRecords("SELECT id FROM shops WHERE location_type != 'warehouse' ORDER BY id");
      if (req.body.branch_id && Number(req.body.branch_id) !== Number(warehouseId)) {
        shopId = req.body.branch_id;
      } else if (branchShops.length > 0) {
        shopId = branchShops[0].id;
      }
    }

    if (!shopId) return res.status(400).json({ error: 'Valid shop/branch ID is required.' });

    const { items = [], notes = '', message = '', status: rawStatus } = req.body;
    const initialStatus = (rawStatus ? String(rawStatus).toLowerCase().trim() : 'pending') || 'pending';
    
    // Handle single-item legacy fallback if body has product_id directly
    const normalizedItems = Array.isArray(items) && items.length > 0
      ? items
      : (req.body.product_id ? [{ product_id: req.body.product_id, requested_qty: req.body.quantity || 1, color_breakdown: req.body.color_breakdown || [] }] : []);

    if (!normalizedItems.length) {
      return res.status(400).json({ error: 'Please add at least one product to the stock requisition.' });
    }

    const year = new Date().getFullYear();
    const countRow = await getRecord(`SELECT COUNT(*) AS count FROM stock_requests WHERE created_at >= date_trunc('year', CURRENT_DATE)`);
    const nextSeq = (Number(countRow?.count || 0) + 1).toString().padStart(4, '0');
    const requestNumber = `REQ-${year}-${nextSeq}`;

    const totalQuantity = normalizedItems.reduce((sum, item) => sum + (Number(item.requested_qty || item.quantity) || 1), 0);
    const totalItems = normalizedItems.length;

    const result = await runTransaction(async (tx) => {
      const header = await tx.runQuery(`
        INSERT INTO stock_requests (
          request_number, shop_id, product_id, model_name, quantity, total_items, total_quantity,
          message, notes, created_by, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        requestNumber,
        shopId,
        normalizedItems[0]?.product_id || null,
        normalizedItems[0]?.product_name || '',
        totalQuantity,
        totalItems,
        totalQuantity,
        message || notes || '',
        notes || message || '',
        req.user.id,
        initialStatus
      ]);

      const requestId = header.id;

      for (const item of normalizedItems) {
        const prodId = item.product_id;
        let prodInfo = null;
        if (prodId) {
          prodInfo = await tx.getRecord(`SELECT name, short_name, brand, part_category, quality_variant, purchase_price, wholesale_price FROM products WHERE id = ?`, [prodId]);
        }
        const prodName = prodInfo?.name || item.product_name || 'Product';
        const brand = prodInfo?.brand || item.brand || '';
        const quality = prodInfo?.quality_variant || item.quality_grade || item.variant || '';
        const reqQty = Math.max(1, Number(item.requested_qty || item.quantity || 1));
        const colorBreakdown = Array.isArray(item.color_breakdown) ? JSON.stringify(item.color_breakdown) : '[]';
        const unitCost = Number(prodInfo?.purchase_price || prodInfo?.wholesale_price || item.unit_cost || 0);

        await tx.runQuery(`
          INSERT INTO stock_request_items (
            request_id, product_id, product_name, brand, quality_grade,
            requested_qty, approved_qty, color_breakdown, unit_cost
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          requestId, prodId || null, prodName, brand, quality, reqQty, reqQty, colorBreakdown, unitCost
        ]);
      }

      return { id: requestId, request_number: requestNumber, status: initialStatus };
    });

    await audit(req, 'Created stock requisition', 'stock_request', result.id, `${requestNumber} with ${totalQuantity} units`);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to submit stock requisition.' });
  }
});

app.put(['/api/admin/stock-requests/:id/approve', '/api/admin/requisitions/:id/approve'], authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    const warehouse = await getWarehouse();
    if (!warehouse) return res.status(400).json({ error: 'Warehouse configuration not found.' });

    const result = await runTransaction(async (tx) => {
      const request = await tx.getRecord(`SELECT * FROM stock_requests WHERE id = ? FOR UPDATE`, [requestId]);
      if (!request) throw new Error('Stock requisition not found.');
      const currentStatus = String(request.status || '').toLowerCase().trim();
      if (['approved', 'completed', 'dispatched'].includes(currentStatus)) {
        throw new Error('This stock requisition has already been approved and fulfilled.');
      }

      const items = await tx.allRecords(`SELECT * FROM stock_request_items WHERE request_id = ?`, [requestId]);
      if (!items.length) {
        throw new Error('No items found on this requisition.');
      }

      const targetShopId = request.shop_id;

      for (const item of items) {
        const prodId = item.product_id;
        const requestedQty = Number(item.requested_qty || 1);
        let breakdown = [];
        try {
          breakdown = typeof item.color_breakdown === 'string' ? JSON.parse(item.color_breakdown) : (item.color_breakdown || []);
        } catch {
          breakdown = [];
        }

        // Available batches in warehouse (FIFO)
        const whBatches = await tx.allRecords(`
          SELECT * FROM inventory_batches 
          WHERE shop_id = ? AND product_id = ? AND quantity_remaining > 0 
          ORDER BY received_date ASC, id ASC
        `, [warehouse.id, prodId]);

        const totalWhAvailable = whBatches.reduce((sum, b) => sum + Number(b.quantity_remaining || 0), 0);
        if (totalWhAvailable < requestedQty) {
          throw new Error(`Insufficient warehouse stock for "${item.product_name}". Requested: ${requestedQty}, Available: ${totalWhAvailable}`);
        }

        // Deduct batches
        let unitsToFulfill = requestedQty;
        
        // If color breakdown exists, deduct color-matching batches first
        if (Array.isArray(breakdown) && breakdown.length > 0) {
          for (const cb of breakdown) {
            let colorNeeded = Number(cb.qty || 0);
            if (colorNeeded <= 0) continue;

            const matchingBatches = whBatches.filter(b => 
              b.quantity_remaining > 0 && 
              String(b.colour || '').trim().toLowerCase() === String(cb.color || '').trim().toLowerCase()
            );

            for (const batch of matchingBatches) {
              if (colorNeeded <= 0 || unitsToFulfill <= 0) break;
              const moved = Math.min(colorNeeded, Number(batch.quantity_remaining), unitsToFulfill);
              
              batch.quantity_remaining = Number(batch.quantity_remaining) - moved;
              await tx.runQuery(`UPDATE inventory_batches SET quantity_remaining = ? WHERE id = ?`, [batch.quantity_remaining, batch.id]);

              await tx.runQuery(`
                INSERT INTO inventory_batches (
                  shop_id, product_id, purchase_price, wholesale_price, official_price, retail_price,
                  colour, quantity_received, quantity_remaining, received_date, notes, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                targetShopId, prodId, batch.purchase_price, batch.wholesale_price, batch.official_price, batch.retail_price,
                batch.colour || cb.color, moved, moved, today(), `Requisition ${request.request_number || requestId} fulfillment`, req.user.id
              ]);

              colorNeeded -= moved;
              unitsToFulfill -= moved;
            }
          }
        }

        // Generic FIFO deduction for remaining units
        if (unitsToFulfill > 0) {
          for (const batch of whBatches) {
            if (unitsToFulfill <= 0) break;
            if (Number(batch.quantity_remaining) <= 0) continue;

            const moved = Math.min(unitsToFulfill, Number(batch.quantity_remaining));
            batch.quantity_remaining = Number(batch.quantity_remaining) - moved;
            await tx.runQuery(`UPDATE inventory_batches SET quantity_remaining = ? WHERE id = ?`, [batch.quantity_remaining, batch.id]);

            await tx.runQuery(`
              INSERT INTO inventory_batches (
                shop_id, product_id, purchase_price, wholesale_price, official_price, retail_price,
                colour, quantity_received, quantity_remaining, received_date, notes, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                targetShopId, prodId, batch.purchase_price, batch.wholesale_price, batch.official_price, batch.retail_price,
                batch.colour, moved, moved, today(), `Requisition ${request.request_number || requestId} fulfillment`, req.user.id
            ]);

            unitsToFulfill -= moved;
          }
        }

        // Update approved quantity on the item
        await tx.runQuery(`UPDATE stock_request_items SET approved_qty = ? WHERE id = ?`, [requestedQty, item.id]);

        // Sync stock tables
        await syncStockFromBatches(tx, warehouse.id, prodId);
        await syncStockFromBatches(tx, targetShopId, prodId);

        // Record stock transfer audit
        await tx.runQuery(`
          INSERT INTO stock_transfers (from_shop_id, to_shop_id, product_id, quantity, transfer_date, note)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          warehouse.id, targetShopId, prodId, requestedQty, today(), `Approved requisition ${request.request_number || requestId}`
        ]);
      }

      // Mark request as completed
      await tx.runQuery(`
        UPDATE stock_requests 
        SET status = 'completed', approved_by = ?, approved_at = CURRENT_TIMESTAMP, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.user.id, requestId]);

      return { success: true, request_number: request.request_number };
    });

    await audit(req, 'Approved and fulfilled stock requisition', 'stock_request', requestId, `Dispatched to shop ${result.request_number}`);
    res.json({ success: true, message: `Requisition ${result.request_number || requestId} successfully approved and stock transferred.` });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to approve stock requisition.' });
  }
});

app.put(['/api/admin/stock-requests/:id/reject', '/api/admin/requisitions/:id/reject'], authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    const { rejection_reason = '' } = req.body;

    const request = await getRecord(`SELECT * FROM stock_requests WHERE id = ?`, [requestId]);
    if (!request) return res.status(404).json({ error: 'Requisition not found.' });
    const currentStatus = String(request.status || '').toLowerCase().trim();
    if (['approved', 'completed', 'dispatched'].includes(currentStatus)) {
      return res.status(400).json({ error: 'Cannot reject an already fulfilled requisition.' });
    }

    await runQuery(`
      UPDATE stock_requests 
      SET status = 'rejected', rejection_reason = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [rejection_reason || 'Rejected by Warehouse Admin', requestId]);

    await audit(req, 'Rejected stock requisition', 'stock_request', requestId, rejection_reason);
    res.json({ success: true, message: 'Stock requisition marked as rejected.' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to reject stock requisition.' });
  }
});

app.put('/api/stock-requests/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  const allowed = new Set(['pending', 'open', 'sent', 'approved', 'completed', 'closed', 'cancelled', 'rejected']);
  const status = String(req.body.status || '').toLowerCase();
  if (!allowed.has(status)) return res.status(400).json({ error: 'Choose a valid request status.' });
  await runQuery(
    "UPDATE stock_requests SET status = ?, resolved_at = CASE WHEN ? IN ('completed', 'closed', 'cancelled', 'rejected') THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id = ?",
    [status, status, req.params.id]
  );
  await audit(req, 'Updated stock request', 'stock_request', req.params.id, status);
  res.json({ success: true });
});

app.get('/api/pending-payments', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = isShopStaffRole(req.user.role) ? req.user.shop_id : scopeShopId(req);
  const pagination = parsePagination(req.query);
  const params = [];
  const where = ['1=1'];
  if (shopId) {
    where.push('c.shop_id = ?');
    params.push(shopId);
  }
  appendSearchFilter(where, params, req.query.search, [
    "COALESCE(c.name, '')",
    "COALESCE(c.mobile, '')",
    "COALESCE(p.name, '')",
    "COALESCE(p.short_name, '')",
    "COALESCE(p.full_model_list, '')",
    "COALESCE(p.brand, '')",
    "COALESCE(p.category, '')",
    "COALESCE(p.model, '')",
    "COALESCE(p.description, '')",
    "COALESCE(sh.name, '')",
    "COALESCE(sa.notes, '')",
  ]);
  if (hasQueryValue(req.query.date)) {
    where.push('sa.due_date = ?');
    params.push(String(req.query.date).slice(0, 10));
  } else {
    appendDateRangeFilter(where, params, req.query.dateFrom || req.query.from, req.query.dateTo || req.query.to, 'sa.due_date');
  }
  if (isShopStaffRole(req.user.role)) {
    where.push('(sa.created_by IS NULL OR sa.created_by = ? OR c.created_by = ?)');
    params.push(req.user.id, req.user.id);
  }
  const groupOrderSql = "sa.due_date ASC NULLS LAST, sa.id ASC";
  const baseSql = `
    FROM customers c
    JOIN shops sh ON sh.id = c.shop_id
    LEFT JOIN sales sa ON sa.customer_id = c.id ${shopId ? 'AND sa.shop_id = ' + Number(shopId) : ''}
    LEFT JOIN products p ON p.id = sa.product_id
    LEFT JOIN manufacturing_brands mb ON mb.id = COALESCE(sa.manufacturing_brand_id, p.manufacturing_brand_id)
    LEFT JOIN (
      SELECT si.sale_id, json_agg(json_build_object(
        'id', si.id,
        'product_id', si.product_id,
        'quantity', si.quantity,
        'unit_price', si.unit_price,
        'total_price', si.total_price,
        'price_type', si.price_type,
        'colour', si.colour,
        'custom_product_name', si.custom_product_name,
        'custom_brand_name', si.custom_brand_name,
        'name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
        'product_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
        'short_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
        'product_short_name', COALESCE(si.custom_product_name, p_item.short_name, p_item.name),
        'brand', p_item.brand,
        'brand_name', COALESCE(si.custom_brand_name, mb_item.name, p_item.brand),
        'mfg_brand', COALESCE(si.custom_brand_name, mb_item.name, p_item.brand),
        'manufacturing_brand_id', COALESCE(p_item.manufacturing_brand_id, mb_item.id),
        'manufacturing_brand_name', COALESCE(si.custom_brand_name, mb_item.name, p_item.brand),
        'category', COALESCE(p_item.part_category, p_item.category, 'Display'),
        'quality_variant', p_item.quality_variant,
        'model', p_item.model,
        'full_model_list', p_item.full_model_list,
        'description', p_item.description
      ) ORDER BY si.id ASC) AS items
      FROM sale_items si
      JOIN products p_item ON p_item.id = si.product_id
      LEFT JOIN manufacturing_brands mb_item ON mb_item.id = p_item.manufacturing_brand_id
      GROUP BY si.sale_id
    ) si_agg ON si_agg.sale_id = sa.id
    LEFT JOIN (
      SELECT sale_id, json_agg(json_build_object('id', id, 'expense_type', expense_type, 'expense_name', expense_name, 'amount', amount)) AS expenses
      FROM sale_expenses
      GROUP BY sale_id
    ) se ON se.sale_id = sa.id
    LEFT JOIN (
      SELECT sale_id, json_agg(json_build_object(
        'id', id,
        'amount', amount,
        'payment_date', payment_date,
        'payment_mode', payment_mode,
        'note', note,
        'created_at', created_at
      ) ORDER BY payment_date ASC, id ASC) AS payments
      FROM payments
      GROUP BY sale_id
    ) pm ON pm.sale_id = sa.id
    WHERE ${where.join(' AND ')}
    GROUP BY c.id, c.name, c.mobile, c.address, c.shop_id, sh.id, sh.name, sh.area, sh.address, sh.phone
    HAVING (COALESCE(SUM(sa.pending_amount), 0) + COALESCE(c.opening_balance, 0)) > 0
  `;
  const rows = await runPaginatedList({
    dataSql: `
    SELECT
      'customer-' || c.shop_id || ':' || c.id AS id,
      c.id AS customer_id,
      c.shop_id,
      c.name AS customer_name,
      c.mobile AS mobile,
      c.address AS address,
      sh.name AS shop_name,
      sh.area AS shop_area,
      sh.address AS shop_address,
      sh.phone AS shop_phone,
      COALESCE(SUM(sa.total_amount), 0) AS total_amount,
      COALESCE(SUM(sa.paid_amount), 0) AS paid_amount,
      COALESCE(SUM(sa.pending_amount), 0) + COALESCE(c.opening_balance, 0) AS pending_amount,
      COALESCE(c.opening_balance, 0) AS opening_balance,
      COALESCE(c.advance_balance, 0) AS advance_balance,
      (ARRAY_AGG(sa.due_date ORDER BY ${groupOrderSql}) FILTER (WHERE sa.id IS NOT NULL))[1] AS due_date,
      COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
        'id', sa.id,
        'invoice_number', COALESCE(sa.invoice_number, 'INV-' || LPAD(sa.id::TEXT, 6, '0')),
        'shop_id', sa.shop_id,
        'product_id', sa.product_id,
        'customer_id', sa.customer_id,
        'quantity', sa.quantity,
        'total_amount', sa.total_amount,
        'paid_amount', sa.paid_amount,
        'pending_amount', sa.pending_amount,
        'products_total', sa.products_total,
        'extra_expenses_total', sa.extra_expenses_total,
        'discount_amount', sa.discount_amount,
        'due_date', sa.due_date,
        'sale_date', sa.sale_date,
        'invoice_date', COALESCE(sa.invoice_date::TEXT, sa.sale_date::TEXT),
        'notes', sa.notes,
        'status', sa.status,
        'created_by', sa.created_by,
        'payment_mode', sa.payment_mode,
        'price_type', sa.price_type,
        'product_name', p.name,
        'product_short_name', p.short_name,
        'full_model_list', p.full_model_list,
        'brand', p.brand,
        'brand_name', COALESCE(mb.name, p.brand),
        'mfg_brand', COALESCE(mb.name, p.brand),
        'category', p.category,
        'description', p.description,
        'manufacturing_brand_id', sa.manufacturing_brand_id,
        'manufacturing_brand_name', COALESCE(mb.name, p.brand),
        'customer_name', c.name,
        'mobile', c.mobile,
        'address', c.address,
        'shop_name', sh.name,
        'shop_area', sh.area,
        'shop_address', sh.address,
        'shop_phone', sh.phone,
        'display_name', COALESCE(p.short_name, p.name),
        'items', COALESCE(si_agg.items, JSON_BUILD_ARRAY()),
        'expenses', COALESCE(se.expenses, '[]'::json),
        'payments', COALESCE(pm.payments, '[]'::json)
      ) ORDER BY ${groupOrderSql}) FILTER (WHERE sa.id IS NOT NULL), '[]'::json) AS items
    ${baseSql}
    ORDER BY pending_amount DESC
  `,
    countSql: `SELECT COUNT(*) AS total FROM (SELECT 1 ${baseSql}) counted`,
    params,
    pagination,
    totalKey: 'totalPendingCustomers',
  });
  res.json(rows);
});

app.post('/api/payments', authenticateToken, requireShopStaff, async (req, res) => {
  const { sale_id, customer_id, shop_id, amount, note, payment_mode = 'cash', payment_date } = req.body;
  if ((!sale_id && !customer_id) || !amount) return res.status(400).json({ error: 'Customer or sale and amount are required.' });
  const paymentAmount = money(amount);
  if (paymentAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero.' });

  const payDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payment_date || '')) ? String(payment_date) : today();
  const payMode = String(payment_mode || 'cash').trim();

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
        const totalSalesPending = sales.reduce((sum, sale) => sum + money(sale.pending_amount), 0);
        let remainingPayment = paymentAmount;
        let excessAdvance = 0;

        for (const sale of sales) {
          if (remainingPayment <= 0) break;
          const invoiceDue = Math.max(0, money(money(sale.total_amount) - money(sale.paid_amount)));
          if (invoiceDue <= 0) {
            await tx.runQuery('UPDATE sales SET pending_amount = 0, status = ? WHERE id = ?', ['paid', sale.id]);
            continue;
          }
          const allocated = Math.min(remainingPayment, invoiceDue);
          const newPaid = money(money(sale.paid_amount) + allocated);
          const newPending = Math.max(0, money(money(sale.total_amount) - newPaid));
          const newStatus = newPending <= 0 ? 'paid' : 'open';
          await tx.runQuery(
            'INSERT INTO payments (sale_id, amount, payment_date, payment_mode, note) VALUES (?, ?, ?, ?, ?)',
            [sale.id, allocated, payDate, payMode, note || 'Customer balance payment']
          );
          await tx.runQuery('UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?', [newPaid, newPending, newStatus, sale.id]);
          remainingPayment = money(remainingPayment - allocated);
        }

        const custRec = await tx.getRecord('SELECT COALESCE(opening_balance, 0) AS opening_balance FROM customers WHERE id = ?', [customer_id]);
        let currentOpeningBal = money(custRec?.opening_balance || 0);

        if (remainingPayment > 0 && currentOpeningBal > 0) {
          const openingDeduction = Math.min(remainingPayment, currentOpeningBal);
          await tx.runQuery(
            'UPDATE customers SET opening_balance = opening_balance - ? WHERE id = ?',
            [openingDeduction, customer_id]
          );
          currentOpeningBal -= openingDeduction;
          remainingPayment -= openingDeduction;
        }

        if (remainingPayment > 0) {
          excessAdvance = money(remainingPayment);
          await tx.runQuery(
            'UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + ? WHERE id = ?',
            [excessAdvance, customer_id]
          );
        }

        const remainingTotalPending = Math.max(0, money((totalSalesPending + currentOpeningBal) - paymentAmount));
        return { pending_amount: remainingTotalPending, excess_credited: excessAdvance };
      });
      await audit(req, 'Recorded customer payment', 'customer', customer_id, `Paid ${paymentAmount} on ${payDate} via ${payMode}, remaining ${result.pending_amount}${result.excess_credited ? `, credited ₹${result.excess_credited} to advance balance` : ''}`);
      return res.json({ success: true, pending_amount: result.pending_amount, excess_credited: result.excess_credited });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Unable to record customer payment.' });
    }
  }

  const sale = await getRecord('SELECT * FROM sales WHERE id = ?', [sale_id]);
  if (!sale) return res.status(404).json({ error: 'Sale not found.' });
  if (isShopStaffRole(req.user.role) && Number(req.user.shop_id) !== Number(sale.shop_id)) {
    return res.status(403).json({ error: 'This sale belongs to another branch.' });
  }

  const invoiceDue = Math.max(0, money(money(sale.total_amount) - money(sale.paid_amount)));
  const allocatedPayment = Math.min(paymentAmount, invoiceDue);
  const excessPayment = Math.max(0, money(paymentAmount - invoiceDue));

  const newPaid = money(money(sale.paid_amount) + allocatedPayment);
  const newPending = Math.max(0, money(money(sale.total_amount) - newPaid));
  const newStatus = newPending <= 0 ? 'paid' : 'open';
  await runQuery(
    'INSERT INTO payments (sale_id, amount, payment_date, payment_mode, note) VALUES (?, ?, ?, ?, ?)',
    [sale_id, allocatedPayment, payDate, payMode, note || 'Payment update']
  );
  await runQuery('UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?', [newPaid, newPending, newStatus, sale_id]);

  let excessAdvance = 0;
  if (excessPayment > 0 && sale.customer_id) {
    const custRec = await getRecord('SELECT COALESCE(opening_balance, 0) AS opening_balance FROM customers WHERE id = ?', [sale.customer_id]);
    let currentOpeningBal = money(custRec?.opening_balance || 0);
    let remainingExcess = excessPayment;
    if (currentOpeningBal > 0) {
      const deduction = Math.min(remainingExcess, currentOpeningBal);
      await runQuery('UPDATE customers SET opening_balance = opening_balance - ? WHERE id = ?', [deduction, sale.customer_id]);
      remainingExcess -= deduction;
    }
    if (remainingExcess > 0) {
      excessAdvance = remainingExcess;
      await runQuery(
        'UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + ? WHERE id = ?',
        [excessAdvance, sale.customer_id]
      );
    }
  }

  await audit(req, 'Recorded payment', 'sale', sale_id, `Paid ${paymentAmount} on ${payDate} via ${payMode}, remaining ${newPending}${excessPayment > 0 ? `, credited ₹${excessPayment} to advance balance` : ''}`);
  res.json({ success: true, pending_amount: newPending, excess_credited: excessPayment });
});

app.get('/api/cash-customer', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = scopeShopId(req) || (req.user?.shop_id ? Number(req.user.shop_id) : 1);
    let cashCustomer = await getRecord(
      "SELECT * FROM customers WHERE shop_id = ? AND (name ILIKE '%Cash Customer%' OR mobile = '9999999999' OR mobile = '0000000000') ORDER BY id ASC LIMIT 1",
      [shopId]
    );
    if (!cashCustomer) {
      const ins = await runQuery(
        "INSERT INTO customers (shop_id, name, mobile, address, notes, opening_balance) VALUES (?, 'Cash Customer', '9999999999', 'Walk-in / Cash', 'Default Cash Customer', 0.00)",
        [shopId]
      );
      cashCustomer = await getRecord('SELECT * FROM customers WHERE id = ?', [ins.id]);
    }
    res.json({ success: true, customer: cashCustomer });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch default cash customer.' });
  }
});

app.post('/api/audit', authenticateToken, async (req, res) => {
  try {
    const { action, entity_type, entity_id, details } = req.body;
    if (!action) return res.status(400).json({ error: 'Action is required.' });
    await audit(req, action, entity_type || 'share', entity_id || null, details || '');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to log audit event.' });
  }
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
  const params = [];
  if (shopId) {
    params.push(Number(shopId));
  }
  const where = ['p.is_active = 1', 'p.name IS NOT NULL'];
  appendSearchFilter(where, params, search, [
    'p.name',
    "COALESCE(p.short_name, '')",
    "COALESCE(p.full_model_list, '')",
    "COALESCE(p.brand, '')",
    "COALESCE(p.category, '')",
    "COALESCE(p.model, '')",
    "COALESCE(p.description, '')",
    "COALESCE(array_to_string(p.colours, ','), '')",
  ]);
  appendExactFilter(where, params, brand, 'p.brand = ?');
  appendExactFilter(where, params, category, 'LOWER(TRIM(p.category)) = LOWER(TRIM(?))');
  if (hasQueryValue(colour)) {
    where.push(`EXISTS (
      SELECT 1 FROM UNNEST(p.colours) AS product_colour
      WHERE LOWER(TRIM(product_colour)) = LOWER(TRIM(?))
    )`);
    params.push(String(colour).trim());
  }
  where.push('p.retail_price BETWEEN ? AND ?');
  params.push(minPrice, maxPrice);

  const querySql = `
    SELECT p.id, p.name, p.short_name, p.full_model_list, p.brand, COALESCE(p.part_category, p.category, 'Display') AS category,
      COALESCE(p.part_category, p.category, 'Display') AS part_category, p.quality_variant, p.part_category_id, p.product_variant_id,
      pc.name AS part_category_name, pv.name AS product_variant_name,
      p.retail_price, p.description, p.colours,
      p.company_brand_id, b.name AS company_brand_name,
      p.manufacturing_brand_id, mb.name AS manufacturing_brand_name, p.model AS display_model,
      STRING_AGG(CASE WHEN st.quantity > 0 THEN sh.name || ' (' || st.quantity || ')' END, ', ') AS available_shops,
      COALESCE(SUM(st.quantity), 0) AS total_available
    FROM products p
    LEFT JOIN brands b ON b.id = p.company_brand_id
    LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
    LEFT JOIN part_categories pc ON pc.id = p.part_category_id
    LEFT JOIN product_variants pv ON pv.id = p.product_variant_id
    LEFT JOIN stock st ON st.product_id = p.id ${shopId ? 'AND st.shop_id = ?' : ''}
    LEFT JOIN shops sh ON sh.id = st.shop_id
    WHERE ${where.join(' AND ')}
    GROUP BY p.id, b.id, mb.id, pc.id, pv.id
    ORDER BY p.brand, COALESCE(p.short_name, p.name)
  `;

  const rows = await allRecords(querySql, params);
  res.json(rows);
});

app.get(['/api/export-data', '/export-data'], authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const { type = 'stock', shopId: queryShopId, brand, category, colour, status } = req.query;
    const shopId = isShopStaffRole(req.user.role) ? req.user.shop_id : (queryShopId ? Number(queryShopId) : null);

    if (type === 'products') {
      const rows = await allRecords(`
        SELECT 
          p.id,
          COALESCE(p.short_name, p.name) AS short_name,
          COALESCE(p.full_model_list, p.model) AS full_model_list,
          p.brand,
          p.category,
          array_to_string(p.colours, ', ') AS colours,
          p.purchase_price,
          p.wholesale_price,
          p.sale_price,
          p.retail_price,
          p.company_brand_id,
          b.name AS company_brand_name,
          p.manufacturing_brand_id,
          mb.name AS manufacturing_brand_name
        FROM products p
        LEFT JOIN brands b ON b.id = p.company_brand_id
        LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
        WHERE p.is_active = 1
        ORDER BY p.brand, COALESCE(p.short_name, p.name)
      `);
      return res.json(rows);
    }

    if (type === 'sales') {
      const params = [];
      const where = [];
      if (shopId) {
        where.push('sa.shop_id = ?');
        params.push(shopId);
      }
      if (isShopStaffRole(req.user.role)) {
        where.push('(sa.created_by IS NULL OR sa.created_by = ?)');
        params.push(req.user.id);
      }

      const rows = await allRecords(`
        SELECT
          sa.id AS sale_id,
          sa.sale_date,
          c.name AS customer_name,
          c.mobile AS customer_mobile,
          COALESCE(p.short_name, p.name) AS product_name,
          p.brand,
          p.category,
          sa.quantity,
          sa.price_type,
          sa.total_amount,
          sa.paid_amount,
          sa.pending_amount,
          sa.payment_mode,
          sh.name AS shop_name,
          sa.due_date,
          p.company_brand_id,
          b.name AS company_brand_name,
          sa.manufacturing_brand_id,
          mb.name AS manufacturing_brand_name
        FROM sales sa
        JOIN products p ON p.id = sa.product_id
        JOIN customers c ON c.id = sa.customer_id
        JOIN shops sh ON sh.id = sa.shop_id
        LEFT JOIN brands b ON b.id = p.company_brand_id
        LEFT JOIN manufacturing_brands mb ON mb.id = sa.manufacturing_brand_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY sa.sale_date DESC, sa.id DESC
      `, params);
      return res.json(rows);
    }

    if (type === 'customers') {
      const params = [];
      const where = [];
      if (shopId) {
        where.push('c.shop_id = ?');
        params.push(shopId);
      }

      const rows = await allRecords(`
        SELECT
          c.id,
          c.name,
          c.mobile,
          c.address,
          sh.name AS shop_name,
          COALESCE(SUM(sa.total_amount), 0) AS total_purchases,
          COALESCE(SUM(sa.pending_amount), 0) AS pending_balance,
          c.created_at AS registered_date
        FROM customers c
        JOIN shops sh ON sh.id = c.shop_id
        LEFT JOIN sales sa ON sa.customer_id = c.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY c.id, sh.name
        ORDER BY c.name
      `, params);
      return res.json(rows);
    }

    // Default: 'stock'
    const params = [];
    const where = ['p.is_active = 1'];

    if (shopId) {
      where.push('st.shop_id = ?');
      params.push(shopId);
    }

    if (brand && String(brand).trim()) {
      where.push('p.brand = ?');
      params.push(String(brand).trim());
    }

    if (category && String(category).trim()) {
      where.push('LOWER(TRIM(p.category)) = LOWER(TRIM(?))');
      params.push(String(category).trim());
    }

    if (colour && String(colour).trim()) {
      where.push(`EXISTS (
        SELECT 1 FROM UNNEST(p.colours) AS product_colour
        WHERE LOWER(TRIM(product_colour)) = LOWER(TRIM(?))
      )`);
      params.push(String(colour).trim());
    }

    if (status === 'low') {
      where.push('st.quantity > 0 AND st.quantity <= 3');
    } else if (status === 'out') {
      where.push('st.quantity = 0');
    } else if (status === 'in') {
      where.push('st.quantity > 0');
    }

    const rows = await allRecords(`
      SELECT 
        p.id AS product_id,
        COALESCE(p.short_name, p.name) AS product_name,
        COALESCE(p.full_model_list, p.model) AS model_name,
        p.brand,
        p.category,
        array_to_string(p.colours, ', ') AS colour,
        p.purchase_price,
        p.wholesale_price,
        p.sale_price,
        st.quantity,
        sh.name AS shopkeeper_name,
        st.updated_at AS date_added,
        CASE 
          WHEN st.quantity = 0 THEN 'Out of Stock'
          WHEN st.quantity <= 3 THEN 'Low Stock'
          ELSE 'In Stock'
        END AS stock_status,
        p.company_brand_id,
        b.name AS company_brand_name,
        p.manufacturing_brand_id,
        mb.name AS manufacturing_brand_name
      FROM stock st
      JOIN products p ON p.id = st.product_id
      JOIN shops sh ON sh.id = st.shop_id
      LEFT JOIN brands b ON b.id = p.company_brand_id
      LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.brand, COALESCE(p.short_name, p.name), sh.name
    `, params);

    res.json(rows);
  } catch (error) {
    console.error('[ExportAPI] Error exporting data:', error);
    res.status(500).json({ error: error.message || 'Failed to export CSV data.' });
  }
});


app.get('/api/reports', authenticateToken, requireShopStaff, async (req, res) => {
  const shopId = isShopStaffRole(req.user.role) ? req.user.shop_id : scopeShopId(req);
  const pendingByShop = await allRecords(`
    SELECT sh.name AS shop_name, 
      (COALESCE(SUM(sa.pending_amount), 0) + COALESCE((SELECT SUM(c.opening_balance) FROM customers c WHERE c.shop_id = sh.id), 0)) AS pending
    FROM shops sh
    LEFT JOIN sales sa ON sa.shop_id = sh.id
    ${shopId ? 'WHERE sh.id = ?' : ''}
    GROUP BY sh.id, sh.name
    ORDER BY pending DESC
  `, shopId ? [shopId] : []);
  const auditRows = isShopStaffRole(req.user.role)
    ? await allRecords("SELECT * FROM audit_logs WHERE actor_id = ? AND action = 'Created sale' ORDER BY id DESC LIMIT 25", [req.user.id])
    : await allRecords('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 25');
  res.json({ pendingByShop, auditRows });
});

app.delete('/api/reports/audit', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM audit_logs');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear audit logs.' });
  }
});
const detectBrand = (name, fullModelList, defaultBrand = 'Universal') => {
  const brandVal = String(name || '').trim();
  const modelsVal = String(fullModelList || '').trim();
  const text = `${brandVal} ${modelsVal}`.toLowerCase();

  if (text.includes('oneplus') || text.includes('1+') || text.includes('one plus')) return 'OnePlus';
  if (text.includes('realme') || text.includes('rmx') || text.includes('realm')) return 'Realme';
  if (text.includes('redmi') || text.includes('xiaomi') || /\bmi\b/i.test(text)) return 'Redmi';
  if (text.includes('poco')) return 'Poco';
  if (text.includes('motorola') || text.includes('moto')) return 'Motorola';
  if (text.includes('samsung') || text.includes('galaxy')) return 'Samsung';
  if (text.includes('infinix')) return 'Infinix';
  if (text.includes('iqoo')) return 'IQOO';
  if (text.includes('lava')) return 'Lava';
  if (text.includes('oppo')) return 'Oppo';
  if (text.includes('vivo')) return 'Vivo';
  if (text.includes('tecno')) return 'Tecno';
  if (text.includes('apple') || text.includes('iphone')) return 'Apple';
  if (text.includes('nokia')) return 'Nokia';

  const cleanDefault = String(defaultBrand || '').trim();
  return (cleanDefault === 'Generic' || cleanDefault === '') ? 'Universal' : cleanDefault;
};

app.post(['/api/inventory/bulk-import', '/inventory/bulk-import'], authenticateToken, requireSuperAdmin, async (req, res) => {
  const { fileName, destinationShopId, defaultAssignedUserId, records = [] } = req.body;
  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'No inventory records provided for bulk import.' });
  }

  const shopId = Number(destinationShopId) || 1;
  const assignedUserId = defaultAssignedUserId ? Number(defaultAssignedUserId) : null;
  const userId = req.user.id;

  let createdProductsCount = 0;
  let createdBatchesCount = 0;
  let totalQuantityAdded = 0;
  let totalValuation = 0;

  try {
    await runTransaction(async (tx) => {
      for (const item of records) {
        const name = String(item.short_name || item.name || '').trim();
        if (!name) continue;

        const fullModelList = String(item.full_model_list || item.models || '').trim();
        const rawBrand = String(item.brand || '').trim();
        const brand = (rawBrand && rawBrand !== 'Generic' && rawBrand !== 'Universal')
          ? rawBrand
          : detectBrand(name, fullModelList, rawBrand || 'Universal');
        const category = String(item.category || 'General').trim();
        const colour = String(item.colour || '').trim();
        const notes = String(item.notes || `Imported via ${fileName || 'Excel'}`).trim();

        const parseNum = (val, def = 0) => {
          if (val === null || val === undefined || val === '') return def;
          if (typeof val === 'number') return Number.isNaN(val) ? def : val;
          const cleaned = String(val).replace(/[^0-9.-]/g, '');
          const n = parseFloat(cleaned);
          return Number.isNaN(n) ? def : n;
        };

        const purchasePrice = Math.max(0, parseNum(item.purchase_price, 0));
        const wholesalePrice = Math.max(0, parseNum(item.wholesale_price, purchasePrice * 1.1));
        const retailPrice = Math.max(0, parseNum(item.retail_price || item.sale_price, purchasePrice * 1.3));
        const officialPrice = Math.max(0, parseNum(item.official_price, retailPrice));
        const qty = Math.max(1, Math.round(parseNum(item.quantity || item.qty, 1)));
        const dateIn = item.received_date ? String(item.received_date) : new Date().toISOString().split('T')[0];

        // Unique hash for row deduplication
        const sourceKey = item.source_key || `IMP-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // 1. Ensure Brand, Category, Colour exist
        if (category) {
          await tx.runQuery(
            'INSERT INTO categories (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)))',
            [category, category]
          );
        }
        if (brand) {
          await tx.runQuery(
            'INSERT INTO brands (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM brands WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)))',
            [brand, brand]
          );
        }
        if (colour) {
          await tx.runQuery(
            'INSERT INTO colours (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM colours WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)))',
            [colour, colour]
          );
        }

        const brandRef = await ensureReferenceInTransaction(tx, 'brands', brand);
        const companyBrandId = brandRef ? brandRef.id : null;

        const rawMfgBrandName = String(item.manufacturing_brand || '').trim();
        let mfgBrandId = null;
        if (rawMfgBrandName) {
          const mfgBrandRef = await ensureReferenceInTransaction(tx, 'manufacturing_brands', rawMfgBrandName);
          mfgBrandId = mfgBrandRef ? mfgBrandRef.id : null;
        } else if (req.body.default_manufacturing_brand_id) {
          mfgBrandId = Number(req.body.default_manufacturing_brand_id);
        } else {
          const unknownMfgBrand = await tx.getRecord("SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'unknown' LIMIT 1");
          mfgBrandId = unknownMfgBrand ? unknownMfgBrand.id : null;
        }

        // 2. Find or Create Product Catalog Entry
        let product = await tx.getRecord(
          `SELECT id, sale_price, purchase_price, wholesale_price FROM products 
           WHERE company_brand_id = ? 
             AND LOWER(TRIM(COALESCE(model, ''))) = LOWER(TRIM(COALESCE(?, ''))) 
             AND manufacturing_brand_id = ? 
             AND is_active = 1 LIMIT 1`,
          [companyBrandId, item.model || '', mfgBrandId]
        );

        let productId;
        if (!product) {
          const insertRes = await tx.runQuery(
            `INSERT INTO products (name, short_name, brand, category, full_model_list, purchase_price, wholesale_price, official_price, sale_price, description, colours, company_brand_id, manufacturing_brand_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              name,
              name,
              brand,
              category,
              fullModelList,
              purchasePrice,
              wholesalePrice,
              officialPrice,
              retailPrice,
              `Imported item from supplier file ${fileName || ''}`,
              colour ? [colour] : [],
              companyBrandId,
              mfgBrandId
            ]
          );
          productId = insertRes.id;
          createdProductsCount++;
        } else {
          productId = product.id;
          if (retailPrice > 0 || purchasePrice > 0) {
            await tx.runQuery(
              `UPDATE products SET 
                purchase_price = COALESCE(NULLIF(?, 0), purchase_price),
                wholesale_price = COALESCE(NULLIF(?, 0), wholesale_price),
                sale_price = COALESCE(NULLIF(?, 0), sale_price),
                brand = COALESCE(NULLIF(?, 'Generic'), brand),
                category = COALESCE(NULLIF(?, 'General'), category),
                company_brand_id = COALESCE(?, company_brand_id),
                manufacturing_brand_id = COALESCE(?, manufacturing_brand_id)
               WHERE id = ?`,
              [purchasePrice, wholesalePrice, retailPrice, brand, category, companyBrandId, mfgBrandId, productId]
            );
          }
        }

        // 3. Create FIFO Inventory Batch
        await tx.runQuery(
          `INSERT INTO inventory_batches (
            shop_id, product_id, assigned_user_id, purchase_price, wholesale_price, official_price, retail_price,
            colour, quantity_received, quantity_remaining, received_date, notes, source_key, created_by, manufacturing_brand_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (source_key) DO NOTHING`,
          [
            shopId,
            productId,
            assignedUserId,
            purchasePrice,
            wholesalePrice,
            officialPrice,
            retailPrice,
            colour || null,
            qty,
            qty,
            dateIn,
            notes,
            sourceKey,
            userId,
            mfgBrandId
          ]
        );

        createdBatchesCount++;
        totalQuantityAdded += qty;
        totalValuation += (purchasePrice || retailPrice) * qty;
      }

      // 4. Log Import Session Audit Record
      await tx.runQuery(
        `INSERT INTO import_logs (
          file_name, imported_by, total_rows, created_products, total_quantity, total_valuation, destination_shop_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          fileName || 'supplier_import.xlsx',
          userId,
          records.length,
          createdProductsCount,
          totalQuantityAdded,
          totalValuation,
          shopId
        ]
      );
    });

    res.json({
      success: true,
      summary: {
        totalRowsProcessed: records.length,
        createdProducts: createdProductsCount,
        createdBatches: createdBatchesCount,
        totalQuantityAdded,
        totalValuation: Number(totalValuation.toFixed(2))
      }
    });
  } catch (error) {
    console.error('[BulkImport] Error executing inventory import:', error);
    res.status(500).json({ error: error.message || 'Failed to execute bulk inventory import.' });
  }
});

app.get(['/api/inventory/import-logs', '/inventory/import-logs'], authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const logs = await allRecords(
      `SELECT il.*, u.name as importer_name, s.name as shop_name 
       FROM import_logs il
       LEFT JOIN users u ON u.id = il.imported_by
       LEFT JOIN shops s ON s.id = il.destination_shop_id
       ORDER BY il.import_timestamp DESC LIMIT 50`
    );
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch import logs.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE C: ACCOUNTING ENGINE ROUTES
// Chart of Accounts, Party Ledger, AR/AP Aging, Purchase Bills, Debit Notes
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Chart of Accounts ──────────────────────────────────────────────────────

app.get('/api/chart-of-accounts', authenticateToken, requireShopStaff, async (_req, res) => {
  try {
    const accounts = await allRecords(
      `SELECT id, code, name, account_type, parent_id, is_system, is_active
       FROM chart_of_accounts
       WHERE is_active = TRUE
       ORDER BY code ASC`
    );
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch chart of accounts.' });
  }
});

// ─── Customer Party Ledger ───────────────────────────────────────────────────

app.get('/api/ledger/customer/:id', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'Valid customer ID is required.' });
    }
    const shopId = scopeShopId(req);
    const { from, to } = req.query;
    const ledger = await getCustomerLedger(customerId, shopId, { from, to });
    res.json(ledger);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch customer ledger.' });
  }
});

// ─── Vendor Party Ledger ─────────────────────────────────────────────────────

app.get('/api/ledger/vendor/:id', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const supplierId = Number(req.params.id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return res.status(400).json({ error: 'Valid supplier ID is required.' });
    }
    const shopId = scopeShopId(req);
    const { from, to } = req.query;
    const ledger = await getVendorLedger(supplierId, shopId, { from, to });
    res.json(ledger);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch vendor ledger.' });
  }
});

// ─── AR Aging Report ─────────────────────────────────────────────────────────

app.get('/api/reports/ar-aging', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = scopeShopId(req);
    const asOfDate = String(req.query.as_of || req.query.date || '').slice(0, 10) || null;
    const report = await getARAgingReport(shopId, asOfDate);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to generate AR aging report.' });
  }
});

// ─── AP Aging Report ─────────────────────────────────────────────────────────

app.get('/api/reports/ap-aging', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = scopeShopId(req);
    const asOfDate = String(req.query.as_of || req.query.date || '').slice(0, 10) || null;
    const report = await getAPAgingReport(shopId, asOfDate);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to generate AP aging report.' });
  }
});

// ─── Journal Entries (audit trail) ───────────────────────────────────────────

app.get('/api/journal-entries', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = scopeShopId(req);
    const pagination = parsePagination(req.query);
    const where = ['1 = 1'];
    const params = [];
    if (shopId) { where.push('je.shop_id = ?'); params.push(shopId); }
    if (req.query.ref_type) { where.push('je.ref_type = ?'); params.push(req.query.ref_type); }
    if (req.query.ref_id)   { where.push('je.ref_id = ?');   params.push(Number(req.query.ref_id)); }
    appendDateRangeFilter(where, params, req.query.from, req.query.to, 'je.entry_date');

    const rows = await runPaginatedList({
      dataSql: `
        SELECT je.id, je.shop_id, je.entry_date, je.narration, je.ref_type, je.ref_id,
               je.is_reversed, je.created_at,
               JSON_AGG(JSON_BUILD_OBJECT(
                 'id', jel.id,
                 'account_code', coa.code,
                 'account_name', coa.name,
                 'account_type', coa.account_type,
                 'debit', jel.debit,
                 'credit', jel.credit,
                 'narration', jel.narration
               ) ORDER BY jel.id ASC) AS lines
        FROM journal_entries je
        LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
        WHERE ${where.join(' AND ')}
        GROUP BY je.id
        ORDER BY je.entry_date DESC, je.id DESC
      `,
      countSql: `SELECT COUNT(*) AS total FROM journal_entries je WHERE ${where.join(' AND ')}`,
      params,
      pagination,
      totalKey: 'totalJournalEntries',
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch journal entries.' });
  }
});

// ─── Purchase Bills ───────────────────────────────────────────────────────────

app.get('/api/purchase-bills', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = scopeShopId(req);
    const pagination = parsePagination(req.query);
    const where = ['1 = 1'];
    const params = [];
    if (shopId) { where.push('pb.shop_id = ?'); params.push(shopId); }
    if (req.query.supplier_id) { where.push('pb.supplier_id = ?'); params.push(Number(req.query.supplier_id)); }
    if (req.query.status)      { where.push('pb.status = ?');      params.push(req.query.status); }
    appendSearchFilter(where, params, req.query.search, ['pb.bill_number', "COALESCE(s.name, '')"]);
    appendDateRangeFilter(where, params, req.query.from, req.query.to, 'pb.bill_date');

    const rows = await runPaginatedList({
      dataSql: `
        SELECT pb.*, s.name AS supplier_name
        FROM purchase_bills pb
        LEFT JOIN suppliers s ON s.id = pb.supplier_id
        WHERE ${where.join(' AND ')}
        ORDER BY pb.bill_date DESC, pb.id DESC
      `,
      countSql: `SELECT COUNT(*) AS total FROM purchase_bills pb LEFT JOIN suppliers s ON s.id = pb.supplier_id WHERE ${where.join(' AND ')}`,
      params,
      pagination,
      totalKey: 'totalPurchaseBills',
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch purchase bills.' });
  }
});

app.get('/api/purchase-bills/:id', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const billId = Number(req.params.id);
    if (!Number.isInteger(billId) || billId <= 0) return res.status(400).json({ error: 'Valid bill ID required.' });
    const bill = await getRecord(
      `SELECT pb.*, s.name AS supplier_name
       FROM purchase_bills pb LEFT JOIN suppliers s ON s.id = pb.supplier_id
       WHERE pb.id = ?`, [billId]
    );
    if (!bill) return res.status(404).json({ error: 'Purchase bill not found.' });
    const items = await allRecords(
      `SELECT pbi.*, p.short_name AS product_name
       FROM purchase_bill_items pbi LEFT JOIN products p ON p.id = pbi.product_id
       WHERE pbi.bill_id = ?`, [billId]
    );
    res.json({ ...bill, items });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch purchase bill.' });
  }
});

app.post('/api/purchase-bills', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { supplier_id, bill_date, payment_terms_days = 30, notes, payment_mode = 'credit', items = [], extra_charges = 0 } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required.' });
    }
    const billDateStr = /^\d{4}-\d{2}-\d{2}$/.test(String(bill_date || '')) ? String(bill_date) : today();
    const terms = Math.max(0, Number(payment_terms_days) || 30);
    const dueDateObj = new Date(billDateStr + 'T00:00:00');
    dueDateObj.setDate(dueDateObj.getDate() + terms);
    const dueDate = dueDateObj.toISOString().slice(0, 10);

    const result = await runTransaction(async (tx) => {
      const validItems = [];
      let productsTotal = 0;
      for (const item of items) {
        const qty = Number(item.quantity);
        const unitPrice = money(item.unit_price);
        const discAmt   = money(item.discount_amount || 0);
        if (!Number.isInteger(qty) || qty <= 0 || unitPrice <= 0) {
          const err = new Error('Each item requires a valid quantity and unit price.');
          err.status = 400; throw err;
        }
        const lineTotal = money(qty * unitPrice - discAmt);
        productsTotal += lineTotal;
        validItems.push({ product_id: item.product_id || null, custom_product_name: item.custom_product_name || null, quantity: qty, unit_price: unitPrice, discount_amount: discAmt, total_price: lineTotal });
      }
      productsTotal = money(productsTotal);
      const extraCharges = money(extra_charges);
      const totalAmount = money(productsTotal + extraCharges);

      const seqRow = await tx.getRecord("SELECT nextval('purchase_bill_seq') AS seq");
      const billNumber = `BILL-${String(Number(seqRow.seq)).padStart(6, '0')}`;

      const ins = await tx.runQuery(
        `INSERT INTO purchase_bills (bill_number, shop_id, supplier_id, bill_date, due_date, payment_terms_days, products_total, extra_charges, total_amount, pending_amount, payment_mode, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        [billNumber, shopId, supplier_id || null, billDateStr, dueDate, terms, productsTotal, extraCharges, totalAmount, totalAmount, payment_mode, notes || '', req.user.id]
      );
      const billId = ins.id;

      for (const vi of validItems) {
        await tx.runQuery(
          `INSERT INTO purchase_bill_items (bill_id, product_id, custom_product_name, quantity, unit_price, discount_amount, total_price)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [billId, vi.product_id, vi.custom_product_name, vi.quantity, vi.unit_price, vi.discount_amount, vi.total_price]
        );
      }

      await postPurchaseBillJournal(tx, billId, shopId, supplier_id, totalAmount, billDateStr, req.user.id);
      return { id: billId, bill_number: billNumber, total_amount: totalAmount, pending_amount: totalAmount };
    });

    await audit(req, 'Created purchase bill', 'purchase_bill', result.id, `${result.bill_number}, total ${result.total_amount}`);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to create purchase bill.' });
  }
});

app.post('/api/purchase-bills/:id/pay', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const billId = Number(req.params.id);
    if (!Number.isInteger(billId) || billId <= 0) return res.status(400).json({ error: 'Valid bill ID required.' });
    const paymentAmount = money(req.body.amount);
    if (paymentAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    const paymentMode = String(req.body.payment_mode || 'cash').trim();
    const payDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.payment_date || '')) ? String(req.body.payment_date) : today();

    const result = await runTransaction(async (tx) => {
      const bill = await tx.getRecord('SELECT * FROM purchase_bills WHERE id = ? FOR UPDATE', [billId]);
      if (!bill) { const e = new Error('Bill not found.'); e.status = 404; throw e; }
      if (bill.status === 'cancelled') { const e = new Error('Cannot pay a cancelled bill.'); e.status = 400; throw e; }
      const allocated = Math.min(paymentAmount, money(bill.pending_amount));
      const newPaid    = money(money(bill.paid_amount) + allocated);
      const newPending = Math.max(0, money(money(bill.total_amount) - newPaid));
      const newStatus  = newPending <= 0 ? 'paid' : (newPaid > 0 ? 'partially_paid' : 'open');
      await tx.runQuery(
        'UPDATE purchase_bills SET paid_amount = ?, pending_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newPaid, newPending, newStatus, billId]
      );
      // Journal: DR AP, CR Cash/Bank
      const [apAccId, cashAccId] = await Promise.all([
        tx.getRecord("SELECT id FROM chart_of_accounts WHERE code = '2000'"),
        tx.getRecord("SELECT id FROM chart_of_accounts WHERE code = '1000'"),
      ]);
      if (apAccId && cashAccId) {
        const jeIns = await tx.runQuery(
          `INSERT INTO journal_entries (shop_id, entry_date, narration, ref_type, ref_id, created_by) VALUES (?, ?, ?, 'purchase_bill_payment', ?, ?)`,
          [bill.shop_id, payDate, `Vendor payment — ${bill.bill_number}`, billId, req.user.id]
        );
        await tx.runQuery(
          'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
          [jeIns.id, apAccId.id, allocated, 'purchase_bill', billId]
        );
        await tx.runQuery(
          'INSERT INTO journal_entry_lines (journal_entry_id, account_id, credit, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
          [jeIns.id, cashAccId.id, allocated, 'purchase_bill', billId]
        );
      }
      return { paid_amount: newPaid, pending_amount: newPending, status: newStatus };
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to record bill payment.' });
  }
});

// ─── Debit Notes (purchase returns — auto stock deduction) ────────────────────

app.get('/api/debit-notes', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = scopeShopId(req);
    const pagination = parsePagination(req.query);
    const where = ['1 = 1'];
    const params = [];
    if (shopId) { where.push('dn.shop_id = ?'); params.push(shopId); }
    if (req.query.supplier_id) { where.push('dn.supplier_id = ?'); params.push(Number(req.query.supplier_id)); }
    if (req.query.status)      { where.push('dn.status = ?');      params.push(req.query.status); }
    appendSearchFilter(where, params, req.query.search, ['dn.debit_note_number', "COALESCE(s.name, '')"]);
    appendDateRangeFilter(where, params, req.query.from, req.query.to, 'dn.return_date');

    const rows = await runPaginatedList({
      dataSql: `
        SELECT dn.*, s.name AS supplier_name,
          (SELECT COUNT(*) FROM debit_note_items dni WHERE dni.debit_note_id = dn.id) AS item_count
        FROM debit_notes dn
        LEFT JOIN suppliers s ON s.id = dn.supplier_id
        WHERE ${where.join(' AND ')}
        ORDER BY dn.return_date DESC, dn.id DESC
      `,
      countSql: `SELECT COUNT(*) AS total FROM debit_notes dn LEFT JOIN suppliers s ON s.id = dn.supplier_id WHERE ${where.join(' AND ')}`,
      params,
      pagination,
      totalKey: 'totalDebitNotes',
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch debit notes.' });
  }
});

app.get('/api/debit-notes/:id', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const dnId = Number(req.params.id);
    if (!Number.isInteger(dnId) || dnId <= 0) return res.status(400).json({ error: 'Valid debit note ID required.' });
    const dn = await getRecord(
      `SELECT dn.*, s.name AS supplier_name
       FROM debit_notes dn LEFT JOIN suppliers s ON s.id = dn.supplier_id
       WHERE dn.id = ?`, [dnId]
    );
    if (!dn) return res.status(404).json({ error: 'Debit note not found.' });
    const items = await allRecords(
      `SELECT dni.*, p.short_name AS product_name
       FROM debit_note_items dni LEFT JOIN products p ON p.id = dni.product_id
       WHERE dni.debit_note_id = ?`, [dnId]
    );
    res.json({ ...dn, items });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch debit note.' });
  }
});

app.post('/api/debit-notes', authenticateToken, requireShopStaff, async (req, res) => {
  try {
    const shopId = requireScopedShopId(req, req.body.shop_id);
    const { supplier_id, purchase_bill_id, reason = '', return_date, items = [] } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one returned item is required.' });
    }
    const returnDateStr = /^\d{4}-\d{2}-\d{2}$/.test(String(return_date || '')) ? String(return_date) : today();

    const result = await runTransaction(async (tx) => {
      // Validate items and calculate total
      const validItems = [];
      let totalAmount = 0;
      for (const item of items) {
        const qty = Number(item.quantity);
        const unitPrice = money(item.unit_price);
        if (!Number.isInteger(qty) || qty <= 0 || unitPrice < 0) {
          const e = new Error('Each item needs a valid quantity and unit price.'); e.status = 400; throw e;
        }
        const lineTotal = money(qty * unitPrice);
        totalAmount += lineTotal;
        validItems.push({
          product_id: item.product_id || null,
          custom_product_name: item.custom_product_name || null,
          quantity: qty,
          unit_price: unitPrice,
          total_price: lineTotal,
          colour: item.colour || null,
          restock_supplier: item.restock_supplier !== false,
        });
      }
      totalAmount = money(totalAmount);
      if (totalAmount <= 0) {
        const e = new Error('Total debit note amount must be greater than zero.'); e.status = 400; throw e;
      }

      // Generate unique debit note number via sequence
      const seqRow = await tx.getRecord("SELECT nextval('debit_note_seq') AS seq");
      const debitNoteNumber = `DN-${String(Number(seqRow.seq)).padStart(6, '0')}`;

      // Insert debit note header
      const dnIns = await tx.runQuery(
        `INSERT INTO debit_notes (debit_note_number, shop_id, supplier_id, purchase_bill_id, amount, reason, return_date, status, stock_deducted, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', FALSE, ?)`,
        [debitNoteNumber, shopId, supplier_id || null, purchase_bill_id || null, totalAmount, reason || 'Purchase return', returnDateStr, req.user.id]
      );
      const dnId = dnIns.id;

      // Insert items and auto-deduct stock
      for (const vi of validItems) {
        await tx.runQuery(
          `INSERT INTO debit_note_items (debit_note_id, product_id, custom_product_name, quantity, unit_price, total_price, colour, restock_supplier)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [dnId, vi.product_id, vi.custom_product_name, vi.quantity, vi.unit_price, vi.total_price, vi.colour, vi.restock_supplier]
        );

        // Auto stock deduction (per plan: automatic upon debit note confirmation)
        if (vi.product_id && vi.quantity > 0) {
          const colourCond = vi.colour ? 'AND LOWER(TRIM(colour)) = LOWER(TRIM(?))' : '';
          const batchParams = vi.colour ? [shopId, vi.product_id, vi.colour] : [shopId, vi.product_id];
          const batch = await tx.getRecord(
            `SELECT id, quantity_remaining FROM inventory_batches
             WHERE shop_id = ? AND product_id = ? ${colourCond}
             ORDER BY received_date DESC, id DESC LIMIT 1`,
            batchParams
          );
          if (batch && batch.quantity_remaining >= vi.quantity) {
            await tx.runQuery(
              'UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?',
              [vi.quantity, batch.id]
            );
            await syncStockFromBatches(tx, shopId, vi.product_id);
          }
          // (If insufficient stock, we still record the debit note but skip stock deduction gracefully)
        }
      }

      // Update debit note to mark stock as deducted
      await tx.runQuery(
        'UPDATE debit_notes SET stock_deducted = TRUE WHERE id = ?',
        [dnId]
      );

      // If linked to a purchase bill, reduce its total (AP credit)
      if (purchase_bill_id) {
        const bill = await tx.getRecord('SELECT * FROM purchase_bills WHERE id = ? FOR UPDATE', [purchase_bill_id]);
        if (bill) {
          const newPending = Math.max(0, money(money(bill.pending_amount) - totalAmount));
          const newPaid    = money(money(bill.total_amount) - newPending - money(bill.pending_amount - newPending - 0));
          const resolvedPending = newPending;
          const newStatus  = resolvedPending <= 0 ? 'paid' : (money(bill.paid_amount) > 0 ? 'partially_paid' : 'open');
          await tx.runQuery(
            'UPDATE purchase_bills SET pending_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [resolvedPending, newStatus, purchase_bill_id]
          );
        }
      }

      // Double-entry: DR AP, CR Purchase Returns
      await postDebitNoteJournal(tx, dnId, shopId, supplier_id, totalAmount, returnDateStr, req.user.id);

      return { id: dnId, debit_note_number: debitNoteNumber, amount: totalAmount };
    });

    await audit(req, 'Created debit note', 'debit_note', result.id, `${result.debit_note_number}, amount ${result.amount}`);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to create debit note.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// END ACCOUNTING ENGINE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

const isTransientDatabaseError = (error) => {
  const message = `${error?.message || ''} ${error?.cause?.message || ''}`;
  return /connection terminated|connection timeout|timeout|ECONNRESET|ETIMEDOUT/i.test(message)
    || ['08003', '08006', '57P01', '53300'].includes(String(error?.code || ''));
};

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  const requestedStatus = Number(error?.status || error?.statusCode || 0);
  const databaseUnavailable = isTransientDatabaseError(error);
  const status = requestedStatus >= 400 && requestedStatus < 600
    ? requestedStatus
    : databaseUnavailable
      ? 503
      : 500;
  const message = databaseUnavailable
    ? 'Database connection timed out. Please retry.'
    : error?.message || 'Unable to complete this request right now.';

  console.error(`[Server] ${req.method} ${req.originalUrl} failed:`, error);
  return res.status(status).json({ error: message });
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Multi-shop API is live on http://localhost:${PORT}`);
  });
}

export default app;
