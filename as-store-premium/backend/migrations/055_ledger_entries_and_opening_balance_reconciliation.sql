-- Migration 055: Create ledger_entries table, reconcile customer opening balances, and backfill opening balance ledger entries

BEGIN;

-- 1. Create ledger_entries table
CREATE TABLE IF NOT EXISTS ledger_entries (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL, -- 'OPENING_BALANCE', 'INVOICE', 'PAYMENT', 'CREDIT_NOTE', etc.
    ref_no TEXT,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    debit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_customer ON ledger_entries(customer_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_supplier ON ledger_entries(supplier_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_shop ON ledger_entries(shop_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_type ON ledger_entries(entry_type);

-- 2. Explicitly fix Customer 48 (JALARAM MOBILE)
UPDATE customers 
SET opening_balance = 34935.00,
    opening_balance_date = COALESCE(opening_balance_date, '2026-09-05'::DATE)
WHERE id = 48 AND (opening_balance IS NULL OR opening_balance = 0);

-- 3. Backfill any customer whose opening_balance is 0 but earliest sale has previous_balance > 0
WITH first_sales AS (
  SELECT DISTINCT ON (customer_id) 
    customer_id, 
    previous_balance,
    sale_date
  FROM sales
  WHERE customer_id IS NOT NULL 
    AND previous_balance > 0
  ORDER BY customer_id, id ASC
)
UPDATE customers c
SET opening_balance = fs.previous_balance,
    opening_balance_date = COALESCE(c.opening_balance_date, fs.sale_date::DATE, CURRENT_DATE)
FROM first_sales fs
WHERE c.id = fs.customer_id
  AND (c.opening_balance IS NULL OR c.opening_balance = 0);

-- 4. Backfill OPENING_BALANCE ledger_entries for all customers with opening_balance > 0
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
    c.shop_id,
    c.id,
    'OPENING_BALANCE',
    'OB-' || LPAD(c.id::text, 6, '0'),
    COALESCE(c.opening_balance_date, '2026-01-01'::DATE),
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

COMMIT;
