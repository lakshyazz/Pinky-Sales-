-- Migration 036: Add product image storage support (Cloudflare R2 Integration)
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'::jsonb;

-- Optional index for faster lookups if filtering by image presence
CREATE INDEX IF NOT EXISTS idx_products_image_url_not_null ON products (id) WHERE image_url IS NOT NULL;
