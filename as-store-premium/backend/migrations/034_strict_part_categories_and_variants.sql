-- Migration 034: Strict part_categories, product_variants, optional variant NULL support, and unique constraint

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
  ('Mic'),
  ('Charging Port'),
  ('Charging IC'),
  ('Back Glass'),
  ('Middle Frame'),
  ('Display Frame'),
  ('Main Flex'),
  ('Power Flex'),
  ('Volume Flex'),
  ('Ear Speaker'),
  ('Sim Tray'),
  ('Housing'),
  ('Vibrator')
ON CONFLICT (name) DO NOTHING;

-- Seed default product_variants
INSERT INTO product_variants (name) VALUES
  ('OLED'),
  ('Soft OLED'),
  ('Hard OLED'),
  ('Incell'),
  ('TFT'),
  ('IPS'),
  ('AMOLED'),
  ('With Frame'),
  ('Without Frame'),
  ('Fresh New'),
  ('Set Remove'),
  ('Original'),
  ('Refurbished'),
  ('Copy'),
  ('Premium Copy'),
  ('Service Pack')
ON CONFLICT (name) DO NOTHING;

-- Add columns to products table if missing
ALTER TABLE products ADD COLUMN IF NOT EXISTS part_category_id INTEGER REFERENCES part_categories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS part_category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quality_variant TEXT;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_products_part_category_id ON products(part_category_id);
CREATE INDEX IF NOT EXISTS idx_products_product_variant_id ON products(product_variant_id);

-- Create unique index to prevent duplicate products
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_strict_unique_combination 
ON products (
  company_brand_id, 
  LOWER(TRIM(model)), 
  part_category_id, 
  COALESCE(product_variant_id, -1)
) 
WHERE is_active = 1;
