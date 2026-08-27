-- Migration 043: Enhance sale_items table with price_type and colour for robust ERP invoice items
CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  price_type VARCHAR(50) DEFAULT 'retail',
  colour VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sale_items' AND column_name = 'price_type'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN price_type VARCHAR(50) DEFAULT 'retail';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sale_items' AND column_name = 'colour'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN colour VARCHAR(100) DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_id_idx ON sale_items (product_id);
