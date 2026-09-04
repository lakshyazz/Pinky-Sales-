-- Migration 053: Party Ledger, Payment Allocation, and Balance Tracking Engine
-- Ensures robust FIFO allocation, race-safe sequence voucher numbers, idempotency,
-- reversal audit trail, and opening balance tracking.

-- 1. Voucher Number Sequence for Payments
CREATE SEQUENCE IF NOT EXISTS payment_number_seq START 1;

-- 2. Enhance payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_number VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS unallocated_amount NUMERIC(14,2) DEFAULT 0.00;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Allow payments decoupled from a specific sale
ALTER TABLE payments ALTER COLUMN sale_id DROP NOT NULL;

-- Unique constraint on payment idempotency_key (where not null)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_idempotency_key_key'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT payments_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

-- Indexes on payments
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_number ON payments(payment_number);
CREATE INDEX IF NOT EXISTS idx_payments_reversed_at ON payments(reversed_at);

-- 3. Enhance payment_allocations table
ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS allocation_type VARCHAR(30) NOT NULL DEFAULT 'invoice';
ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS notes TEXT;

-- Allow allocations not linked to a sale (e.g. opening_balance or advance)
ALTER TABLE payment_allocations ALTER COLUMN sale_id DROP NOT NULL;

-- Indexes on payment_allocations
CREATE INDEX IF NOT EXISTS idx_pa_customer_alloc ON payment_allocations(customer_id, allocation_type, reversed_at);
CREATE INDEX IF NOT EXISTS idx_pa_payment_sale ON payment_allocations(payment_id, sale_id, allocation_type);

-- 4. Enhance customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance_date DATE DEFAULT CURRENT_DATE;

-- 5. Enhance sales table for idempotency
ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_idempotency_key_key'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

-- 6. Backfill Data
-- Backfill payment_number for existing rows
UPDATE payments
SET payment_number = 'PAY-' || LPAD(id::text, 6, '0')
WHERE payment_number IS NULL;

-- Backfill customer_id on payments from linked sales
UPDATE payments p
SET customer_id = s.customer_id
FROM sales s
WHERE p.sale_id = s.id AND p.customer_id IS NULL;

-- Backfill customer_id on payment_allocations from payments
UPDATE payment_allocations pa
SET customer_id = p.customer_id
FROM payments p
WHERE pa.payment_id = p.id AND pa.customer_id IS NULL;

-- Backfill opening_balance_date for existing customers
UPDATE customers
SET opening_balance_date = COALESCE(created_at::date, CURRENT_DATE)
WHERE opening_balance_date IS NULL;

-- Synchronize sequence with highest existing payment id if needed
SELECT setval('payment_number_seq', COALESCE((SELECT MAX(id) FROM payments), 0) + 1, false);

-- 7. Strict Post-Backfill Validation Guard (Blocking Check)
DO $$
DECLARE
  orphaned_payments INTEGER;
  orphaned_allocations INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphaned_payments FROM payments WHERE customer_id IS NULL;
  IF orphaned_payments > 0 THEN
    RAISE EXCEPTION 'MIGRATION HALTED: Found % payments with NULL customer_id requiring manual reconciliation.', orphaned_payments;
  END IF;

  SELECT COUNT(*) INTO orphaned_allocations FROM payment_allocations WHERE customer_id IS NULL;
  IF orphaned_allocations > 0 THEN
    RAISE EXCEPTION 'MIGRATION HALTED: Found % payment_allocations with NULL customer_id requiring manual reconciliation.', orphaned_allocations;
  END IF;
END $$;
