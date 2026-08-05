-- Seed/Ensure all 13 required manufacturing brands exist and are active
INSERT INTO manufacturing_brands (name, is_active) VALUES
  ('AS CARE', TRUE),
  ('Kaiku', TRUE),
  ('GX', TRUE),
  ('Astor Plus', TRUE),
  ('Queen SVC', TRUE),
  ('AS Great', TRUE),
  ('AsPro', TRUE),
  ('KBS', TRUE),
  ('Crown', TRUE),
  ('SVC', TRUE),
  ('WD SVC', TRUE),
  ('YK', TRUE),
  ('DD', TRUE)
ON CONFLICT (LOWER(TRIM(name))) DO UPDATE 
SET is_active = TRUE;

-- Merge 'AS PRO' references to 'AsPro'
UPDATE products
SET manufacturing_brand_id = (SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'aspro' LIMIT 1)
WHERE manufacturing_brand_id = (SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'as pro' LIMIT 1);

UPDATE inventory_batches
SET manufacturing_brand_id = (SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'aspro' LIMIT 1)
WHERE manufacturing_brand_id = (SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'as pro' LIMIT 1);

UPDATE sales
SET manufacturing_brand_id = (SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'aspro' LIMIT 1)
WHERE manufacturing_brand_id = (SELECT id FROM manufacturing_brands WHERE LOWER(TRIM(name)) = 'as pro' LIMIT 1);

-- Delete 'AS PRO' duplicate
DELETE FROM manufacturing_brands
WHERE LOWER(TRIM(name)) = 'as pro';

-- Delete 'Unknown' and 'AS Originals'
DELETE FROM manufacturing_brands
WHERE LOWER(TRIM(name)) = 'unknown' OR LOWER(TRIM(name)) = 'as originals';

-- Delete any other manufacturing brands that are NOT in the allowed list
DELETE FROM manufacturing_brands
WHERE LOWER(TRIM(name)) NOT IN (
  'astor plus',
  'kaiku',
  'queen svc',
  'as care',
  'as great',
  'aspro',
  'gx',
  'kbs',
  'crown',
  'svc',
  'wd svc',
  'yk',
  'dd'
);
