-- Fix the skip movements function - available_quantity is a generated column
CREATE OR REPLACE FUNCTION update_inventory_skip_movements(
    p_store_id UUID,
    p_product_id UUID,
    p_quantity INTEGER
)
RETURNS VOID AS $$
BEGIN
    -- Set session variable to skip movement logging
    PERFORM set_config('app.skip_inventory_movements', 'true', true);
    
    -- Update or insert inventory record (available_quantity is auto-calculated)
    INSERT INTO current_inventory (store_id, product_id, quantity)
    VALUES (p_store_id, p_product_id, p_quantity)
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET 
        quantity = p_quantity,
        last_updated = NOW();
    
    -- Reset session variable
    PERFORM set_config('app.skip_inventory_movements', 'false', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;