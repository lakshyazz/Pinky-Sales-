-- 051_sync_customer_opening_balances.sql
-- Synchronize base customer opening balances with their historical invoice previous balances

UPDATE customers SET opening_balance = 748343.00 WHERE id = 31;
UPDATE customers SET opening_balance = 204660.00 WHERE id = 32;
UPDATE customers SET opening_balance = 201098.00 WHERE id = 21;
UPDATE customers SET opening_balance = 20500.00 WHERE id = 29;
