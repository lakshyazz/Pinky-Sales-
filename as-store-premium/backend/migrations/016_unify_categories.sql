-- 016_unify_categories.sql

-- Drop the foreign key on other_products that points to other_product_categories
ALTER TABLE other_products DROP CONSTRAINT IF EXISTS other_products_product_category_id_fkey;

-- Change the foreign key to point to the main categories table
ALTER TABLE other_products ADD CONSTRAINT other_products_product_category_id_fkey 
FOREIGN KEY (product_category_id) REFERENCES categories(id) ON DELETE SET NULL;

-- Drop the now unused other_product_categories table
DROP TABLE IF EXISTS other_product_categories CASCADE;
