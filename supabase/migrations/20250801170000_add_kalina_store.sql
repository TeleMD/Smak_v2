-- Add Kalina store with specific CSV mapping configuration
-- This migration adds the Kalina store and sets up its CSV column mappings

-- Insert Kalina store
INSERT INTO stores (name, address, is_active) VALUES 
('Kalina', 'Kalina Shop Location', true)
ON CONFLICT (name) DO UPDATE SET 
    address = EXCLUDED.address,
    is_active = EXCLUDED.is_active;

-- Create a table to store store-specific CSV column mappings
CREATE TABLE IF NOT EXISTS store_csv_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    mapping_name VARCHAR(100) NOT NULL, -- e.g., 'current_stock', 'supplier_delivery'
    barcode_columns TEXT[] NOT NULL, -- Array of possible barcode column names
    name_columns TEXT[] NOT NULL, -- Array of possible product name column names
    quantity_columns TEXT[] NOT NULL, -- Array of possible quantity column names
    price_columns TEXT[], -- Array of possible price column names (optional)
    category_columns TEXT[], -- Array of possible category column names (optional)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(store_id, mapping_name)
);

-- Get Kalina store ID for the mappings
DO $$
DECLARE
    kalina_store_id UUID;
BEGIN
    -- Get Kalina store ID
    SELECT id INTO kalina_store_id FROM stores WHERE name = 'Kalina';
    
    -- Insert CSV mapping for Kalina current stock uploads
    INSERT INTO store_csv_mappings (
        store_id, 
        mapping_name, 
        barcode_columns, 
        name_columns, 
        quantity_columns,
        price_columns,
        category_columns
    ) VALUES (
        kalina_store_id,
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
        
    -- Insert CSV mapping for Kalina supplier delivery uploads  
    INSERT INTO store_csv_mappings (
        store_id,
        mapping_name,
        barcode_columns,
        name_columns,
        quantity_columns,
        price_columns,
        category_columns
    ) VALUES (
        kalina_store_id,
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

-- Add RLS policies for the new table
ALTER TABLE store_csv_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view store CSV mappings" ON store_csv_mappings
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify store CSV mappings" ON store_csv_mappings
    FOR ALL USING (auth.role() = 'authenticated');

-- Create indexes
CREATE INDEX idx_store_csv_mappings_store_id ON store_csv_mappings(store_id);
CREATE INDEX idx_store_csv_mappings_mapping_name ON store_csv_mappings(mapping_name);

COMMENT ON TABLE store_csv_mappings IS 'Store-specific CSV column mapping configurations';