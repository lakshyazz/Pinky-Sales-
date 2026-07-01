-- Rebuild the denormalized stock balance cache from inventory batches.
-- inventory_batches is the source of truth used by sales/FIFO stock flows.
WITH batch_totals AS (
  SELECT shop_id, product_id, COALESCE(SUM(quantity_remaining), 0)::integer AS quantity
  FROM inventory_batches
  GROUP BY shop_id, product_id
)
UPDATE stock st
SET quantity = bt.quantity,
    updated_at = CURRENT_TIMESTAMP
FROM batch_totals bt
WHERE st.shop_id = bt.shop_id
  AND st.product_id = bt.product_id
  AND st.quantity IS DISTINCT FROM bt.quantity;

WITH batch_totals AS (
  SELECT shop_id, product_id, COALESCE(SUM(quantity_remaining), 0)::integer AS quantity
  FROM inventory_batches
  GROUP BY shop_id, product_id
)
INSERT INTO stock (shop_id, product_id, quantity)
SELECT bt.shop_id, bt.product_id, bt.quantity
FROM batch_totals bt
LEFT JOIN stock st ON st.shop_id = bt.shop_id AND st.product_id = bt.product_id
WHERE st.id IS NULL;

UPDATE stock st
SET quantity = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE st.quantity <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_batches ib
    WHERE ib.shop_id = st.shop_id
      AND ib.product_id = st.product_id
  );
