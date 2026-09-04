-- Migration 054: Restore actual opening balances and backfill opening balance payment vouchers
BEGIN;

-- 1. Customer 26: JJ MOBILE
-- Actual initial opening balance: 17,62,570.00
-- Repayments deducted: 47,700.00 (Bank, 2026-09-02) and 7,00,000.00 (Cash, 2026-09-02)
UPDATE customers SET opening_balance = 1762570.00 WHERE id = 26;

DO $$
DECLARE
  p1_num TEXT;
  p2_num TEXT;
  p1_id INT;
  p2_id INT;
BEGIN
  -- Check if already backfilled to prevent duplicate runs
  IF NOT EXISTS (SELECT 1 FROM payment_allocations WHERE customer_id = 26 AND allocation_type = 'opening_balance') THEN
    p1_num := 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0');
    INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, notes, unallocated_amount, shop_id, created_at)
    VALUES (p1_num, 26, 47700.00, '2026-09-02', 'bank', 'Repayment applied towards Opening Balance', 0.00, 2, '2026-09-03 17:01:49')
    RETURNING id INTO p1_id;

    INSERT INTO payment_allocations (payment_id, customer_id, allocation_type, amount_applied, notes, created_at)
    VALUES (p1_id, 26, 'opening_balance', 47700.00, 'Settlement towards Opening Balance', '2026-09-03 17:01:49');

    p2_num := 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0');
    INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, notes, unallocated_amount, shop_id, created_at)
    VALUES (p2_num, 26, 700000.00, '2026-09-02', 'cash', 'Repayment applied towards Opening Balance', 0.00, 2, '2026-09-03 21:02:54')
    RETURNING id INTO p2_id;

    INSERT INTO payment_allocations (payment_id, customer_id, allocation_type, amount_applied, notes, created_at)
    VALUES (p2_id, 26, 'opening_balance', 700000.00, 'Settlement towards Opening Balance', '2026-09-03 21:02:54');
  END IF;
END $$;

-- 2. Customer 31: K UNIC HIRABHAI
-- Actual initial opening balance: 7,48,343.00
-- Repayment deducted: 1,98,900.00 (Cash, 2026-09-03)
UPDATE customers SET opening_balance = 748343.00 WHERE id = 31;

DO $$
DECLARE
  p_num TEXT;
  p_id INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_allocations WHERE customer_id = 31 AND allocation_type = 'opening_balance') THEN
    p_num := 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0');
    INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, notes, unallocated_amount, shop_id, created_at)
    VALUES (p_num, 31, 198900.00, '2026-09-03', 'cash', 'Repayment applied towards Opening Balance', 0.00, 2, '2026-09-03 17:14:50')
    RETURNING id INTO p_id;

    INSERT INTO payment_allocations (payment_id, customer_id, allocation_type, amount_applied, notes, created_at)
    VALUES (p_id, 31, 'opening_balance', 198900.00, 'Settlement towards Opening Balance', '2026-09-03 17:14:50');
  END IF;
END $$;

-- 3. Customer 36: OM SATGURU MOBILE
-- Actual initial opening balance: 3,00,300.00
-- Repayment deducted: 3,00,300.00 (Cash, 2026-09-03)
UPDATE customers SET opening_balance = 300300.00 WHERE id = 36;

DO $$
DECLARE
  p_num TEXT;
  p_id INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_allocations WHERE customer_id = 36 AND allocation_type = 'opening_balance') THEN
    p_num := 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0');
    INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, notes, unallocated_amount, shop_id, created_at)
    VALUES (p_num, 36, 300300.00, '2026-09-03', 'cash', 'Repayment applied towards Opening Balance', 0.00, 2, '2026-09-03 17:17:40')
    RETURNING id INTO p_id;

    INSERT INTO payment_allocations (payment_id, customer_id, allocation_type, amount_applied, notes, created_at)
    VALUES (p_id, 36, 'opening_balance', 300300.00, 'Settlement towards Opening Balance', '2026-09-03 17:17:40');
  END IF;
END $$;

-- 4. Customer 21: JAYSANKAR MOBILE VIKASHBHAI
-- Actual initial opening balance: 2,01,098.00
-- Repayment deducted: 39,500.00 (2026-08-31)
UPDATE customers SET opening_balance = 201098.00 WHERE id = 21;

DO $$
DECLARE
  p_num TEXT;
  p_id INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_allocations WHERE customer_id = 21 AND allocation_type = 'opening_balance') THEN
    p_num := 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0');
    INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, notes, unallocated_amount, shop_id, created_at)
    VALUES (p_num, 21, 39500.00, '2026-08-31', 'cash', 'Repayment applied towards Opening Balance', 0.00, 2, '2026-08-31 16:00:00')
    RETURNING id INTO p_id;

    INSERT INTO payment_allocations (payment_id, customer_id, allocation_type, amount_applied, notes, created_at)
    VALUES (p_id, 21, 'opening_balance', 39500.00, 'Settlement towards Opening Balance', '2026-08-31 16:00:00');
  END IF;
END $$;

-- 5. Blocking assertion verifying net dynamic outstanding balance matches previous balance exactly
DO $$
DECLARE
  cust26_bal NUMERIC;
BEGIN
  SELECT (
    GREATEST(0, (COALESCE(c.opening_balance, 0) - COALESCE(
      (SELECT SUM(pa.amount_applied) FROM payment_allocations pa 
       WHERE pa.customer_id = c.id AND pa.allocation_type = 'opening_balance' AND pa.reversed_at IS NULL), 0
    )))
    + COALESCE((SELECT SUM(s.total_amount - s.paid_amount) FROM sales s WHERE s.customer_id = c.id), 0)
    - COALESCE(c.advance_balance, 0)
  ) INTO cust26_bal
  FROM customers c WHERE c.id = 26;

  IF cust26_bal != 1014870.00 THEN
    RAISE EXCEPTION 'Assertion failed: Customer 26 dynamic balance is % expected 1014870.00', cust26_bal;
  END IF;
END $$;

COMMIT;
