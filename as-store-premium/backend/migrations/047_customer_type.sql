-- Migration 047: Add customer_type column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) DEFAULT 'retailer';
UPDATE customers SET customer_type = 'retailer' WHERE customer_type IS NULL;
