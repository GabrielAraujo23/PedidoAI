-- supabase/migrations/017_create_nfe_imports.sql
CREATE TABLE IF NOT EXISTS nfe_imports (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id      UUID        NOT NULL REFERENCES admins(id),
    chave_acesso  TEXT        NOT NULL,
    supplier_name TEXT,
    total_items   INTEGER     NOT NULL DEFAULT 0,
    imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    status        TEXT        NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed'))
);

CREATE INDEX IF NOT EXISTS nfe_imports_admin_idx ON nfe_imports (admin_id);

ALTER TABLE nfe_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfe_imports_allow_all" ON nfe_imports
    FOR ALL USING (true) WITH CHECK (true);
