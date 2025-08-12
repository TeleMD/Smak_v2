-- Manage shops: Add Shop Demo and remove old shops
-- This migration adds Shop Demo (similar to Kalina) and removes Main Store, North Branch, South Branch

-- First, delete the old shops (this will cascade to related data due to ON DELETE CASCADE)
DELETE FROM stores WHERE name IN ('Main Store', 'North Branch', 'South Branch');

-- Insert Shop Demo store
INSERT INTO stores (name, address, is_active) VALUES 
('Shop Demo', 'Shop Demo Location', true)
ON CONFLICT (name) DO UPDATE SET 
    address = EXCLUDED.address,
    is_active = EXCLUDED.is_active;

-- Get Shop Demo store ID and set up CSV mappings (similar to Kalina)
DO $$
DECLARE
    shop_demo_store_id UUID;
BEGIN
    -- Get Shop Demo store ID
    SELECT id INTO shop_demo_store_id FROM stores WHERE name = 'Shop Demo';
    
    -- Insert CSV mapping for Shop Demo current stock uploads
    INSERT INTO store_csv_mappings (
        store_id, 
        mapping_name, 
        barcode_columns, 
        name_columns, 
        quantity_columns,
        price_columns,
        category_columns
    ) VALUES (
        shop_demo_store_id,
        'current_stock',
        ARRAY['Barcode', 'barcode'],
        ARRAY['Item name', 'item_name', 'name', 'product_name'],
        ARRAY['Quantity', 'quantity', 'qty'],
        ARRAY['Price', 'price', 'unit_price'],
        ARRAY['Category', 'category', 'type']
    ) ON CONFLICT (store_id, mapping_name) DO UPDATE SET
        barcode_columns = EXCLUDED.barcode_columns,
        name_columns = EXCLUDED.name_columns,
        quantity_columns = EXCLUDED.quantity_columns,
        price_columns = EXCLUDED.price_columns,
        category_columns = EXCLUDED.category_columns,
        updated_at = NOW();
        
    -- Insert CSV mapping for Shop Demo supplier delivery uploads  
    INSERT INTO store_csv_mappings (
        store_id,
        mapping_name,
        barcode_columns,
        name_columns,
        quantity_columns,
        price_columns,
        category_columns
    ) VALUES (
        shop_demo_store_id,
        'supplier_delivery',
        ARRAY['Barcode', 'barcode'],
        ARRAY['Item name', 'item_name', 'name', 'product_name'],
        ARRAY['Quantity', 'quantity', 'qty', 'delivered_qty'],
        ARRAY['Unit Cost', 'unit_cost', 'cost', 'price'],
        ARRAY['Category', 'category', 'type']
    ) ON CONFLICT (store_id, mapping_name) DO UPDATE SET
        barcode_columns = EXCLUDED.barcode_columns,
        name_columns = EXCLUDED.name_columns,
        quantity_columns = EXCLUDED.quantity_columns,
        price_columns = EXCLUDED.price_columns,
        category_columns = EXCLUDED.category_columns,
        updated_at = NOW();
END
$$;