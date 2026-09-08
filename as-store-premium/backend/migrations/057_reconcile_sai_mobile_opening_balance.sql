-- Migration 057: Reconcile opening balance and payment allocations for SAI MOBILE - NIRAJ BHAI (Customer ID: 29)
BEGIN;

-- 1. Reset opening balance to 0.00
UPDATE customers SET opening_balance = 0.00 WHERE id = 29;

-- 2. Remove ledger opening balance entry
DELETE FROM ledger_entries WHERE customer_id = 29 AND entry_type = 'OPENING_BALANCE';

-- 3. Delete erroneous opening balance allocation
DELETE FROM payment_allocations WHERE customer_id = 29 AND payment_id IN (59, 60, 61);

-- 4. Re-insert correct FIFO allocations across actual invoices
INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
VALUES 
  (59, 29, 83, 'invoice', 25820.00, 'Allocated to Invoice #INV-000083', '2026-09-08 08:25:44.707'),
  (59, 29, 84, 'invoice', 7180.00, 'Allocated to Invoice #INV-000084', '2026-09-08 08:25:44.707'),
  (60, 29, 84, 'invoice', 17000.00, 'Allocated to Invoice #INV-000084', '2026-09-08 08:26:12.267'),
  (61, 29, 84, 'invoice', 10740.00, 'Allocated to Invoice #INV-000084', '2026-09-08 08:26:34.719'),
  (61, 29, 85, 'invoice', 260.00, 'Allocated to Invoice #INV-000085', '2026-09-08 08:26:34.719');

-- 5. Update invoice paid & pending balances
UPDATE sales SET paid_amount = 29000.00, pending_amount = 0.00 WHERE id = 82;
UPDATE sales SET paid_amount = 67320.00, pending_amount = 0.00 WHERE id = 83;
UPDATE sales SET paid_amount = 34920.00, pending_amount = 0.00 WHERE id = 84;
UPDATE sales SET paid_amount = 260.00, pending_amount = 26240.00 WHERE id = 85;

COMMIT;
