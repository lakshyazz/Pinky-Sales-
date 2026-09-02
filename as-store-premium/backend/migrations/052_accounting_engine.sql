-- Migration 052: Accounting Engine — No-GST Double-Entry Foundation
-- Adds: chart_of_accounts, journal_entries, journal_entry_lines,
--       purchase_bills, purchase_bill_items, debit_notes, debit_note_items,
--       payment_splits, sequences, sale_items discount columns.
-- NO GST columns anywhere in this migration.

-- ─── 1. Sequences (race-safe number generation) ────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS credit_note_seq
  START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS debit_note_seq
  START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS purchase_bill_seq
  START WITH 1 INCREMENT BY 1 NO CYCLE;

-- Sync credit_note_seq to current max id (so next nextval() is above existing data)
DO $$
DECLARE
  max_cn_id INTEGER;
BEGIN
  SELECT COALESCE(MAX(id), 0) INTO max_cn_id FROM credit_notes;
  IF max_cn_id > 0 THEN
    PERFORM setval('credit_note_seq', max_cn_id + 1, false);
  END IF;
END $$;

-- ─── 2. Chart of Accounts ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  account_type VARCHAR(30) NOT NULL
    CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
  parent_id   INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default COA (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO chart_of_accounts (code, name, account_type, is_system) VALUES
  ('1000', 'Cash',                  'Asset',     TRUE),
  ('1010', 'Bank Account',          'Asset',     TRUE),
  ('1020', 'Accounts Receivable',   'Asset',     TRUE),
  ('1030', 'Inventory',             'Asset',     TRUE),
  ('1040', 'Customer Advance',      'Asset',     TRUE),
  ('2000', 'Accounts Payable',      'Liability', TRUE),
  ('2010', 'Credit Notes Payable',  'Liability', TRUE),
  ('2020', 'Customer Deposits',     'Liability', TRUE),
  ('3000', 'Owner Equity',          'Equity',    TRUE),
  ('4000', 'Sales Revenue',         'Revenue',   TRUE),
  ('4010', 'Other Income',          'Revenue',   TRUE),
  ('5000', 'Cost of Goods Sold',    'Expense',   TRUE),
  ('5010', 'Purchase Returns',      'Expense',   TRUE),
  ('5020', 'Sales Returns',         'Expense',   TRUE),
  ('5030', 'Freight & Charges',     'Expense',   TRUE),
  ('5040', 'Miscellaneous Expense', 'Expense',   TRUE)
ON CONFLICT (code) DO NOTHING;

-- ─── 3. Journal Entries (immutable header) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
  id          SERIAL PRIMARY KEY,
  shop_id     INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  narration   TEXT,
  ref_type    VARCHAR(30),
    -- 'sale' | 'payment' | 'credit_note' | 'debit_note' | 'purchase_bill' | 'advance'
  ref_id      INTEGER,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_by INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── 4. Journal Entry Lines (immutable debit/credit) ─────────────────────────

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id                SERIAL PRIMARY KEY,
  journal_entry_id  INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id        INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  debit             NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  credit            NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  entity_type       VARCHAR(30),
  entity_id         INTEGER,
  narration         TEXT,
  CONSTRAINT chk_jel_debit_xor_credit CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  ),
  CONSTRAINT chk_jel_no_zero CHECK (debit >= 0 AND credit >= 0)
);

-- ─── 5. Purchase Bills (vendor payables — no GST) ─────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_bills (
  id                  SERIAL PRIMARY KEY,
  bill_number         VARCHAR(50) UNIQUE NOT NULL,
  shop_id             INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  supplier_id         INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  bill_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date            DATE,
  payment_terms_days  INTEGER DEFAULT 30,
  products_total      NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  discount_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  extra_charges       NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  total_amount        NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  paid_amount         NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  pending_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  payment_mode        VARCHAR(50) DEFAULT 'credit',
  notes               TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partially_paid', 'paid', 'cancelled')),
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── 6. Purchase Bill Items ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_bill_items (
  id                  SERIAL PRIMARY KEY,
  bill_id             INTEGER NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
  product_id          INTEGER REFERENCES products(id) ON DELETE SET NULL,
  custom_product_name VARCHAR(255),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  unit_price          NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  discount_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  total_price         NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── 7. Debit Notes (purchase returns — auto stock deduction) ─────────────────

CREATE TABLE IF NOT EXISTS debit_notes (
  id                SERIAL PRIMARY KEY,
  debit_note_number VARCHAR(50) UNIQUE NOT NULL,
  shop_id           INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  supplier_id       INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_bill_id  INTEGER REFERENCES purchase_bills(id) ON DELETE SET NULL,
  amount            NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reason            TEXT,
  return_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  status            VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settled', 'cancelled')),
  stock_deducted    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── 8. Debit Note Items ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS debit_note_items (
  id                  SERIAL PRIMARY KEY,
  debit_note_id       INTEGER NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
  product_id          INTEGER REFERENCES products(id) ON DELETE SET NULL,
  custom_product_name VARCHAR(255),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  unit_price          NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  total_price         NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  colour              VARCHAR(100),
  restock_supplier    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── 9. Payment Splits (multi-mode) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_splits (
  id               SERIAL PRIMARY KEY,
  payment_id       INTEGER REFERENCES payments(id) ON DELETE CASCADE,
  sale_id          INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  bill_id          INTEGER REFERENCES purchase_bills(id) ON DELETE CASCADE,
  payment_mode     VARCHAR(50) NOT NULL,
  amount           NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reference_number VARCHAR(100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_payment_split_target CHECK (
    (payment_id IS NOT NULL) OR (sale_id IS NOT NULL) OR (bill_id IS NOT NULL)
  )
);

-- ─── 10. sale_items — add item-level discount columns (no GST) ────────────────

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_pct    NUMERIC(6, 2)  NOT NULL DEFAULT 0.00;

-- ─── 11. shops — add GSTIN and state info (optional, for future use) ──────────
-- (No GST logic, but these are administrative fields for the shop profile)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS gstin              VARCHAR(30);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS state_code         VARCHAR(2);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS registered_address TEXT;

-- ─── 12. Performance Indexes ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_journal_entries_ref
  ON journal_entries (ref_type, ref_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_shop_date
  ON journal_entries (shop_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal
  ON journal_entry_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account
  ON journal_entry_lines (account_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entity
  ON journal_entry_lines (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_purchase_bills_supplier_status
  ON purchase_bills (supplier_id, status);

CREATE INDEX IF NOT EXISTS idx_purchase_bills_shop_date
  ON purchase_bills (shop_id, bill_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_bill
  ON purchase_bill_items (bill_id);

CREATE INDEX IF NOT EXISTS idx_debit_notes_supplier
  ON debit_notes (supplier_id);

CREATE INDEX IF NOT EXISTS idx_debit_notes_shop
  ON debit_notes (shop_id, return_date DESC);

CREATE INDEX IF NOT EXISTS idx_debit_note_items_debit_note
  ON debit_note_items (debit_note_id);

CREATE INDEX IF NOT EXISTS idx_payment_splits_payment
  ON payment_splits (payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_splits_sale
  ON payment_splits (sale_id);
