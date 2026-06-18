-- Support backend pagination, search, and filtered list views.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_active_brand_category_idx
  ON products (is_active, brand, category);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_short_name_trgm_idx
  ON products USING GIN (short_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_full_model_list_trgm_idx
  ON products USING GIN (full_model_list gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_brand_trgm_idx
  ON products USING GIN (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_category_trgm_idx
  ON products USING GIN (category gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_colours_gin_idx
  ON products USING GIN (colours);

CREATE INDEX IF NOT EXISTS stock_shop_product_idx
  ON stock (shop_id, product_id);

CREATE INDEX IF NOT EXISTS inventory_batches_shop_colour_idx
  ON inventory_batches (shop_id, colour);
CREATE INDEX IF NOT EXISTS inventory_batches_shop_assigned_remaining_idx
  ON inventory_batches (shop_id, assigned_user_id, quantity_remaining);
CREATE INDEX IF NOT EXISTS inventory_batches_shop_received_idx
  ON inventory_batches (shop_id, received_date, id);

CREATE INDEX IF NOT EXISTS customers_shop_created_at_idx
  ON customers (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_shop_mobile_idx
  ON customers (shop_id, mobile);
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON customers USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_mobile_trgm_idx
  ON customers USING GIN (mobile gin_trgm_ops);

CREATE INDEX IF NOT EXISTS sales_shop_id_id_desc_idx
  ON sales (shop_id, id DESC);
CREATE INDEX IF NOT EXISTS sales_shop_customer_pending_idx
  ON sales (shop_id, customer_id, pending_amount);
CREATE INDEX IF NOT EXISTS sales_shop_status_idx
  ON sales (shop_id, status);
CREATE INDEX IF NOT EXISTS sales_created_by_idx
  ON sales (created_by);
CREATE INDEX IF NOT EXISTS sales_due_date_pending_idx
  ON sales (due_date, id) WHERE pending_amount > 0;
