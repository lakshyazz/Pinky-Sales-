-- 050_reconcile_customer_opening_balance.sql
-- Fix inflated customer opening balance caused by legacy sale creation previous_balance escalation

UPDATE customers 
SET opening_balance = 236450.00 
WHERE id = 11 AND opening_balance = 472900.00;
