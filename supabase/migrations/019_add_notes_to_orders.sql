-- supabase/migrations/019_add_notes_to_orders.sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
