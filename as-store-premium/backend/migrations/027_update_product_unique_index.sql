-- Drop the old overly-restrictive unique indexes on products
DROP INDEX IF EXISTS products_brand_model_mfg_uidx;
DROP INDEX IF EXISTS products_brand_model_mfg_category_uidx;

-- Create a new, refined unique index that includes category and only applies when model is NOT blank
CREATE UNIQUE INDEX IF NOT EXISTS products_brand_model_mfg_category_uidx 
  ON products (
    company_brand_id, 
    LOWER(TRIM(model)), 
    manufacturing_brand_id, 
    LOWER(TRIM(COALESCE(category, '')))
  ) 
  WHERE is_active = 1 AND model IS NOT NULL AND TRIM(model) != '';
