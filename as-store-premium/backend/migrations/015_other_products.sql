-- 015_other_products.sql

-- 1. Table for Other Product Categories
CREATE TABLE IF NOT EXISTS other_product_categories (
    id SERIAL PRIMARY KEY,
    product_category VARCHAR(255) NOT NULL,
    other_if_needed TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table for Other Products
CREATE TABLE IF NOT EXISTS other_products (
    id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    product_company VARCHAR(255),
    price NUMERIC(10, 2) DEFAULT 0,
    product_category_id INTEGER REFERENCES other_product_categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
