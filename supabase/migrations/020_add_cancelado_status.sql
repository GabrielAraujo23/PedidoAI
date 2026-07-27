-- Add 'cancelado' to the orders.status CHECK constraint
-- The inline CHECK from migration 001 was auto-named by Postgres.
-- We drop it by name and re-create it with the expanded set.

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN ('novo', 'confirmado', 'rota', 'entregue', 'cancelado'));
