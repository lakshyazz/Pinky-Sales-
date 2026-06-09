-- Additive product metadata and pricing fields. Existing product and stock data is preserved.
ALTER TABLE products ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS full_model_list TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price NUMERIC(12, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS colours TEXT[] NOT NULL DEFAULT '{}';

UPDATE products
SET
  full_model_list = COALESCE(NULLIF(full_model_list, ''), name),
  short_name = COALESCE(
    NULLIF(short_name, ''),
    CASE
      WHEN LENGTH(name) > 60 THEN TRIM(SPLIT_PART(name, '/', 1))
      ELSE name
    END
  ),
  sale_price = COALESCE(sale_price, official_price),
  retail_price = COALESCE(retail_price, official_price)
WHERE
  full_model_list IS NULL
  OR short_name IS NULL
  OR sale_price IS NULL
  OR retail_price IS NULL;

UPDATE products
SET short_name = LEFT(short_name, 57) || '...'
WHERE LENGTH(short_name) > 60;

CREATE INDEX IF NOT EXISTS products_short_name_idx ON products (short_name);
