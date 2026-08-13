-- Migration 033: Create part_categories and product_variants tables, foreign keys, and migrate legacy category data

CREATE TABLE IF NOT EXISTS part_categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default part_categories
INSERT INTO part_categories (name) VALUES
  ('Display'),
  ('Battery'),
  ('Camera'),
  ('Speaker'),
  ('Charging IC'),
  ('Main Flex'),
  ('Frame'),
  ('Charging Port'),
  ('Vibrator'),
  ('Ear Speaker'),
  ('Back Glass'),
  ('Middle Frame'),
  ('Sim Tray'),
  ('Housing'),
  ('Mic')
ON CONFLICT (name) DO NOTHING;

-- Seed default product_variants
INSERT INTO product_variants (name) VALUES
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

-- Add columns to products table if missing
ALTER TABLE products ADD COLUMN IF NOT EXISTS part_category_id INTEGER REFERENCES part_categories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS part_category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quality_variant TEXT;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_products_part_category_id ON products(part_category_id);
CREATE INDEX IF NOT EXISTS idx_products_product_variant_id ON products(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_products_part_category ON products(LOWER(part_category));
CREATE INDEX IF NOT EXISTS idx_products_quality_variant ON products(LOWER(quality_variant));

-- Data migration: backfill part_category and quality_variant for legacy products
UPDATE products
SET part_category = COALESCE(part_category, category, 'Display'),
    quality_variant = COALESCE(quality_variant, 'OLED')
WHERE part_category IS NULL OR quality_variant IS NULL;
