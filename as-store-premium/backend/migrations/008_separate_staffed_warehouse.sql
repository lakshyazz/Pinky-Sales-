-- A staffed location is a branch, not the owner's central Warehouse.
DO $$
DECLARE
  staffed_warehouse_id INTEGER;
  new_warehouse_id INTEGER;
BEGIN
  SELECT sh.id INTO staffed_warehouse_id
  FROM shops sh
  WHERE sh.location_type = 'warehouse'
    AND EXISTS (SELECT 1 FROM users u WHERE u.shop_id = sh.id AND u.role IN ('shopkeeper', 'admin'))
  LIMIT 1;

  IF staffed_warehouse_id IS NOT NULL THEN
    UPDATE shops
    SET location_type = 'shop',
        name = CASE WHEN name = 'Warehouse' THEN 'Pinky sales' ELSE name END
    WHERE id = staffed_warehouse_id;

    INSERT INTO shops (name, area, address, phone, location_type)
    VALUES ('Warehouse', 'Central inventory', '', '', 'warehouse')
    RETURNING id INTO new_warehouse_id;

    INSERT INTO stock (shop_id, product_id, quantity)
    SELECT new_warehouse_id, p.id, 0
    FROM products p
    ON CONFLICT (shop_id, product_id) DO NOTHING;
  END IF;
END $$;
