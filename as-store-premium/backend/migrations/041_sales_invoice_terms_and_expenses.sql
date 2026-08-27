-- Migration 041: Invoice Date, Payment Terms, Products Total, and Sale Expenses

-- 1. Ensure sales table has invoice_date, payment_terms_days, products_total, extra_expenses_total
ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 15;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS products_total NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS extra_expenses_total NUMERIC(12, 2) DEFAULT 0.00;

-- Convert existing due_date column to DATE if it is currently TEXT
DO $$
BEGIN
  BEGIN
    ALTER TABLE sales ALTER COLUMN due_date TYPE DATE USING (
      CASE 
        WHEN due_date IS NOT NULL AND due_date ~ '^\d{4}-\d{2}-\d{2}' THEN due_date::DATE 
        ELSE NULL 
      END
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not convert due_date type directly: %', SQLERRM;
  END;
END $$;

-- Populate legacy invoice_date and products_total from existing records
UPDATE sales 
SET invoice_date = COALESCE(
  CASE WHEN sale_date ~ '^\d{4}-\d{2}-\d{2}' THEN sale_date::DATE ELSE CURRENT_DATE END,
  CURRENT_DATE
)
WHERE invoice_date IS NULL;

UPDATE sales 
SET products_total = total_amount 
WHERE (products_total IS NULL OR products_total = 0) AND total_amount > 0;

-- 2. Create sale_expenses table with expense_type, expense_name, and amount
CREATE TABLE IF NOT EXISTS sale_expenses (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  expense_type VARCHAR(50) NOT NULL DEFAULT 'custom',
  expense_name VARCHAR(255) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_expenses_sale_id ON sale_expenses(sale_id);

-- 3. Customer-specific credit / payment terms schema preparation
ALTER TABLE customers ADD COLUMN IF NOT EXISTS default_payment_terms_days INTEGER DEFAULT 15;
