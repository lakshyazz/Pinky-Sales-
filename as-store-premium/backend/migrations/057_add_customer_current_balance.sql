-- Migration 057: Add current_balance to customers table for atomic single-source-of-truth balance tracking
ALTER TABLE customers ADD COLUMN IF NOT EXISTS current_balance NUMERIC(12, 2) DEFAULT 0.00;

-- Backfill current_balance to reconcile with initial state
UPDATE customers 
SET current_balance = COALESCE(opening_balance, 0.00) - COALESCE(advance_balance, 0.00)
WHERE current_balance IS NULL OR current_balance = 0.00;
