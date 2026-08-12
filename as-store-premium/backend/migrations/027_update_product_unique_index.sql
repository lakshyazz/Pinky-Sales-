-- Drop the old overly-restrictive unique index on products
DROP INDEX IF EXISTS products_brand_model_mfg_uidx;

-- Create a new, refined unique index that includes category
CREATE UNIQUE INDEX IF NOT EXISTS products_brand_model_mfg_category_uidx 
  ON products (
    company_brand_id, 
    LOWER(TRIM(COALESCE(model, ''))), 
    manufacturing_brand_id, 
    LOWER(TRIM(COALESCE(category, '')))
  ) 
  WHERE is_active = 1;
