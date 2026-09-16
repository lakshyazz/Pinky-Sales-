-- Migration 058: Credit Notes Party Ledger Integrity & Performance Indexes
-- Ensures credit notes are fully indexed for Customer Party Ledger queries
-- and backfills customer_id/shop_id for any sales return payment records.

-- 1. Ensure performance indexes on credit_notes for Party Ledger queries
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer_return_date 
    ON credit_notes (customer_id, return_date ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_credit_notes_shop_customer 
    ON credit_notes (shop_id, customer_id);

-- 2. Backfill customer_id and shop_id on payments with payment_mode = 'credit_note' from parent sales
UPDATE payments p
SET customer_id = s.customer_id,
    shop_id = s.shop_id
FROM sales s
WHERE s.id = p.sale_id
  AND p.payment_mode = 'credit_note'
  AND (p.customer_id IS NULL OR p.shop_id IS NULL);
