-- Store location + delivery radius
ALTER TABLE store_settings
    ADD COLUMN IF NOT EXISTS latitude          NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS longitude         NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS delivery_radius_km NUMERIC(5,2) DEFAULT 20;

-- Structured delivery address + delivery info on orders
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS cep          TEXT,
    ADD COLUMN IF NOT EXISTS street       TEXT,
    ADD COLUMN IF NOT EXISTS number       TEXT,
    ADD COLUMN IF NOT EXISTS complement   TEXT,
    ADD COLUMN IF NOT EXISTS neighborhood TEXT,
    ADD COLUMN IF NOT EXISTS city         TEXT,
    ADD COLUMN IF NOT EXISTS state        TEXT,
    ADD COLUMN IF NOT EXISTS distance_km  NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2);
