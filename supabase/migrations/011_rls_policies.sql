-- ============================================================
-- Migration 011 — RLS Policies
--
-- Contexto: o app usa auth customizada (nome+telefone para
-- clientes, email+senha próprio para admins) armazenada em
-- localStorage. Não usamos Supabase Auth, portanto auth.uid()
-- é sempre NULL. As políticas abaixo não conseguem distinguir
-- admin de cliente — esse controle permanece na camada de UI.
--
-- O que esta migration resolve:
--   1. Habilita RLS em orders e clients (estavam sem proteção)
--   2. Habilita RLS em admins
--   3. Substitui "allow_all" (SELECT + INSERT + UPDATE + DELETE)
--      por políticas granulares que bloqueiam DELETE onde a UI
--      não precisa e bloqueiam UPDATE/DELETE em order_items
--      (imutável após criação)
-- ============================================================


-- ── ORDERS ───────────────────────────────────────────────────────────────────
-- Necessário: SELECT (kanban admin + histórico cliente)
--             INSERT (cliente cria pedido)
--             UPDATE (admin altera status / posição)
--             DELETE bloqueado — nenhuma tela deleta pedidos

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "orders_insert" ON orders;
DROP POLICY IF EXISTS "orders_update" ON orders;

CREATE POLICY "orders_select" ON orders
    FOR SELECT USING (true);

CREATE POLICY "orders_insert" ON orders
    FOR INSERT WITH CHECK (true);

CREATE POLICY "orders_update" ON orders
    FOR UPDATE USING (true) WITH CHECK (true);

-- DELETE não declarado → bloqueado pelo RLS


-- ── CLIENTS ──────────────────────────────────────────────────────────────────
-- Necessário: SELECT (login / checkout / lista admin)
--             INSERT (cadastro de novo cliente)
--             UPDATE (salvar endereço no checkout / admin edita)
--             DELETE bloqueado — nenhuma tela deleta clientes

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select" ON clients;
DROP POLICY IF EXISTS "clients_insert" ON clients;
DROP POLICY IF EXISTS "clients_update" ON clients;

CREATE POLICY "clients_select" ON clients
    FOR SELECT USING (true);

CREATE POLICY "clients_insert" ON clients
    FOR INSERT WITH CHECK (true);

CREATE POLICY "clients_update" ON clients
    FOR UPDATE USING (true) WITH CHECK (true);

-- DELETE não declarado → bloqueado pelo RLS


-- ── ADMINS ───────────────────────────────────────────────────────────────────
-- Necessário: SELECT (verificação de login / reset token)
--             INSERT (criação de conta admin em /loginadmin)
--             UPDATE (reset de senha)
--             DELETE bloqueado — nunca remover admin pelo browser

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select" ON admins;
DROP POLICY IF EXISTS "admins_insert" ON admins;
DROP POLICY IF EXISTS "admins_update" ON admins;

CREATE POLICY "admins_select" ON admins
    FOR SELECT USING (true);

CREATE POLICY "admins_insert" ON admins
    FOR INSERT WITH CHECK (true);

CREATE POLICY "admins_update" ON admins
    FOR UPDATE USING (true) WITH CHECK (true);

-- DELETE não declarado → bloqueado pelo RLS


-- ── PRODUCTS ─────────────────────────────────────────────────────────────────
-- Necessário: SELECT (catálogo cliente + lista admin)
--             INSERT (admin adiciona produto)
--             UPDATE (admin edita / toggle ativo)
--             DELETE (admin tem botão de excluir produto na UI)
-- Substitui a política "products_allow_all" por políticas explícitas.

DROP POLICY IF EXISTS "products_allow_all" ON products;

DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;

CREATE POLICY "products_select" ON products
    FOR SELECT USING (true);

CREATE POLICY "products_insert" ON products
    FOR INSERT WITH CHECK (true);

CREATE POLICY "products_update" ON products
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "products_delete" ON products
    FOR DELETE USING (true);
-- DELETE mantido pois a página /produtos tem botão de exclusão de produto


-- ── ORDER_ITEMS ──────────────────────────────────────────────────────────────
-- Necessário: SELECT (exibir itens do pedido)
--             INSERT (cliente confirma pedido)
--             UPDATE bloqueado — itens são imutáveis após criação
--             DELETE bloqueado — somente via CASCADE do pedido pai
-- Substitui a política "order_items_allow_all".

DROP POLICY IF EXISTS "order_items_allow_all" ON order_items;

DROP POLICY IF EXISTS "order_items_select" ON order_items;
DROP POLICY IF EXISTS "order_items_insert" ON order_items;

CREATE POLICY "order_items_select" ON order_items
    FOR SELECT USING (true);

CREATE POLICY "order_items_insert" ON order_items
    FOR INSERT WITH CHECK (true);

-- UPDATE e DELETE não declarados → bloqueados pelo RLS
-- (remoção de itens só ocorre via DELETE CASCADE do order pai)


-- ── STORE_SETTINGS ───────────────────────────────────────────────────────────
-- Necessário: SELECT (carregar configurações em todas as telas)
--             INSERT (admin configura loja pela primeira vez)
--             UPDATE (admin salva alterações em /loja)
--             DELETE bloqueado — nunca remover configurações da loja
-- Substitui a política "store_settings_allow_all".

DROP POLICY IF EXISTS "store_settings_allow_all" ON store_settings;

DROP POLICY IF EXISTS "store_settings_select" ON store_settings;
DROP POLICY IF EXISTS "store_settings_insert" ON store_settings;
DROP POLICY IF EXISTS "store_settings_update" ON store_settings;

CREATE POLICY "store_settings_select" ON store_settings
    FOR SELECT USING (true);

CREATE POLICY "store_settings_insert" ON store_settings
    FOR INSERT WITH CHECK (true);

CREATE POLICY "store_settings_update" ON store_settings
    FOR UPDATE USING (true) WITH CHECK (true);

-- DELETE não declarado → bloqueado pelo RLS
