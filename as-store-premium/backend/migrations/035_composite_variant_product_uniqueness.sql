-- Migration 035: Remove restrictive single-name / single-model unique indexes and replace with full composite variant uniqueness

DROP INDEX IF EXISTS products_short_name_brand_mfg_uidx;
DROP INDEX IF EXISTS products_brand_model_mfg_category_uidx;
DROP INDEX IF EXISTS idx_products_strict_unique_combination;

-- Create full composite unique index on active products across company_brand, model, part_category, product_variant, manufacturing_brand, and supplier
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_full_composite_unique 
ON products (
  company_brand_id, 
  LOWER(TRIM(model)), 
  part_category_id, 
  COALESCE(product_variant_id, -1),
  COALESCE(manufacturing_brand_id, -1),
  COALESCE(supplier_id, -1)
) 
WHERE is_active = 1;
