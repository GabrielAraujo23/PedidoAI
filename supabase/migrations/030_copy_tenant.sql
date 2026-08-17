-- ============================================================
-- 030_copy_tenant.sql
--
-- Texto da loja: overrides do padrão, um por tenant.
--
-- A coluna é JSONB em vez de tabela separada porque:
-- - Poucas centenas de pares por loja (123 chaves × múltiplas lojas)
-- - Sempre lidos/escritos como um todo inteiro
-- - Sem queries complexas sobre os pares
--
-- NOT NULL DEFAULT '{}' de propósito: com null permitido, null e {}
-- significariam a mesma coisa (nenhum override), e todo leitor teria
-- de tratar os dois casos. Fixamos em '{}' para um único caminho feliz.
--
-- IDEMPOTENTE.
-- ============================================================

ALTER TABLE store_settings
    ADD COLUMN IF NOT EXISTS copy_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
