-- Migration 049: Add public_token to sales table with default UUID and unique index
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'public_token'
  ) THEN
    ALTER TABLE sales ADD COLUMN public_token TEXT;
  END IF;
END $$;

-- Backfill existing rows with NULL public_token
UPDATE sales 
SET public_token = gen_random_uuid()::text 
WHERE public_token IS NULL;

-- Set default value and NOT NULL constraint
ALTER TABLE sales 
  ALTER COLUMN public_token SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN public_token SET NOT NULL;

-- Create unique index on public_token for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_public_token ON sales(public_token);
