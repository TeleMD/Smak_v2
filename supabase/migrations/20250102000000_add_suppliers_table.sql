-- Create suppliers table and column mappings for enhanced supplier delivery functionality
-- This migration adds suppliers management and predefined column mappings

-- =====================================================
-- SUPPLIERS TABLE
-- =====================================================

-- Create suppliers table to store supplier information and column mappings
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50) UNIQUE,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    -- Column mappings for CSV imports
    barcode_columns JSONB DEFAULT '["barcode", "EANNummer"]'::jsonb,
    name_columns JSONB DEFAULT '["name", "Bezeichnung1"]'::jsonb,
    quantity_columns JSONB DEFAULT '["quantity", "Menge"]'::jsonb,
    price_columns JSONB DEFAULT '["price", "cost", "Einzelpreis"]'::jsonb,
    category_columns JSONB DEFAULT '["category"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);

-- Enable RLS for suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for suppliers
CREATE POLICY "Authenticated users can view suppliers" ON suppliers
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify suppliers" ON suppliers
    FOR ALL USING (auth.role() = 'authenticated');

-- Add trigger for updated_at
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SUPPLIER COLUMN MAPPINGS SETUP
-- =====================================================

-- Insert predefined suppliers with their column mappings
INSERT INTO suppliers (name, code, barcode_columns, name_columns, quantity_columns, price_columns, category_columns, notes) VALUES 
(
    'Monolit', 
    'MONOLIT',
    '["EANNummer", "barcode", "ean"]'::jsonb,
    '["Bezeichnung1", "name", "product_name"]'::jsonb,
    '["Menge", "quantity", "qty"]'::jsonb,
    '["Einzelpreis", "price", "unit_price", "cost"]'::jsonb,
    '["category", "type"]'::jsonb,
    'German food supplier with EAN numbering system'
)
ON CONFLICT (name) DO UPDATE SET
    barcode_columns = EXCLUDED.barcode_columns,
    name_columns = EXCLUDED.name_columns,
    quantity_columns = EXCLUDED.quantity_columns,
    price_columns = EXCLUDED.price_columns,
    category_columns = EXCLUDED.category_columns,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- Add more common suppliers
INSERT INTO suppliers (name, code, barcode_columns, name_columns, quantity_columns, price_columns, category_columns, notes) VALUES 
(
    'Generic Supplier', 
    'GENERIC',
    '["barcode", "sku", "code", "product_code"]'::jsonb,
    '["name", "product_name", "title", "item_name"]'::jsonb,
    '["quantity", "qty", "stock", "count"]'::jsonb,
    '["price", "unit_price", "cost", "unit_cost"]'::jsonb,
    '["category", "type", "group"]'::jsonb,
    'Default mapping for standard CSV formats'
)
ON CONFLICT (name) DO UPDATE SET
    barcode_columns = EXCLUDED.barcode_columns,
    name_columns = EXCLUDED.name_columns,
    quantity_columns = EXCLUDED.quantity_columns,
    price_columns = EXCLUDED.price_columns,
    category_columns = EXCLUDED.category_columns,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- =====================================================
-- UPDATE STOCK RECEIPTS TABLE
-- =====================================================

-- Add supplier_id foreign key to existing stock_receipts table
ALTER TABLE stock_receipts 
ADD COLUMN IF NOT EXISTS supplier_id_new UUID REFERENCES suppliers(id);

-- Migrate existing supplier names to supplier_id references
DO $$
DECLARE 
    receipt_record RECORD;
    supplier_record RECORD;
BEGIN
    FOR receipt_record IN 
        SELECT id, supplier_name FROM stock_receipts 
        WHERE supplier_id_new IS NULL AND supplier_name IS NOT NULL
    LOOP
        -- Try to find matching supplier by name
        SELECT id INTO supplier_record 
        FROM suppliers 
        WHERE name ILIKE receipt_record.supplier_name 
        LIMIT 1;
        
        IF FOUND THEN
            UPDATE stock_receipts 
            SET supplier_id_new = supplier_record.id 
            WHERE id = receipt_record.id;
        ELSE
            -- Create new supplier if not found
            INSERT INTO suppliers (name, code) 
            VALUES (receipt_record.supplier_name, UPPER(REPLACE(receipt_record.supplier_name, ' ', '_')))
            ON CONFLICT (name) DO NOTHING
            RETURNING id INTO supplier_record;
            
            IF FOUND THEN
                UPDATE stock_receipts 
                SET supplier_id_new = supplier_record.id 
                WHERE id = receipt_record.id;
            END IF;
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- NEW PRODUCTS TRACKING
-- =====================================================

