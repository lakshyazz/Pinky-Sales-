-- Migration 039: Add original amount and discount columns to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12, 2) DEFAULT NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(6, 2) DEFAULT 0.00;
