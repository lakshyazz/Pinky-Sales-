ALTER TABLE sales ADD COLUMN IF NOT EXISTS price_type TEXT NOT NULL DEFAULT 'retail';
CREATE INDEX IF NOT EXISTS sales_price_type_idx ON sales (price_type);
