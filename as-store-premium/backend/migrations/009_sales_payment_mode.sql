ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'cash';
CREATE INDEX IF NOT EXISTS sales_payment_mode_idx ON sales (payment_mode);
