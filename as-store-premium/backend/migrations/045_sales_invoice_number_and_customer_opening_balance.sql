-- Migration 045: Sales Invoice Number Single Source of Truth and Customer Opening Balance

-- 1. Add invoice_number column to sales table if not exists
ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50);

-- Backfill legacy records with continuous sequential INV-XXXXXX format
UPDATE sales 
SET invoice_number = 'INV-' || LPAD(id::TEXT, 6, '0') 
WHERE invoice_number IS NULL OR invoice_number = '';

-- Create index on invoice_number for fast lookups
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);

-- 2. Add opening_balance column to customers table if not exists
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12, 2) DEFAULT 0.00;
