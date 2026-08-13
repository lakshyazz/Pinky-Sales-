-- Migration to prevent future duplicate products by enforcing uniqueness on short_name, brand, and manufacturing brand

-- Drop the index if it already exists
DROP INDEX IF EXISTS products_short_name_brand_mfg_uidx;

-- Create a unique index on LOWER(TRIM(short_name)), company_brand_id, and COALESCE(manufacturing_brand_id, 0)
CREATE UNIQUE INDEX IF NOT EXISTS products_short_name_brand_mfg_uidx 
  ON products (
    LOWER(TRIM(short_name)), 
    company_brand_id, 
    COALESCE(manufacturing_brand_id, 0)
  ) 
  WHERE is_active = 1 AND short_name IS NOT NULL AND TRIM(short_name) != '';
