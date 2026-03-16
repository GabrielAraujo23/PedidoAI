-- Store settings table (one row per admin)
CREATE TABLE IF NOT EXISTS store_settings (
    id                    UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id              UUID         REFERENCES admins(id) ON DELETE CASCADE,
    store_name            TEXT,
    cnpj                  TEXT,
    address               TEXT,
    phone                 TEXT,
    business_hours        TEXT,
    delivery_rate_per_km  NUMERIC,
    tax_regime            TEXT,
    state_registration    TEXT,
    product_categories    TEXT[]       DEFAULT '{}',
    logo_url              TEXT,
    created_at            TIMESTAMPTZ  DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(admin_id)
);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

-- App uses custom auth (not Supabase Auth), so allow all operations
CREATE POLICY "store_settings_allow_all" ON store_settings
    FOR ALL USING (true) WITH CHECK (true);

-- ── Supabase Storage ──────────────────────────────────────────────────────
-- Run these steps manually in Supabase Dashboard > Storage:
--   1. Create bucket named: store-logos
--   2. Toggle "Public bucket" ON
--   3. In "Policies" tab, add a policy for INSERT/UPDATE/SELECT: USING (true)
--
-- Or run in SQL Editor:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('store-logos', 'store-logos', true)
-- ON CONFLICT (id) DO NOTHING;
