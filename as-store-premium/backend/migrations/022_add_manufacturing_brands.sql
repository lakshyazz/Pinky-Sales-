-- Create manufacturing_brands table
CREATE TABLE IF NOT EXISTS manufacturing_brands (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS manufacturing_brands_name_case_insensitive_uidx
  ON manufacturing_brands (LOWER(TRIM(name)));

-- Add foreign key columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturing_brand_id INTEGER REFERENCES manufacturing_brands(id) ON DELETE SET NULL;

-- Add manufacturing_brand_id to transaction tables for historical snapshots
ALTER TABLE sales ADD COLUMN IF NOT EXISTS manufacturing_brand_id INTEGER REFERENCES manufacturing_brands(id) ON DELETE SET NULL;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS manufacturing_brand_id INTEGER REFERENCES manufacturing_brands(id) ON DELETE SET NULL;

-- Seed initial manufacturing brands
INSERT INTO manufacturing_brands (name) VALUES
  ('Unknown'),
  ('AS CARE'),
  ('Kaiku'),
  ('AS PRO'),
  ('AS Originals'),
  ('GX')
ON CONFLICT (LOWER(TRIM(name))) DO NOTHING;

-- Dynamically insert missing brands into the brands reference table
INSERT INTO brands (name)
SELECT DISTINCT brand 
FROM products 
WHERE brand IS NOT NULL AND TRIM(brand) <> ''
ON CONFLICT (LOWER(TRIM(name))) DO NOTHING;

-- Populate company_brand_id in products table
UPDATE products p 
SET company_brand_id = b.id 
FROM brands b 
WHERE LOWER(TRIM(p.brand)) = LOWER(TRIM(b.name));

-- Populate manufacturing_brand_id in products table with 'Unknown' for legacy products
UPDATE products 
SET manufacturing_brand_id = (SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'unknown' LIMIT 1)
WHERE manufacturing_brand_id IS NULL;

-- Populate manufacturing_brand_id in sales and inventory_batches tables
UPDATE sales s 
SET manufacturing_brand_id = p.manufacturing_brand_id 
FROM products p 
WHERE s.product_id = p.id;

UPDATE inventory_batches ib 
SET manufacturing_brand_id = p.manufacturing_brand_id 
FROM products p 
WHERE ib.product_id = p.id;

-- Cleanup active products with empty/null models to ensure they have unique models
UPDATE products SET model = 'iPhone 13' WHERE id = 2020 AND (model IS NULL OR TRIM(model) = '');
UPDATE products SET model = 'iPhone 15 Pro Max' WHERE id = 2032 AND (model IS NULL OR TRIM(model) = '');
UPDATE products SET model = 'Galaxy S24 Ultra' WHERE id = 2033 AND (model IS NULL OR TRIM(model) = '');
UPDATE products SET model = 'OnePlus 12' WHERE id = 2034 AND (model IS NULL OR TRIM(model) = '');
UPDATE products SET model = '120W GaN Adapter' WHERE id = 2035 AND (model IS NULL OR TRIM(model) = '');
UPDATE products SET model = '12 Pro+' WHERE id = 2036 AND (model IS NULL OR TRIM(model) = '');

-- Enforce UNIQUE constraint on active products
CREATE UNIQUE INDEX IF NOT EXISTS products_brand_model_mfg_uidx 
  ON products (company_brand_id, LOWER(TRIM(COALESCE(model, ''))), manufacturing_brand_id) 
  WHERE is_active = 1;
