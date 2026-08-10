-- ============================================================
-- 025_store_slug.sql
--
-- Da a cada loja um endereco publico legivel: /loja/deposito-izomar
-- no lugar de /login?admin=5357c3bb-98b5-4beb-a614-14bdce618551.
--
-- Alem de ser impossivel de ditar por telefone, o UUID na URL fazia
-- o cliente que abrisse /login sem o parametro cair na loja mais
-- antiga do sistema, em silencio. O slug e a identidade explicita
-- que permite remover esse palpite.
--
-- O indice unico e o que garante a regra: duas lojas nunca no mesmo
-- endereco. Ele so e criado DEPOIS do backfill, senao o proprio
-- backfill esbarraria nele no meio do caminho.
--
-- IDEMPOTENTE: rodar de novo nao mexe em quem ja tem slug.
-- ============================================================

ALTER TABLE store_settings
    ADD COLUMN IF NOT EXISTS slug TEXT;

-- ── Backfill ────────────────────────────────────────────────
-- Reproduz o slugify() de src/lib/slug.ts em SQL. Nao usamos a
-- extensao unaccent porque ela nao esta instalada e nao vale um
-- CREATE EXTENSION so para um backfill de uma vez.
DO $$
DECLARE
    loja      RECORD;
    base      TEXT;
    candidato TEXT;
    sufixo    TEXT;
    n         INT;
BEGIN
    FOR loja IN
        SELECT id, admin_id, store_name
        FROM store_settings
        WHERE slug IS NULL
        -- Empate de nome: a loja mais antiga fica com o slug limpo,
        -- as seguintes recebem -2, -3. Sem ORDER BY, quem ganha o
        -- nome bom dependeria da ordem fisica das linhas.
        ORDER BY created_at NULLS LAST, id
    LOOP
        base := lower(coalesce(loja.store_name, ''));
        base := translate(
            base,
            'àáâãäåèéêëìíîïòóôõöùúûüçñýÿ',
            'aaaaaaeeeeiiiiooooouuuucnyy'
        );
        base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
        base := regexp_replace(base, '^-+|-+$',   '',  'g');
        base := left(base, 40);
        base := regexp_replace(base, '-+$', '', 'g');

        -- Sem nome utilizavel (vazio, curto demais, ou uma palavra
        -- reservada que colidiria com rota sob /loja/): cai no
        -- identificador tecnico, que e feio mas sempre funciona.
        IF length(base) < 3
           OR base IN ('publica', 'api', 'admin', 'null', 'undefined', 'new', 'edit')
        THEN
            base := 'loja-' || left(replace(coalesce(loja.admin_id, loja.id)::text, '-', ''), 8);
        END IF;

        candidato := base;
        n         := 1;

        WHILE EXISTS (SELECT 1 FROM store_settings WHERE slug = candidato) LOOP
            n         := n + 1;
            sufixo    := '-' || n;
            -- Encurta a base para o sufixo caber nos 40 caracteres.
            candidato := regexp_replace(left(base, 40 - length(sufixo)), '-+$', '', 'g') || sufixo;
        END LOOP;

        UPDATE store_settings SET slug = candidato WHERE id = loja.id;
        RAISE NOTICE 'loja % -> slug %', loja.id, candidato;
    END LOOP;
END $$;

-- Cinto e suspensorio: se alguma linha escapou do backfill, e melhor
-- a migration falhar aqui do que a coluna virar NOT NULL mais tarde
-- com dado faltando, ou o /loja/<slug> nao achar uma loja existente.
DO $$
DECLARE
    faltando INT;
BEGIN
    SELECT count(*) INTO faltando FROM store_settings WHERE slug IS NULL;
    IF faltando > 0 THEN
        RAISE EXCEPTION 'backfill incompleto: % loja(s) ainda sem slug', faltando;
    END IF;
END $$;

-- A coluna continua NULLABLE de proposito: uma loja recem-criada existe
-- por um instante antes de escolher o endereco. No Postgres varios NULLs
-- convivem num indice unico, entao isso nao enfraquece a regra.
CREATE UNIQUE INDEX IF NOT EXISTS store_settings_slug_key ON store_settings(slug);
