-- supabase/migrations/016_create_stock_movements.sql
CREATE TABLE IF NOT EXISTS stock_movements (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id     UUID        NOT NULL REFERENCES admins(id),
    product_id   UUID        NOT NULL REFERENCES products(id),
    product_name TEXT        NOT NULL,
    type         TEXT        NOT NULL CHECK (type IN ('entrada', 'saida', 'ajuste')),
    quantity     INTEGER     NOT NULL,
    reference    TEXT,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_admin_created_idx
    ON stock_movements (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_product_idx
    ON stock_movements (product_id);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements_allow_all" ON stock_movements
    FOR ALL USING (true) WITH CHECK (true);
