-- Migration 048: Add advance_balance to customers and advance_applied to sales
ALTER TABLE customers ADD COLUMN IF NOT EXISTS advance_balance NUMERIC(12, 2) DEFAULT 0.00;
UPDATE customers SET advance_balance = 0.00 WHERE advance_balance IS NULL;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS advance_applied NUMERIC(12, 2) DEFAULT 0.00;
UPDATE sales SET advance_applied = 0.00 WHERE advance_applied IS NULL;
