-- Migration: 037_branch_scoped_suppliers.sql
-- Description: Multi-Branch Supplier Scoping & Data Isolation

-- 1. Add shop_id / branch_id and created_by to suppliers table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Keep shop_id and branch_id in sync if both exist
UPDATE suppliers SET branch_id = shop_id WHERE branch_id IS NULL AND shop_id IS NOT NULL;
UPDATE suppliers SET shop_id = branch_id WHERE shop_id IS NULL AND branch_id IS NOT NULL;

-- 2. Drop global unique constraint on supplier name
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_name_key;

-- 3. Compound unique index: allows different shops/branches to have suppliers with identical names
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_shop_name_unique_idx 
ON suppliers (COALESCE(shop_id, 0), LOWER(TRIM(name)));

-- Performance index for shop_id queries
CREATE INDEX IF NOT EXISTS suppliers_shop_id_idx ON suppliers (shop_id);
CREATE INDEX IF NOT EXISTS suppliers_branch_id_idx ON suppliers (branch_id);

-- 4. Enable Row Level Security on suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
