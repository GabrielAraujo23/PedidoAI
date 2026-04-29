-- Garante que a coluna `description` existe na tabela products.
-- A migration 006 já criava essa coluna, mas algumas instâncias antigas
-- foram criadas antes dela. Este comando é idempotente.

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS description TEXT;

-- Força o PostgREST a recarregar o schema cache para que a API enxergue
-- a coluna imediatamente (sem precisar reiniciar o projeto).
NOTIFY pgrst, 'reload schema';
