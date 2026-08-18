-- Migration 038: Branch-Specific Product & Catalog Isolation

-- 1. Add branch_id, shop_id, and scope columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES shops(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'GLOBAL';

-- 2. Backfill existing branch-specific products based on branch supplier ownership
UPDATE products p
SET 
  shop_id = s.shop_id,
  branch_id = s.branch_id,
  scope = 'BRANCH'
FROM suppliers s
WHERE p.supplier_id = s.id 
  AND s.shop_id IS NOT NULL 
  AND (p.shop_id IS NULL OR p.shop_id != s.shop_id);

-- 3. Replace unique composite index to include shop_id tenancy
DROP INDEX IF EXISTS idx_products_full_composite_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_full_composite_unique 
ON products (
  COALESCE(shop_id, 0),
  company_brand_id, 
  LOWER(TRIM(model)), 
  part_category_id, 
  COALESCE(product_variant_id, -1),
  COALESCE(manufacturing_brand_id, -1),
  COALESCE(supplier_id, -1)
) 
WHERE is_active = 1;

-- 4. Create index for fast scope filtering
CREATE INDEX IF NOT EXISTS idx_products_shop_scope 
ON products (COALESCE(shop_id, 0), is_active);
