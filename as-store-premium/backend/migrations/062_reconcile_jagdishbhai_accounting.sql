-- Migration 062: Reconcile Customer 15 (JAGDISHBHAI) Accounting & Payment Allocations
BEGIN;

-- 1. Insert missing cash payment record for legacy Invoice #INV-000036 (₹1,000.00)
DO $$
DECLARE
  p_num TEXT;
  p_id INT;
BEGIN
  SELECT id INTO p_id FROM payments WHERE customer_id = 15 AND sale_id = 36 LIMIT 1;
  IF p_id IS NULL THEN
    p_num := 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0');
    INSERT INTO payments (payment_number, customer_id, sale_id, amount, payment_date, payment_mode, note, shop_id, created_at)
    VALUES (p_num, 15, 36, 1000.00, '2026-08-29', 'cash', 'Cash payment at checkout for INV-000036', 2, '2026-08-30 09:44:06')
    RETURNING id INTO p_id;
  END IF;

  -- 2. Clear corrupted shifted allocations
  DELETE FROM payment_allocations WHERE customer_id = 15;

  -- 3. Re-insert exact 1-to-1 allocations
  INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
  VALUES 
    (p_id, 15, 36, 'invoice', 1000.00, 'Full settlement for INV-000036', '2026-08-30 09:44:06'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id = 21),  15, 100, 'invoice', 4300.00,   'Full settlement for INV-000100', '2026-09-02 07:15:20'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id = 22),  15, 101, 'invoice', 11550.00,  'Full settlement for INV-000101', '2026-09-02 13:58:33'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id = 68),  15, 161, 'invoice', 4080.00,   'Full settlement for INV-000161', '2026-09-14 06:56:54'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id = 69),  15, 162, 'invoice', 126630.00, 'Full settlement for INV-000162', '2026-09-14 07:08:29'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id = 70),  15, 163, 'invoice', 5900.00,   'Full settlement for INV-000163', '2026-09-14 07:20:41'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id = 71),  15, 164, 'invoice', 13600.00,  'Full settlement for INV-000164', '2026-09-14 07:25:50'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id = 72),  15, 165, 'invoice', 16800.00,  'Full settlement for INV-000165', '2026-09-14 07:28:19'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id = 73),  15, 166, 'invoice', 14000.00,  'Full settlement for INV-000166', '2026-09-14 07:31:26'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id = 74),  15, 168, 'invoice', 4550.00,   'Full settlement for INV-000168', '2026-09-16 09:58:17'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id IN (99, 100) ORDER BY id ASC LIMIT 1),   15, 183, 'invoice', 6880.00,   'Full settlement for INV-000183', '2026-09-16 12:55:34'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id IN (131, 133) ORDER BY id ASC LIMIT 1), 15, 207, 'invoice', 1330.00,   'Full settlement for INV-000207', '2026-09-18 06:44:09'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id IN (232, 234) ORDER BY id ASC LIMIT 1), 15, 262, 'invoice', 13450.00,  'Full settlement for INV-000262', '2026-09-19 06:54:15'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id IN (270, 278) ORDER BY id ASC LIMIT 1), 15, 290, 'invoice', 5800.00,   'Full settlement for INV-000290', '2026-09-19 15:20:29'),
    ((SELECT id FROM payments WHERE customer_id = 15 AND id IN (360, 394) ORDER BY id ASC LIMIT 1), 15, 367, 'invoice', 54950.00,  'Full settlement for INV-000367', '2026-09-23 11:26:07');
END $$;

-- 4. Restore Invoice 367 to 100% Paid
UPDATE sales 
SET paid_amount = 54950.00,
    pending_amount = 0.00,
    status = 'paid'
WHERE id = 367;

-- 5. Fix carry-forward balances on subsequent invoices
UPDATE sales 
SET previous_balance = 0.00,
    net_payable_amount = 9220.00,
    closing_balance = 9220.00
WHERE id = 399;

UPDATE sales 
SET previous_balance = 9220.00,
    net_payable_amount = 12270.00,
    closing_balance = 12270.00
WHERE id = 424;

UPDATE sales 
SET previous_balance = 12270.00,
    net_payable_amount = 44970.00,
    closing_balance = 44970.00
WHERE id = 461;

-- 6. Synchronize customer balance
UPDATE customers 
SET opening_balance = 0.00,
    current_balance = 44970.00,
    advance_balance = 0.00
WHERE id = 15;

COMMIT;
