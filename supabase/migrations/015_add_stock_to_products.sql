-- supabase/migrations/015_add_stock_to_products.sql
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode)
    WHERE barcode IS NOT NULL;
