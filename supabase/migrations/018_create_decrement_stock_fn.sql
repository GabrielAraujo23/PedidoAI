-- supabase/migrations/018_create_decrement_stock_fn.sql
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS INTEGER AS $$
DECLARE
    new_qty INTEGER;
BEGIN
    UPDATE products
    SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0)
    WHERE id = p_product_id
    RETURNING stock_quantity INTO new_qty;
    RETURN new_qty;
END;
$$ LANGUAGE plpgsql;
