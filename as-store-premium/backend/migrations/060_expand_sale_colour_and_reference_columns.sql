-- Migration 060: Expand colour, idempotency, reference, and item description columns to TEXT or VARCHAR(255)
-- Fixes: "value too long for type character varying(100)" when recording customer purchases with multiple items or color breakdowns

DO $$ 
BEGIN
  -- 1. sales table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'colour') THEN
    ALTER TABLE sales ALTER COLUMN colour TYPE TEXT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'idempotency_key') THEN
    ALTER TABLE sales ALTER COLUMN idempotency_key TYPE VARCHAR(255);
  END IF;

  -- 2. sale_items table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'colour') THEN
    ALTER TABLE sale_items ALTER COLUMN colour TYPE TEXT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'custom_product_name') THEN
    ALTER TABLE sale_items ALTER COLUMN custom_product_name TYPE TEXT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'custom_brand_name') THEN
    ALTER TABLE sale_items ALTER COLUMN custom_brand_name TYPE TEXT;
  END IF;

  -- 3. debit_note_items table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'debit_note_items' AND column_name = 'colour') THEN
    ALTER TABLE debit_note_items ALTER COLUMN colour TYPE TEXT;
  END IF;

  -- 4. payments & payment_splits
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'reference_number') THEN
    ALTER TABLE payments ALTER COLUMN reference_number TYPE VARCHAR(255);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'idempotency_key') THEN
    ALTER TABLE payments ALTER COLUMN idempotency_key TYPE VARCHAR(255);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_splits' AND column_name = 'reference_number') THEN
    ALTER TABLE payment_splits ALTER COLUMN reference_number TYPE VARCHAR(255);
  END IF;

  -- 5. chart_of_accounts
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chart_of_accounts' AND column_name = 'name') THEN
    ALTER TABLE chart_of_accounts ALTER COLUMN name TYPE VARCHAR(255);
  END IF;
END $$;
