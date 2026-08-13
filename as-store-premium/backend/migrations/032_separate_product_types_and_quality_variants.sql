-- Migration 032: Ensure separate product_types and product_quality_variants tables and columns

CREATE TABLE IF NOT EXISTS product_types (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_quality_variants (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default product_types
INSERT INTO product_types (name) VALUES
  ('Display'),
  ('Battery'),
  ('Camera'),
  ('Speaker'),
  ('Ear Speaker'),
  ('Charging Port'),
  ('Charging IC'),
  ('Main Flex'),
  ('Side Flex'),
  ('Back Glass'),
  ('Middle Frame'),
  ('Sim Tray'),
  ('Vibrator'),
  ('Mic'),
  ('Housing')
ON CONFLICT (name) DO NOTHING;

-- Seed default product_quality_variants
INSERT INTO product_quality_variants (name) VALUES
  ('OLED'),
  ('Soft OLED'),
  ('Hard OLED'),
  ('Incell'),
  ('With Frame'),
  ('Without Frame'),
  ('Fresh New'),
  ('Set Remove'),
  ('Original'),
  ('Refurbished'),
  ('Copy'),
  ('Premium Copy')
ON CONFLICT (name) DO NOTHING;

-- Also keep quality_variants table synced for backwards compatibility
CREATE TABLE IF NOT EXISTS quality_variants (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO quality_variants (name) VALUES
  ('OLED'),
  ('Soft OLED'),
  ('Hard OLED'),
  ('Incell'),
  ('With Frame'),
  ('Without Frame'),
  ('Fresh New'),
  ('Set Remove'),
  ('Original'),
  ('Refurbished'),
  ('Copy'),
  ('Premium Copy')
ON CONFLICT (name) DO NOTHING;

-- Ensure products table columns exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type_id INTEGER REFERENCES product_types(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quality_variant_id INTEGER REFERENCES product_quality_variants(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quality_variant TEXT;

-- Create indexes for performance on product_type and quality_variant
CREATE INDEX IF NOT EXISTS idx_products_product_type_id ON products(product_type_id);
CREATE INDEX IF NOT EXISTS idx_products_quality_variant_id ON products(quality_variant_id);
CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(LOWER(product_type));
CREATE INDEX IF NOT EXISTS idx_products_quality_variant ON products(LOWER(quality_variant));
