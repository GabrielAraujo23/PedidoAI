-- ============================================================
-- 029_paleta_tenant.sql
--
-- Cor da loja: a familia de fundo (lista curada) e o acento.
--
-- accent_color nasce NULO, e nao com o laranja atual do produto.
-- Nulo significa "nunca escolheu". Gravar o laranja explicitamente
-- faria toda loja existente parecer ter escolhido essa cor - e
-- mudar o padrao do produto no futuro deixaria de alcanca-las.
--
-- O CHECK existe porque familia invalida no banco viraria loja sem
-- cor nenhuma: o codigo cai no padrao, mas em silencio, e o lojista
-- veria a escolha dele sumir sem explicacao.
--
-- IDEMPOTENTE.
-- ============================================================

ALTER TABLE store_settings
    ADD COLUMN IF NOT EXISTS palette_family TEXT NOT NULL DEFAULT 'creme',
    ADD COLUMN IF NOT EXISTS accent_color   TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_palette_family_check') THEN
        ALTER TABLE store_settings ADD CONSTRAINT store_settings_palette_family_check
            CHECK (palette_family IN ('creme', 'neve', 'areia', 'grafite'));
    END IF;

    -- #RRGGBB ou nulo. Sem isto, um valor como "azul" chegaria ao CSS
    -- e o navegador ignoraria em silencio, deixando a cor anterior.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_accent_color_check') THEN
        ALTER TABLE store_settings ADD CONSTRAINT store_settings_accent_color_check
            CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$');
    END IF;
END $$;
