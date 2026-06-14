-- Add a first-class central Warehouse without changing any existing branch,
-- stock, batch, customer, sale, or transfer foreign keys.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'shop';

DO $$
DECLARE
  warehouse_id INTEGER;
BEGIN
  SELECT id INTO warehouse_id FROM shops WHERE location_type = 'warehouse' ORDER BY id LIMIT 1;

  IF warehouse_id IS NULL THEN
    INSERT INTO shops (name, area, address, phone, location_type)
    VALUES ('Warehouse', 'Central inventory', '', '', 'warehouse')
    RETURNING id INTO warehouse_id;
  ELSE
    UPDATE shops
    SET name = 'Warehouse',
        area = CASE WHEN NULLIF(TRIM(area), '') IS NULL THEN 'Central inventory' ELSE area END,
        location_type = 'warehouse'
    WHERE id = warehouse_id;
  END IF;

  INSERT INTO stock (shop_id, product_id, quantity)
  SELECT warehouse_id, p.id, 0
  FROM products p
  ON CONFLICT (shop_id, product_id) DO NOTHING;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS shops_single_warehouse_uidx
  ON shops (location_type) WHERE location_type = 'warehouse';
CREATE INDEX IF NOT EXISTS shops_location_type_idx ON shops (location_type);
