-- Alter products to add model column
ALTER TABLE products ADD COLUMN IF NOT EXISTS model TEXT;

-- Archive all existing colours initially so the active list starts clean,
-- but historical products and inventory referencing them remain safe in the DB.
UPDATE colours SET is_active = FALSE;

-- Archive generic categories and seed the new standard set
UPDATE categories SET is_active = FALSE;
INSERT INTO categories (name) VALUES
  ('Displays'),
  ('Battery'),
  ('Camera'),
  ('Charging IC'),
  ('Flex Cable'),
  ('Speaker'),
  ('Housing'),
  ('Tools'),
  ('Accessories'),
  ('Consumables')
ON CONFLICT (name) DO UPDATE SET is_active = TRUE;

-- Archive generic brands and seed the new standard set
UPDATE brands SET is_active = FALSE;
INSERT INTO brands (name) VALUES
  ('Samsung'),
  ('Vivo'),
  ('Oppo'),
  ('Realme'),
  ('Xiaomi'),
  ('Poco'),
  ('OnePlus'),
  ('Apple'),
  ('Google Pixel'),
  ('Nothing'),
  ('Motorola'),
  ('Huawei'),
  ('Honor'),
  ('Nokia'),
  ('Infinix'),
  ('Tecno'),
  ('Lava'),
  ('Micromax'),
  ('IQOO'),
  ('Asus'),
  ('Sony'),
  ('Lenovo'),
  ('Coolpad'),
  ('Meizu'),
  ('ZTE'),
  ('Black Shark'),
  ('ROG'),
  ('Redmi')
ON CONFLICT (name) DO UPDATE SET is_active = TRUE;
