-- ============================================================
-- 026_tenant_lifecycle.sql
--
-- Da a `admins` a nocao de ciclo de vida que ela nunca teve: quem
-- e o dono do sistema, e se uma loja esta liberada para operar.
--
-- Ate aqui nao havia NENHUMA forma de criar tenant pelo codigo -
-- `admins` era preenchida a mao no painel do Supabase, e a aba
-- "Criar conta" de /acesso apenas definia a senha de uma linha que
-- ja existia. Estas colunas sao a base da pagina de contratacao.
--
-- IDEMPOTENTE: rodar de novo nao mexe em quem ja tem valor.
-- ============================================================

ALTER TABLE admins
    ADD COLUMN IF NOT EXISTS role              TEXT NOT NULL DEFAULT 'lojista',
    ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'ativa',
    ADD COLUMN IF NOT EXISTS status_reason     TEXT,
    ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS terms_version     TEXT,
    ADD COLUMN IF NOT EXISTS terms_ip          TEXT;

-- O default e 'ativa', e nao 'pendente', por causa de quem JA esta no
-- banco: com 'pendente' esta migration trancaria o dono para fora do
-- proprio sistema no instante em que rodasse. Quem grava 'pendente' e
-- a rota POST /api/contratar, explicitamente. O default protege o dado
-- existente; o codigo declara a intencao.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admins_role_check') THEN
        ALTER TABLE admins ADD CONSTRAINT admins_role_check
            CHECK (role IN ('owner', 'lojista'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admins_status_check') THEN
        ALTER TABLE admins ADD CONSTRAINT admins_status_check
            CHECK (status IN ('pendente', 'ativa', 'suspensa', 'recusada'));
    END IF;
END $$;

-- A fila do dono lista pendentes por data; o indice evita varrer a
-- tabela inteira quando ela crescer.
CREATE INDEX IF NOT EXISTS admins_status_idx ON admins(status, created_at DESC);

-- ── PASSO MANUAL, OBRIGATORIO ───────────────────────────────
-- Esta migration NAO escolhe o dono. Ela nao tem como saber qual
-- e-mail e o seu, e deduzir "o admin mais antigo" repetiria o chute
-- silencioso que a migration 025 acabou de remover do runtime.
--
-- Rode UMA vez, trocando pelo seu e-mail:
--
--   UPDATE admins SET role = 'owner' WHERE email = 'seu-email@dominio.com';
--
-- Enquanto nenhum admin tiver role='owner', a rota da fila de
-- contratacoes responde erro nomeando este comando. Falha alto, e nao
-- em silencio.
-- ============================================================
