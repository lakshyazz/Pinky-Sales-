-- Migration 046: Add GSTIN to Customers and Seed Default Cash Customer per Shop

-- 1. Add GSTIN column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gstin VARCHAR(30);

-- 2. Ensure payment_mode exists on payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'cash';

-- 3. Seed default Cash Customer for all active shops if not already present
INSERT INTO customers (shop_id, name, mobile, address, notes, opening_balance)
SELECT s.id, 'Cash Customer', '9999999999', 'Walk-in / Cash', 'Default Cash Customer for instant walk-in sales', 0.00
FROM shops s
WHERE NOT EXISTS (
  SELECT 1 FROM customers c 
  WHERE c.shop_id = s.id AND (c.name ILIKE 'Cash Customer' OR c.mobile = '9999999999')
);
