-- Migration 044: Credit Notes, Sales Returns, and Carry Forward Balances

-- 1. Credit Notes Table
CREATE TABLE IF NOT EXISTS credit_notes (
    id SERIAL PRIMARY KEY,
    credit_note_number VARCHAR(50) UNIQUE NOT NULL,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    used_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_amount NUMERIC(12, 2) NOT NULL CHECK (balance_amount >= 0),
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partially_used', 'redeemed', 'cancelled')),
    return_date DATE DEFAULT CURRENT_DATE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_credit_note_balance CHECK (used_amount + balance_amount = amount)
);

-- 2. Sales Returns Table
CREATE TABLE IF NOT EXISTS sales_returns (
    id SERIAL PRIMARY KEY,
    credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
    sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    colour TEXT,
    restock_inventory BOOLEAN NOT NULL DEFAULT TRUE,
    return_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Credit Note Redemptions Table
CREATE TABLE IF NOT EXISTS credit_note_redemptions (
    id SERIAL PRIMARY KEY,
    credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Extend Sales Table with Carry-Forward Snapshots
ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS previous_balance NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS current_invoice_total NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS applied_credit_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS net_payable_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(12, 2) DEFAULT 0.00;

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer_status ON credit_notes(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_returns_sale ON sales_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_sale ON credit_note_redemptions(sale_id);
