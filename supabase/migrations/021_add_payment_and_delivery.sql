-- Forma de pagamento e tipo de entrega no pedido (usados na mensagem do WhatsApp)

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS delivery_type  TEXT;

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE orders
    ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('pix', 'credito', 'debito', 'dinheiro'));

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_delivery_type_check;

ALTER TABLE orders
    ADD CONSTRAINT orders_delivery_type_check
    CHECK (delivery_type IS NULL OR delivery_type IN ('delivery', 'retirada'));

-- Estimativa de entrega configurável por loja
ALTER TABLE store_settings
    ADD COLUMN IF NOT EXISTS delivery_time_min INT DEFAULT 40,
    ADD COLUMN IF NOT EXISTS delivery_time_max INT DEFAULT 60;

-- DEFAULT não preenche linhas já existentes
UPDATE store_settings SET delivery_time_min = 40 WHERE delivery_time_min IS NULL;
UPDATE store_settings SET delivery_time_max = 60 WHERE delivery_time_max IS NULL;
