-- Create stock_requests and stock_transfers tables
CREATE TABLE IF NOT EXISTS stock_requests (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  model_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  message TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id SERIAL PRIMARY KEY,
  from_shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  to_shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  transfer_date TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Re-enable RLS on the new tables
ALTER TABLE stock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

-- Re-create indexes for the new tables
CREATE INDEX IF NOT EXISTS stock_requests_shop_id_status_idx ON stock_requests (shop_id, status);
