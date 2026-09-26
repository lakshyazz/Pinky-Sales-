-- Migration 061: Comprehensive Reconciliation of Customer Opening Balances, Payments, Ledger Entries, and Net Balances
BEGIN;

-- 1. Reconcile Customer 21: JAYSANKAR MOBILE VIKASHBHAI
-- Actual initial opening balance: 201,098.00
-- Repayment: 39,500.00 (Cash, 2026-08-31)
-- Purchases / Invoices: 53,850.00
-- Expected Net Total Outstanding: 201,098 - 39,500 + 53,850 = 215,448.00
UPDATE customers 
SET opening_balance = 201098.00,
    opening_balance_date = COALESCE(opening_balance_date, '2026-08-01'::DATE)
WHERE id = 21;

DO $$
DECLARE
  p_num TEXT;
  p_id INT;
BEGIN
  -- Ensure opening balance repayment payment exists
  SELECT id INTO p_id 
  FROM payments 
  WHERE customer_id = 21 AND amount = 39500.00 AND reversed_at IS NULL 
  LIMIT 1;

  IF p_id IS NULL THEN
    p_num := 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0');
    INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, notes, unallocated_amount, shop_id, created_at)
    VALUES (p_num, 21, 39500.00, '2026-08-31', 'cash', 'Repayment applied towards Opening Balance', 0.00, 2, '2026-08-31 16:00:00')
    RETURNING id INTO p_id;
  END IF;

  -- Ensure payment allocation towards opening_balance exists
  IF NOT EXISTS (
    SELECT 1 FROM payment_allocations 
    WHERE customer_id = 21 AND allocation_type = 'opening_balance' AND reversed_at IS NULL
  ) THEN
    INSERT INTO payment_allocations (payment_id, customer_id, allocation_type, amount_applied, notes, created_at)
    VALUES (p_id, 21, 'opening_balance', 39500.00, 'Settlement towards Opening Balance', '2026-08-31 16:00:00');
  END IF;
END $$;

-- Remove erroneous duplicate 19,250 payments (PAY-000017 UPI and PAY-000023 Cash)
DELETE FROM payment_allocations WHERE payment_id IN (
  SELECT id FROM payments WHERE customer_id = 21 AND (payment_number IN ('PAY-000017', 'PAY-000023') OR amount = 19250.00)
);
DELETE FROM payments WHERE customer_id = 21 AND (payment_number IN ('PAY-000017', 'PAY-000023') OR amount = 19250.00);

-- Update or insert OPENING_BALANCE in ledger_entries for Customer 21
DELETE FROM ledger_entries WHERE customer_id = 21 AND entry_type = 'OPENING_BALANCE';
INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
VALUES (
  (SELECT COALESCE(shop_id, 2) FROM customers WHERE id = 21),
  21,
  'OPENING_BALANCE',
  'OB-000021',
  '2026-08-01'::DATE,
  201098.00,
  0.00,
  'Opening Balance for JAYSANKAR MOBILE VIKASHBHAI',
  '2026-08-01 00:00:00'
);

-- 2. Reconcile Customer 26: JJ MOBILE
-- Actual initial opening balance: 1,762,570.00
-- Repayments: 47,700.00 (Bank, 2026-09-02) and 700,000.00 (Cash, 2026-09-02)
UPDATE customers 
SET opening_balance = 1762570.00,
    opening_balance_date = COALESCE(opening_balance_date, '2026-08-01'::DATE)
WHERE id = 26;

DO $$
DECLARE
  p1_num TEXT;
  p2_num TEXT;
  p1_id INT;
  p2_id INT;
BEGIN
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

DELETE FROM ledger_entries WHERE customer_id = 26 AND entry_type = 'OPENING_BALANCE';
INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
VALUES (
  (SELECT COALESCE(shop_id, 2) FROM customers WHERE id = 26),
  26,
  'OPENING_BALANCE',
  'OB-000026',
  '2026-08-01'::DATE,
  1762570.00,
  0.00,
  'Opening Balance for JJ MOBILE',
  '2026-08-01 00:00:00'
);

-- 3. Reconcile Customer 31: K UNIC HIRABHAI
-- Actual initial opening balance: 748,343.00
-- Repayment: 198,900.00 (Cash, 2026-09-03)
UPDATE customers 
SET opening_balance = 748343.00,
    opening_balance_date = COALESCE(opening_balance_date, '2026-08-01'::DATE)
