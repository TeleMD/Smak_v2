-- Add missing process_stock_receipt function to update inventory from stock receipts

-- Function to process stock receipt and update current inventory
CREATE OR REPLACE FUNCTION process_stock_receipt(
    p_receipt_id UUID
)
RETURNS VOID AS $$
DECLARE
    receipt_record RECORD;
    item_record RECORD;
    current_qty INTEGER;
BEGIN
    -- Get receipt details
    SELECT store_id, status INTO receipt_record 
    FROM stock_receipts 
    WHERE id = p_receipt_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock receipt not found: %', p_receipt_id;
    END IF;
    
    -- Only process if receipt is pending
    IF receipt_record.status != 'pending' THEN
        RAISE EXCEPTION 'Stock receipt already processed or cancelled';
    END IF;
    
    -- Update receipt status to processing
    UPDATE stock_receipts 
    SET status = 'processing' 
    WHERE id = p_receipt_id;
    
    -- Process each receipt item
    FOR item_record IN 
        SELECT product_id, quantity, unit_cost
        FROM stock_receipt_items 
        WHERE receipt_id = p_receipt_id
    LOOP
        -- Get current inventory quantity (default to 0 if not exists)
        SELECT COALESCE(quantity, 0) INTO current_qty
        FROM current_inventory 
        WHERE store_id = receipt_record.store_id 
        AND product_id = item_record.product_id;
        
        IF NOT FOUND THEN
            current_qty := 0;
        END IF;
        
        -- Update or insert inventory record (add delivery quantity to current stock)
        INSERT INTO current_inventory (store_id, product_id, quantity, reserved_quantity)
        VALUES (receipt_record.store_id, item_record.product_id, current_qty + item_record.quantity, 0)
        ON CONFLICT (store_id, product_id)
        DO UPDATE SET 
            quantity = current_inventory.quantity + item_record.quantity,
            last_updated = NOW();
        
        -- Log inventory movement
        INSERT INTO inventory_movements (
            store_id,
            product_id,
            movement_type,
            quantity_change,
            previous_quantity,
            new_quantity,
            reference_id,
            reference_type,
            unit_cost,
            notes,
            created_by
        ) VALUES (
            receipt_record.store_id,
            item_record.product_id,
            'receipt',
            item_record.quantity,
            current_qty,
            current_qty + item_record.quantity,
            p_receipt_id,
            'stock_receipt',
            item_record.unit_cost,
            'Supplier delivery processed',
            auth.uid()
        );
    END LOOP;
    
    -- Update receipt status to completed
    UPDATE stock_receipts 
    SET 
        status = 'completed',
        processed_at = NOW()
    WHERE id = p_receipt_id;
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION process_stock_receipt IS 'Process supplier delivery receipt and update inventory levels';
