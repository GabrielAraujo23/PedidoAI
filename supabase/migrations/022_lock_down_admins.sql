-- ============================================================
-- 022_lock_down_admins.sql
--
-- URGENTE. A tabela admins tinha policies "USING (true)", e a
-- anon key fica no bundle JavaScript publico. Na pratica qualquer
-- visitante conseguia:
--   SELECT email, password_hash, reset_token FROM admins;
-- ou seja, hash de senha para quebrar offline e o token de reset
-- para tomar a conta.
--
-- Nenhum codigo de navegador le a tabela admins: os unicos
-- consumidores sao /api/auth/admin e /api/auth/client, que usam a
-- service role key (server-only). A service role ignora RLS, entao
-- remover todo acesso de anon/authenticated nao quebra o login.
-- ============================================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select" ON admins;
DROP POLICY IF EXISTS "admins_insert" ON admins;
DROP POLICY IF EXISTS "admins_update" ON admins;

-- Sem nenhuma policy declarada e com RLS ligado, todo acesso via
-- anon/authenticated e negado por padrao. Somente a service role passa.

-- Cinto e suspensorio: revoga os grants de tabela para os papeis
-- publicos, para o caso de o RLS ser desativado por engano no futuro.
REVOKE ALL ON admins FROM anon, authenticated;
