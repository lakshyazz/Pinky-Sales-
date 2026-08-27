-- Migration 042: Add colour column to sales table for direct persistence and reporting

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'colour'
  ) THEN
    ALTER TABLE sales ADD COLUMN colour VARCHAR(100) DEFAULT NULL;
  END IF;
END $$;
