-- Migration 059: Add purchase_price to sale_items to freeze COGS and historical profit margins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sale_items' AND column_name = 'purchase_price'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN purchase_price NUMERIC(12, 2) DEFAULT 0.00;
  END IF;
END $$;

-- Backfill existing sale_items purchase_price from allocated batches or products master
UPDATE sale_items si
SET purchase_price = COALESCE(
  NULLIF((
    SELECT ROUND(AVG(sba.purchase_price)::numeric, 2)
    FROM sale_batch_allocations sba
    JOIN inventory_batches ib ON ib.id = sba.batch_id
    WHERE sba.sale_id = si.sale_id AND ib.product_id = si.product_id AND sba.purchase_price > 0
  ), 0),
  NULLIF((
    SELECT ROUND(AVG(sba.purchase_price)::numeric, 2)
    FROM sale_batch_allocations sba
    WHERE sba.sale_id = si.sale_id AND sba.purchase_price > 0
  ), 0),
  (SELECT p.purchase_price FROM products p WHERE p.id = si.product_id),
  0.00
)
WHERE si.purchase_price IS NULL OR si.purchase_price = 0;

-- Optimize query indexes for sales profit reporting
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_id_idx ON sale_items (product_id);
CREATE INDEX IF NOT EXISTS sales_invoice_date_idx ON sales (invoice_date);
CREATE INDEX IF NOT EXISTS sales_shop_date_idx ON sales (shop_id, invoice_date);