-- Create table to track newly added products from supplier deliveries
CREATE TABLE IF NOT EXISTS new_products_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id),
    receipt_id UUID REFERENCES stock_receipts(id),
    barcode VARCHAR(100),
    name VARCHAR(255),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    exported_at TIMESTAMP WITH TIME ZONE,
    is_exported BOOLEAN DEFAULT false
);

-- Create indexes for new products log
CREATE INDEX IF NOT EXISTS idx_new_products_log_product_id ON new_products_log(product_id);
CREATE INDEX IF NOT EXISTS idx_new_products_log_supplier_id ON new_products_log(supplier_id);
CREATE INDEX IF NOT EXISTS idx_new_products_log_receipt_id ON new_products_log(receipt_id);
CREATE INDEX IF NOT EXISTS idx_new_products_log_detected_at ON new_products_log(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_new_products_log_is_exported ON new_products_log(is_exported);

-- Enable RLS for new products log
ALTER TABLE new_products_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for new products log
CREATE POLICY "Authenticated users can view new products log" ON new_products_log
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify new products log" ON new_products_log
    FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- FUNCTIONS FOR SUPPLIER DELIVERY PROCESSING
-- =====================================================

-- Function to get supplier column mapping
CREATE OR REPLACE FUNCTION get_supplier_column_mapping(
    p_supplier_id UUID,
    p_column_type TEXT
) RETURNS TEXT[] AS $$
DECLARE
    mapping_result JSONB;
    columns_array TEXT[];
BEGIN
    SELECT 
        CASE p_column_type
            WHEN 'barcode' THEN barcode_columns
            WHEN 'name' THEN name_columns
            WHEN 'quantity' THEN quantity_columns
            WHEN 'price' THEN price_columns
            WHEN 'category' THEN category_columns
            ELSE '[]'::jsonb
        END INTO mapping_result
    FROM suppliers 
    WHERE id = p_supplier_id AND is_active = true;
    
    IF mapping_result IS NULL THEN
        RETURN ARRAY[]::TEXT[];
    END IF;
    
    SELECT ARRAY(SELECT jsonb_array_elements_text(mapping_result)) INTO columns_array;
    RETURN columns_array;
END;
$$ LANGUAGE plpgsql;

-- Function to export new products as CSV data
CREATE OR REPLACE FUNCTION export_new_products_csv(
    p_supplier_id UUID DEFAULT NULL,
    p_receipt_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 1000
) RETURNS TABLE (
    barcode TEXT,
    name TEXT,
    supplier_name TEXT,
    detected_at TIMESTAMP WITH TIME ZONE,
    product_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        npl.barcode::TEXT,
        npl.name::TEXT,
        s.name::TEXT as supplier_name,
        npl.detected_at,
        npl.product_id
    FROM new_products_log npl
    LEFT JOIN suppliers s ON npl.supplier_id = s.id
    WHERE 
        (p_supplier_id IS NULL OR npl.supplier_id = p_supplier_id)
        AND (p_receipt_id IS NULL OR npl.receipt_id = p_receipt_id)
        AND npl.is_exported = false
    ORDER BY npl.detected_at DESC
    LIMIT p_limit;
    
    -- Mark exported products
    UPDATE new_products_log 
    SET is_exported = true, exported_at = NOW()
    WHERE 
        (p_supplier_id IS NULL OR supplier_id = p_supplier_id)
        AND (p_receipt_id IS NULL OR receipt_id = p_receipt_id)
        AND is_exported = false;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE suppliers IS 'Supplier information with CSV column mappings for automated processing';
COMMENT ON TABLE new_products_log IS 'Track newly created products from supplier deliveries for export';
COMMENT ON FUNCTION get_supplier_column_mapping IS 'Get column mapping for a specific supplier and column type';
COMMENT ON FUNCTION export_new_products_csv IS 'Export new products data and mark as exported';
