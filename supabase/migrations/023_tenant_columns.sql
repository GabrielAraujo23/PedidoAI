-- ============================================================
-- 023_tenant_columns.sql
--
-- Completa o modelo multi-tenant: order_items e audit_log eram as
-- duas unicas tabelas sem admin_id, entao nao havia como filtrar
-- nem auditar por lojista.
--
-- order_items herda o dono do pedido pai; audit_log passa a gravar
-- o tenant no momento do evento.
-- ============================================================

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id);

ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id);

CREATE INDEX IF NOT EXISTS order_items_admin_id_idx ON order_items(admin_id);
CREATE INDEX IF NOT EXISTS audit_log_admin_id_idx   ON audit_log(admin_id);

-- Backfill: itens existentes recebem o admin_id do pedido a que pertencem.
UPDATE order_items oi
    SET admin_id = o.admin_id
    FROM orders o
    WHERE oi.order_id = o.id
      AND oi.admin_id IS NULL;

-- audit_log nao tem como ser reconstruido de forma confiavel (o registro
-- referenciado pode ter sido removido), entao fica NULL para o historico.
-- Eventos novos passam a gravar o tenant.
