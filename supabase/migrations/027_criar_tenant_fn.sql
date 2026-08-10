-- ============================================================
-- 027_criar_tenant_fn.sql
--
-- Cria admin + store_settings numa unica transacao.
--
-- POR QUE UMA FUNCAO E NAO DOIS INSERTS NA ROTA:
-- o supabase-js nao tem transacao entre duas chamadas. Se o insert de
-- store_settings falhasse depois do de admins, sobraria uma conta orfa
-- - que e exatamente o estado quebrado ja presente neste banco: um
-- admin sem loja, sem slug e sem link publico, que entrou no painel e
-- encontrou o sistema vazio. Mesmo padrao da migration 018.
-- ============================================================

CREATE OR REPLACE FUNCTION criar_tenant(
    p_email         TEXT,
    p_password_hash TEXT,
    p_store_name    TEXT,
    p_cnpj          TEXT,
    p_phone         TEXT,
    p_address       TEXT,
    p_slug          TEXT,
    p_terms_version TEXT,
    p_terms_ip      TEXT
) RETURNS UUID AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    IF p_email IS NULL OR btrim(p_email) = '' THEN
        RAISE EXCEPTION 'criar_tenant: email obrigatorio';
    END IF;
    IF p_password_hash IS NULL OR btrim(p_password_hash) = '' THEN
        RAISE EXCEPTION 'criar_tenant: password_hash obrigatorio';
    END IF;
    IF p_slug IS NULL OR btrim(p_slug) = '' THEN
        RAISE EXCEPTION 'criar_tenant: slug obrigatorio';
    END IF;

    INSERT INTO admins (
        email, password_hash, role, status, status_changed_at,
        terms_accepted_at, terms_version, terms_ip
    ) VALUES (
        lower(btrim(p_email)), p_password_hash, 'lojista', 'pendente', NOW(),
        NOW(), p_terms_version, p_terms_ip
    )
    RETURNING id INTO v_admin_id;

    INSERT INTO store_settings (admin_id, store_name, cnpj, phone, address, slug)
    VALUES (v_admin_id, p_store_name, p_cnpj, p_phone, p_address, p_slug);

    RETURN v_admin_id;
END;
$$ LANGUAGE plpgsql;

-- A anon key fica no bundle JavaScript publico. Sem este REVOKE,
-- qualquer visitante chamaria a RPC direto e criaria contas passando
-- por cima da rota - que e onde moram o rate limit, o CSRF e a
-- validacao. A migration 022 fechou a tabela; isto fecha a funcao.
REVOKE EXECUTE ON FUNCTION criar_tenant(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon, authenticated, PUBLIC;
