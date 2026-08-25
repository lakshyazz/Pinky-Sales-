-- Migration 040: B2B Branch Stock Ordering & SuperAdmin Approval Workflow

-- 1. Enhance stock_requests table with B2B tracking columns
DO $$ 
BEGIN 
  -- request_number
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_requests' AND column_name = 'request_number') THEN
    ALTER TABLE stock_requests ADD COLUMN request_number TEXT;
  END IF;

  -- total_items
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_requests' AND column_name = 'total_items') THEN
    ALTER TABLE stock_requests ADD COLUMN total_items INTEGER DEFAULT 1;
  END IF;

  -- total_quantity
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_requests' AND column_name = 'total_quantity') THEN
    ALTER TABLE stock_requests ADD COLUMN total_quantity INTEGER DEFAULT 1;
  END IF;

  -- notes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_requests' AND column_name = 'notes') THEN
    ALTER TABLE stock_requests ADD COLUMN notes TEXT;
  END IF;

  -- rejection_reason
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_requests' AND column_name = 'rejection_reason') THEN
    ALTER TABLE stock_requests ADD COLUMN rejection_reason TEXT;
  END IF;

  -- approved_by
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_requests' AND column_name = 'approved_by') THEN
    ALTER TABLE stock_requests ADD COLUMN approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- approved_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_requests' AND column_name = 'approved_at') THEN
    ALTER TABLE stock_requests ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;

  -- updated_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_requests' AND column_name = 'updated_at') THEN
    ALTER TABLE stock_requests ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- 2. Create stock_request_items table for itemized requisitions with JSONB color breakdown
CREATE TABLE IF NOT EXISTS stock_request_items (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES stock_requests(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  brand TEXT,
  quality_grade TEXT,
  requested_qty INTEGER NOT NULL DEFAULT 1,
  approved_qty INTEGER DEFAULT 0,
  color_breakdown JSONB DEFAULT '[]'::jsonb,
  unit_cost NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Indexes for rapid queries and filtering
CREATE INDEX IF NOT EXISTS idx_stock_requests_shop_status ON stock_requests (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_requests_created_at ON stock_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_request_items_request_id ON stock_request_items (request_id);
CREATE INDEX IF NOT EXISTS idx_stock_request_items_product_id ON stock_request_items (product_id);
