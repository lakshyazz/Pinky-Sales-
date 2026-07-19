-- Table for tracking bulk inventory import sessions & supplier file audits
CREATE TABLE IF NOT EXISTS import_logs (
  id SERIAL PRIMARY KEY,
  file_name TEXT NOT NULL,
  imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  created_products INTEGER NOT NULL DEFAULT 0,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  total_valuation NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  destination_shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL,
  import_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_logs_timestamp ON import_logs(import_timestamp DESC);
