-- Migration 031: Add separate product_types and quality_variants tables and product columns

CREATE TABLE IF NOT EXISTS product_types (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quality_variants (
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
  ('Charging IC'),
  ('Back Glass'),
  ('Frame'),
  ('Charging Port'),
  ('Vibrator'),
  ('Ear Speaker'),
  ('Main Flex'),
  ('Side Flex'),
  ('Housing'),
  ('Sim Tray')
ON CONFLICT (name) DO NOTHING;

-- Seed default quality_variants
INSERT INTO quality_variants (name) VALUES
  ('With Frame'),
  ('Without Frame'),
  ('Set Remove'),
  ('Fresh New'),
  ('Incell'),
  ('OLED'),
  ('Soft OLED'),
  ('Hard OLED'),
  ('Original'),
  ('Refurbished'),
  ('Copy'),
  ('Premium Copy')
ON CONFLICT (name) DO NOTHING;

-- Add foreign key columns to products table if missing
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type_id INTEGER REFERENCES product_types(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quality_variant_id INTEGER REFERENCES quality_variants(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quality_variant TEXT;
