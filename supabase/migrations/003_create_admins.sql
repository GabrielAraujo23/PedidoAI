-- Tabela de administradores do PedidoAI
-- Funciona como whitelist: apenas emails presentes aqui têm acesso ao painel admin.
-- O login em si usa Supabase Auth (email + senha). Esta tabela valida a autorização.

CREATE TABLE IF NOT EXISTS admins (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT        UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: desabilitar por enquanto (app usa service role / anon key com RLS desativado)
-- Em produção, habilitar RLS e restringir acesso apenas a usuários autenticados.
