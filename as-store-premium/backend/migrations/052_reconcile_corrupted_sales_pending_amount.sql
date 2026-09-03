-- 052_reconcile_corrupted_sales_pending_amount.sql
-- Fix sales where pending_amount was inflated by previous_balance during payment recording
-- Synchronize sales 99, 103 and customer 36 following the recorded payment

UPDATE sales 
SET paid_amount = 5850.00, pending_amount = 0.00, status = 'paid'
WHERE id = 99;

UPDATE sales 
SET paid_amount = 5350.00, pending_amount = 0.00, status = 'paid'
WHERE id = 103;

UPDATE customers 
SET opening_balance = 0.00 
WHERE id = 36;

UPDATE sales 
SET pending_amount = GREATEST(0, ROUND(total_amount::numeric - paid_amount::numeric, 2)),
    status = CASE WHEN GREATEST(0, ROUND(total_amount::numeric - paid_amount::numeric, 2)) <= 0 THEN 'paid' ELSE 'open' END
WHERE id IN (41, 42, 43, 91, 92, 99, 103);
