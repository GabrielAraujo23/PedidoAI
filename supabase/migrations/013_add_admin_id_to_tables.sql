-- ============================================================
-- 013_add_admin_id_to_tables.sql
-- Associa clients, orders e products ao admin dono desses dados.
-- Cada admin vê e gerencia apenas seus próprios registros.
-- ============================================================

-- ── Adiciona admin_id ────────────────────────────────────────

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id);

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id);

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id);

-- ── Índices para queries filtradas por admin ─────────────────

CREATE INDEX IF NOT EXISTS clients_admin_id_idx  ON clients(admin_id);
CREATE INDEX IF NOT EXISTS orders_admin_id_idx   ON orders(admin_id);
CREATE INDEX IF NOT EXISTS products_admin_id_idx ON products(admin_id);

-- ── Migra dados existentes para o único admin cadastrado ─────
-- (seguro se houver apenas 1 admin; se houver mais de 1,
--  registros sem dono ficam com admin_id = NULL e não aparecem
--  para nenhum admin até serem reatribuídos manualmente)

UPDATE clients
    SET admin_id = (SELECT id FROM admins ORDER BY created_at LIMIT 1)
    WHERE admin_id IS NULL;

UPDATE orders
    SET admin_id = (SELECT id FROM admins ORDER BY created_at LIMIT 1)
    WHERE admin_id IS NULL;

UPDATE products
    SET admin_id = (SELECT id FROM admins ORDER BY created_at LIMIT 1)
    WHERE admin_id IS NULL;
