-- Adiciona colunas de senha criptografada e recuperação de senha à tabela admins
-- A senha é armazenada como PBKDF2 + salt (formato "saltHex:hashHex")

ALTER TABLE admins
    ADD COLUMN IF NOT EXISTS password_hash  TEXT,
    ADD COLUMN IF NOT EXISTS reset_token    TEXT,
    ADD COLUMN IF NOT EXISTS reset_expires  TIMESTAMPTZ;
