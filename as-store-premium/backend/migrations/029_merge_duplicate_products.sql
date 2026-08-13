-- Transaction-safe migration to detect and merge duplicate products

-- 1. Create a temp table to hold duplicate products mapping
CREATE TEMP TABLE duplicate_products_map AS
WITH duplicate_groups AS (
  SELECT 
    LOWER(TRIM(short_name)) AS sname,
    company_brand_id,
    COALESCE(manufacturing_brand_id, 0) AS mfg_id,
    MIN(id) AS keep_id
  FROM products
  WHERE is_active = 1 AND short_name IS NOT NULL AND TRIM(short_name) != ''
  GROUP BY LOWER(TRIM(short_name)), company_brand_id, COALESCE(manufacturing_brand_id, 0)
  HAVING COUNT(*) > 1
)
SELECT p.id AS duplicate_id, g.keep_id
FROM products p
JOIN duplicate_groups g ON LOWER(TRIM(p.short_name)) = g.sname 
  AND p.company_brand_id = g.company_brand_id
  AND COALESCE(p.manufacturing_brand_id, 0) = g.mfg_id
WHERE p.id != g.keep_id;

-- 2. Update inventory batches
UPDATE inventory_batches ib
SET product_id = m.keep_id
FROM duplicate_products_map m
WHERE ib.product_id = m.duplicate_id;

-- 3. Update stock levels: sum quantities and merge
-- Merge existing shop rows for survivors
UPDATE stock s
SET quantity = s.quantity + dup_s.quantity,
    updated_at = CURRENT_TIMESTAMP
FROM duplicate_products_map m
JOIN stock dup_s ON dup_s.product_id = m.duplicate_id
WHERE s.product_id = m.keep_id AND s.shop_id = dup_s.shop_id;

-- Update remaining rows where survivor doesn't have a row yet
UPDATE stock s
SET product_id = m.keep_id,
    updated_at = CURRENT_TIMESTAMP
FROM duplicate_products_map m
WHERE s.product_id = m.duplicate_id 
  AND NOT EXISTS (
    SELECT 1 FROM stock s2 
    WHERE s2.product_id = m.keep_id AND s2.shop_id = s.shop_id
  );

-- Delete now redundant duplicate stock rows
DELETE FROM stock
WHERE product_id IN (SELECT duplicate_id FROM duplicate_products_map);

-- 4. Update sales table if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'product_id') THEN
    EXECUTE 'UPDATE sales s SET product_id = m.keep_id FROM duplicate_products_map m WHERE s.product_id = m.duplicate_id';
  END IF;
END $$;

-- 5. Update sale items
UPDATE sale_items si
SET product_id = m.keep_id
FROM duplicate_products_map m
WHERE si.product_id = m.duplicate_id;

-- 6. Update stock requests
UPDATE stock_requests sr
SET product_id = m.keep_id
FROM duplicate_products_map m
WHERE sr.product_id = m.duplicate_id;

-- 7. Update stock transfers
UPDATE stock_transfers st
SET product_id = m.keep_id
FROM duplicate_products_map m
WHERE st.product_id = m.duplicate_id;

-- 8. Delete duplicate products from products catalog
DELETE FROM products
WHERE id IN (SELECT duplicate_id FROM duplicate_products_map);

-- 9. Clean up temp table
DROP TABLE duplicate_products_map;
