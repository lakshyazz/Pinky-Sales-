-- 051_sync_customer_opening_balances.sql
-- Synchronize base customer opening balances with their historical invoice previous balances

UPDATE customers SET opening_balance = 748343.00 WHERE id = 31;
UPDATE customers SET opening_balance = 204660.00 WHERE id = 32;
UPDATE customers SET opening_balance = 201098.00 WHERE id = 21;
UPDATE customers SET opening_balance = 20500.00 WHERE id = 29;
UPDATE customers SET opening_balance = 78730.00 WHERE id = 30;

UPDATE sales SET previous_balance = 83110.00, net_payable_amount = 84140.00, closing_balance = 84140.00 WHERE id = 89;

