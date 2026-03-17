-- ============================================================
-- 012_audit_log.sql
-- Tabela de auditoria imutável para eventos críticos do sistema.
-- Registra autenticação, criação de pedidos e operações admin.
-- NÃO armazena dados sensíveis (senhas, tokens, telefones completos).
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type   TEXT        NOT NULL,
    actor_type   TEXT        CHECK (actor_type IN ('admin', 'client', 'system')),
    actor_id     TEXT,                 -- ID opaco (ex: CL001, UUID admin) — sem PII
    resource_type TEXT,                -- 'order', 'client', 'product', 'store_settings'
    resource_id  TEXT,                 -- ID do recurso afetado
    metadata     JSONB,                -- dados extras não-sensíveis (error_code, item_count…)
    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Índices para consultas comuns
CREATE INDEX IF NOT EXISTS audit_log_event_type_idx  ON audit_log (event_type);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx    ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx  ON audit_log (created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Qualquer cliente autenticado pode inserir (anon key é suficiente)
CREATE POLICY "audit_log_insert" ON audit_log
    FOR INSERT WITH CHECK (true);

-- Leitura pública dos logs (actor_id são IDs opacos, sem PII)
CREATE POLICY "audit_log_select" ON audit_log
    FOR SELECT USING (true);

-- UPDATE e DELETE bloqueados — audit trail é imutável
-- (ausência de policy = negado por padrão com RLS habilitado)
