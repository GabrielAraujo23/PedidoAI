-- ============================================================
-- 024_rls_deny_all_anon.sql
--
-- Fecha o acesso direto ao banco a partir do navegador.
--
-- Ate aqui todas as policies eram "USING (true)". Como a anon key
-- vai no bundle JavaScript publico, qualquer visitante conseguia
-- ler clients, orders, products e store_settings de TODAS as lojas,
-- e ainda inserir, alterar e apagar produtos.
--
-- PRE-REQUISITO: o codigo da Fase 0 precisa estar em producao.
-- Nenhuma tela consulta mais o Postgres direto; tudo passa por
-- rotas de API que usam a service role e derivam o admin_id do
-- cookie de sessao assinado. A service role ignora RLS, entao
-- remover o acesso de anon/authenticated nao afeta o app.
--
-- O QUE NAO E AFETADO:
--   - Supabase Storage (bucket store-logos): politicas proprias,
--     o upload de logo continua funcionando.
--   - admins: ja foi fechada na migration 022.
--
-- ROLLBACK: em caso de emergencia, reabrir uma tabela especifica com
--   CREATE POLICY "<tabela>_tmp" ON <tabela> FOR ALL USING (true) WITH CHECK (true);
--   GRANT ALL ON <tabela> TO anon, authenticated;
-- ============================================================

DO $$
DECLARE
    t   TEXT;
    pol RECORD;
    tabelas TEXT[] := ARRAY[
        'orders', 'clients', 'products', 'order_items',
        'store_settings', 'stock_movements', 'nfe_imports', 'audit_log'
    ];
BEGIN
    FOREACH t IN ARRAY tabelas LOOP
        -- Pula tabelas que ainda nao existem neste ambiente.
        IF to_regclass(t) IS NULL THEN
            RAISE NOTICE 'tabela % nao existe, pulando', t;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

        -- Remove todas as policies existentes da tabela. Sem nenhuma
        -- policy e com RLS ligado, anon/authenticated ficam sem acesso.
        FOR pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY %I ON %I', pol.policyname, t);
        END LOOP;

        -- Cinto e suspensorio: revoga os grants de tabela, para o caso
        -- de alguem desabilitar o RLS por engano no futuro.
        EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);

        RAISE NOTICE 'tabela % fechada para anon/authenticated', t;
    END LOOP;
END $$;