WHERE id = 31;

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

DELETE FROM ledger_entries WHERE customer_id = 31 AND entry_type = 'OPENING_BALANCE';
INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
VALUES (
  (SELECT COALESCE(shop_id, 2) FROM customers WHERE id = 31),
  31,
  'OPENING_BALANCE',
  'OB-000031',
  '2026-08-01'::DATE,
  748343.00,
  0.00,
  'Opening Balance for K UNIC HIRABHAI',
  '2026-08-01 00:00:00'
);

-- 4. Reconcile Customer 36: OM SATGURU MOBILE
-- Actual initial opening balance: 300,300.00
-- Repayment: 300,300.00 (Cash, 2026-09-03)
UPDATE customers 
SET opening_balance = 300300.00,
    opening_balance_date = COALESCE(opening_balance_date, '2026-08-01'::DATE)
WHERE id = 36;

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

DELETE FROM ledger_entries WHERE customer_id = 36 AND entry_type = 'OPENING_BALANCE';
INSERT INTO ledger_entries (shop_id, customer_id, entry_type, ref_no, entry_date, debit, credit, description, created_at)
VALUES (
  (SELECT COALESCE(shop_id, 2) FROM customers WHERE id = 36),
  36,
  'OPENING_BALANCE',
  'OB-000036',
  '2026-08-01'::DATE,
  300300.00,
  0.00,
  'Opening Balance for OM SATGURU MOBILE',
  '2026-08-01 00:00:00'
);

-- 5. Reconcile Customer 48: JALARAM MOBILE
UPDATE customers 
SET opening_balance = 34935.00,
    opening_balance_date = COALESCE(opening_balance_date, '2026-09-05'::DATE)
WHERE id = 48 AND (opening_balance IS NULL OR opening_balance = 0);

-- 6. Reconcile Customer 32
UPDATE customers 
SET opening_balance = 204660.00,
    opening_balance_date = COALESCE(opening_balance_date, '2026-08-01'::DATE)
WHERE id = 32 AND (opening_balance IS NULL OR opening_balance = 0);

-- 7. Reconcile Customer 30
UPDATE customers 
SET opening_balance = 78730.00,
    opening_balance_date = COALESCE(opening_balance_date, '2026-08-01'::DATE)
WHERE id = 30 AND (opening_balance IS NULL OR opening_balance = 0);

-- 8. Reconcile Customer 11
UPDATE customers 
SET opening_balance = 236450.00,
    opening_balance_date = COALESCE(opening_balance_date, '2026-08-01'::DATE)
WHERE id = 11 AND (opening_balance IS NULL OR opening_balance = 0 OR opening_balance = 472900.00);

-- 9. Reconcile Customer 29: SAI MOBILE - NIRAJ BHAI
UPDATE customers 
SET opening_balance = 0.00 
WHERE id = 29;

-- 10. Ensure all customers with opening_balance > 0 have an OPENING_BALANCE ledger_entry
INSERT INTO ledger_entries (
    shop_id,
    customer_id,
    entry_type,
    ref_no,
    entry_date,
    debit,
    credit,
    description,
    created_at
)
SELECT 
    COALESCE(c.shop_id, 2),
    c.id,
    'OPENING_BALANCE',
    'OB-' || LPAD(c.id::text, 6, '0'),
    COALESCE(c.opening_balance_date, '2026-08-01'::DATE),
    c.opening_balance,
    0.00,
    'Opening Balance for ' || c.name,
    COALESCE(c.opening_balance_date::timestamp, c.created_at, CURRENT_TIMESTAMP)
FROM customers c
WHERE c.opening_balance > 0
  AND NOT EXISTS (
    SELECT 1 FROM ledger_entries le 
    WHERE le.customer_id = c.id AND le.entry_type = 'OPENING_BALANCE'
  );

-- 11. Synchronize current_balance column across all customers dynamically
UPDATE customers c
SET current_balance = (
  COALESCE(c.opening_balance, 0)
  + COALESCE((SELECT SUM(COALESCE(NULLIF(s.current_invoice_total, 0), s.total_amount)) FROM sales s WHERE s.customer_id = c.id), 0)
  - COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.customer_id = c.id AND pm.reversed_at IS NULL AND COALESCE(pm.payment_mode, '') != 'credit_note'), 0)
  - COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn WHERE cn.customer_id = c.id AND cn.status != 'cancelled'), 0)
);

COMMIT;
