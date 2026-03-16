-- Products catalog table
CREATE TABLE IF NOT EXISTS products (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT          NOT NULL,
    description TEXT,
    category    TEXT          NOT NULL,
    subcategory TEXT,
    unit        TEXT          NOT NULL DEFAULT 'por unidade',
    price       NUMERIC(10,2) NOT NULL,
    active      BOOLEAN       DEFAULT true,
    created_at  TIMESTAMPTZ   DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- App uses custom auth (not Supabase Auth), so allow all operations
CREATE POLICY "products_allow_all" ON products
    FOR ALL USING (true) WITH CHECK (true);
