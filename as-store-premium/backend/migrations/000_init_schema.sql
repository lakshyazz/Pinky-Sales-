-- Baseline schema creation for fresh database initialization
CREATE TABLE IF NOT EXISTS shops (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  location_type TEXT DEFAULT 'shop',
  status TEXT DEFAULT 'active',
  low_stock_threshold INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  contact TEXT,
  shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL,
  permissions TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  full_model_list TEXT,
  brand TEXT,
  category TEXT,
  model TEXT,
  official_price NUMERIC(12, 2),
  purchase_price NUMERIC(12, 2),
  sale_price NUMERIC(12, 2),
  wholesale_price NUMERIC(12, 2),
  retail_price NUMERIC(12, 2),
  description TEXT,
  colours TEXT[] DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shop_id, product_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  mobile TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  pending_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payment_mode TEXT DEFAULT 'cash',
  due_date TEXT,
  notes TEXT,
  sale_date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
