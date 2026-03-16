-- Order items table (one row per product per order)
CREATE TABLE IF NOT EXISTS order_items (
    id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id     TEXT          REFERENCES orders(id) ON DELETE CASCADE,
    product_id   UUID          REFERENCES products(id),
    product_name TEXT          NOT NULL,
    unit         TEXT          NOT NULL,
    quantity     NUMERIC       NOT NULL,
    unit_price   NUMERIC(10,2) NOT NULL,
    total_price  NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at   TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- App uses custom auth (not Supabase Auth), so allow all operations
CREATE POLICY "order_items_allow_all" ON order_items
    FOR ALL USING (true) WITH CHECK (true);
