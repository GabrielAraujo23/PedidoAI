-- Structured address fields on clients
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS cep          TEXT,
    ADD COLUMN IF NOT EXISTS street       TEXT,
    ADD COLUMN IF NOT EXISTS number       TEXT,
    ADD COLUMN IF NOT EXISTS complement   TEXT,
    ADD COLUMN IF NOT EXISTS neighborhood TEXT,
    ADD COLUMN IF NOT EXISTS city         TEXT,
    ADD COLUMN IF NOT EXISTS state        TEXT,
    ADD COLUMN IF NOT EXISTS latitude     NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS longitude    NUMERIC(10,7);
