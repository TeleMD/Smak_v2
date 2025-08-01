-- Smak v2 Database Schema
-- Enhanced multi-location inventory management with real-time tracking

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CORE ENTITIES
-- =====================================================

-- Stores table (enhanced from v1 shops)
CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    shopify_location_id BIGINT UNIQUE,
    pos_system_id VARCHAR(100),
    address TEXT,
    phone VARCHAR(50),
    manager_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table (centralized product catalog)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    shopify_product_id BIGINT,
    shopify_variant_id BIGINT,
    category VARCHAR(100),
    unit_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    supplier_sku VARCHAR(100),
    min_stock_level INTEGER DEFAULT 0,
    max_stock_level INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- CURRENT INVENTORY TRACKING
-- =====================================================

-- Current inventory levels per store
CREATE TABLE current_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    available_quantity INTEGER GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_counted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(store_id, product_id)
);

-- =====================================================
-- STOCK RECEIPTS (Supplier Deliveries)
-- =====================================================

-- Stock receipts header
CREATE TABLE stock_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    receipt_number VARCHAR(100),
    supplier_name VARCHAR(255) NOT NULL,
    supplier_id UUID, -- Link to suppliers table if exists
    receipt_date DATE NOT NULL,
    expected_delivery_date DATE,
    total_items INTEGER DEFAULT 0,
    total_cost DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Stock receipt line items
CREATE TABLE stock_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID REFERENCES stock_receipts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10,2),
    total_cost DECIMAL(12,2) GENERATED ALWAYS AS (quantity * COALESCE(unit_cost, 0)) STORED,
    batch_number VARCHAR(100),
    expiry_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- SALES TRANSACTIONS
-- =====================================================

-- Sales transactions (both online and offline)
CREATE TABLE sales_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('offline', 'online')),
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
    pos_transaction_id VARCHAR(100),
    shopify_order_id BIGINT,
    shopify_order_number VARCHAR(100),
    total_amount DECIMAL(10,2),
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    customer_id VARCHAR(100),
    customer_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
    payment_method VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sales transaction line items
CREATE TABLE sales_transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES sales_transactions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    variant_title VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- AUDIT TRAIL
-- =====================================================

-- Comprehensive inventory movements log
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
        'receipt', 'sale_offline', 'sale_online', 'adjustment', 
        'return', 'transfer_in', 'transfer_out', 'shrinkage'
    )),
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reference_id UUID, -- Links to receipt_id, transaction_id, etc.
    reference_type VARCHAR(50), -- 'stock_receipt', 'sales_transaction', 'manual_adjustment'
    unit_cost DECIMAL(10,2),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- SYNC JOB MANAGEMENT
-- =====================================================

-- Enhanced sync jobs for various operations
CREATE TABLE sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN (
        'export_to_pos', 'export_to_shopify', 'import_sales', 
        'import_receipts', 'sync_inventory', 'data_migration'
    )),
    store_id UUID REFERENCES stores(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    total_records INTEGER DEFAULT 0,
    processed_records INTEGER DEFAULT 0,
    successful_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    error_message TEXT,
    file_path VARCHAR(500),
    result_file_path VARCHAR(500),
    job_data JSONB, -- Store additional job parameters
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- LEGACY COMPATIBILITY (V1 MIGRATION SUPPORT)
-- =====================================================

-- V1 processing logs (for data migration)
CREATE TABLE v1_processing_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    v1_log_id UUID, -- Reference to original v1 log
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id),
    sync_mode VARCHAR(50),
    file1_name TEXT,
    file2_name TEXT,
    total_products INTEGER DEFAULT 0,
    successful_updates INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    processing_status VARCHAR(50),
    generated_csv_url TEXT,
    migrated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Store indexes
CREATE INDEX idx_stores_name ON stores(name);
CREATE INDEX idx_stores_shopify_location_id ON stores(shopify_location_id);
CREATE INDEX idx_stores_is_active ON stores(is_active);

-- Product indexes
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_shopify_variant_id ON products(shopify_variant_id);
CREATE INDEX idx_products_is_active ON products(is_active);

-- Current inventory indexes
CREATE INDEX idx_current_inventory_store_id ON current_inventory(store_id);
CREATE INDEX idx_current_inventory_product_id ON current_inventory(product_id);
CREATE INDEX idx_current_inventory_quantity ON current_inventory(quantity);
CREATE INDEX idx_current_inventory_available_quantity ON current_inventory(available_quantity);

-- Stock receipt indexes
CREATE INDEX idx_stock_receipts_store_id ON stock_receipts(store_id);
CREATE INDEX idx_stock_receipts_receipt_date ON stock_receipts(receipt_date DESC);
CREATE INDEX idx_stock_receipts_status ON stock_receipts(status);
CREATE INDEX idx_stock_receipt_items_receipt_id ON stock_receipt_items(receipt_id);
CREATE INDEX idx_stock_receipt_items_product_id ON stock_receipt_items(product_id);

-- Sales transaction indexes
CREATE INDEX idx_sales_transactions_store_id ON sales_transactions(store_id);
CREATE INDEX idx_sales_transactions_date ON sales_transactions(transaction_date DESC);
CREATE INDEX idx_sales_transactions_type ON sales_transactions(transaction_type);
CREATE INDEX idx_sales_transactions_shopify_order_id ON sales_transactions(shopify_order_id);
CREATE INDEX idx_sales_transaction_items_transaction_id ON sales_transaction_items(transaction_id);
CREATE INDEX idx_sales_transaction_items_product_id ON sales_transaction_items(product_id);

-- Inventory movement indexes
CREATE INDEX idx_inventory_movements_store_id ON inventory_movements(store_id);
CREATE INDEX idx_inventory_movements_product_id ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX idx_inventory_movements_created_at ON inventory_movements(created_at DESC);
CREATE INDEX idx_inventory_movements_reference ON inventory_movements(reference_id, reference_type);

-- Sync job indexes
CREATE INDEX idx_sync_jobs_type ON sync_jobs(job_type);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX idx_sync_jobs_created_at ON sync_jobs(created_at DESC);
CREATE INDEX idx_sync_jobs_store_id ON sync_jobs(store_id);

-- =====================================================
-- TRIGGERS FOR AUTOMATION
-- =====================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inventory movement trigger function
CREATE OR REPLACE FUNCTION log_inventory_movement()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if quantity actually changed
    IF (TG_OP = 'UPDATE' AND OLD.quantity != NEW.quantity) OR TG_OP = 'INSERT' THEN
        -- Skip logging for current stock uploads (check for a special session variable)
        IF current_setting('app.skip_inventory_movements', true) = 'true' THEN
            -- Update last_updated timestamp but skip movement logging
            NEW.last_updated = NOW();
            RETURN NEW;
        END IF;
        
        INSERT INTO inventory_movements (
            store_id,
            product_id,
            movement_type,
            quantity_change,
            previous_quantity,
            new_quantity,
            reference_type,
            created_by
        ) VALUES (
            NEW.store_id,
            NEW.product_id,
            CASE 
                WHEN TG_OP = 'INSERT' THEN 'adjustment'
                ELSE 'adjustment'
            END,
            CASE 
                WHEN TG_OP = 'INSERT' THEN NEW.quantity
                ELSE NEW.quantity - OLD.quantity
            END,
            CASE 
                WHEN TG_OP = 'INSERT' THEN 0
                ELSE OLD.quantity
            END,
            NEW.quantity,
            'manual_adjustment',
            auth.uid()
        );
        
        -- Update last_updated timestamp
        NEW.last_updated = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply inventory movement trigger
CREATE TRIGGER log_current_inventory_changes 
    BEFORE INSERT OR UPDATE ON current_inventory
    FOR EACH ROW EXECUTE FUNCTION log_inventory_movement();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (authenticated users can read all, admins can modify)
-- Note: In production, you may want more granular store-based access control

-- Read policies for authenticated users
CREATE POLICY "Authenticated users can view stores" ON stores
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view products" ON products
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view current inventory" ON current_inventory
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view stock receipts" ON stock_receipts
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view stock receipt items" ON stock_receipt_items
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view sales transactions" ON sales_transactions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view sales transaction items" ON sales_transaction_items
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view inventory movements" ON inventory_movements
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view sync jobs" ON sync_jobs
    FOR SELECT USING (auth.role() = 'authenticated');

-- Admin policies for full access (you'll need to implement admin detection)
-- For now, all authenticated users can insert/update/delete
-- TODO: Implement proper admin role checking

CREATE POLICY "Authenticated users can modify stores" ON stores
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify products" ON products
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify current inventory" ON current_inventory
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify stock receipts" ON stock_receipts
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify stock receipt items" ON stock_receipt_items
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify sales transactions" ON sales_transactions
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify sales transaction items" ON sales_transaction_items
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify inventory movements" ON inventory_movements
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify sync jobs" ON sync_jobs
    FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- SAMPLE DATA (OPTIONAL - FOR TESTING)
-- =====================================================

-- Insert sample stores
INSERT INTO stores (name, address, is_active) VALUES 
('Main Store', '123 Main Street, City, State', true),
('North Branch', '456 North Ave, City, State', true),
('South Branch', '789 South Blvd, City, State', true),
('Kalina', 'Kalina Shop Location', true);

-- Insert sample products
INSERT INTO products (sku, barcode, name, category, unit_price, is_active) VALUES
('PROD001', '1234567890123', 'Sample Product 1', 'Category A', 19.99, true),
('PROD002', '2345678901234', 'Sample Product 2', 'Category B', 29.99, true),
('PROD003', '3456789012345', 'Sample Product 3', 'Category A', 9.99, true);

-- Insert initial inventory (zero quantities)
WITH store_product_combinations AS (
    SELECT s.id as store_id, p.id as product_id
    FROM stores s
    CROSS JOIN products p
    WHERE s.is_active = true AND p.is_active = true
)
INSERT INTO current_inventory (store_id, product_id, quantity, reserved_quantity)
SELECT store_id, product_id, 0, 0
FROM store_product_combinations;

COMMENT ON TABLE stores IS 'Store locations and their configuration';
COMMENT ON TABLE products IS 'Central product catalog with SKUs, barcodes, and pricing';
COMMENT ON TABLE current_inventory IS 'Real-time inventory levels per store with reserved quantities';
COMMENT ON TABLE stock_receipts IS 'Supplier delivery receipts and purchase orders';
COMMENT ON TABLE stock_receipt_items IS 'Individual items within each delivery receipt';
COMMENT ON TABLE sales_transactions IS 'Sales from both POS systems and online orders';
COMMENT ON TABLE sales_transaction_items IS 'Individual line items within each sale';
COMMENT ON TABLE inventory_movements IS 'Complete audit trail of all inventory changes';
COMMENT ON TABLE sync_jobs IS 'Background job tracking for imports, exports, and synchronization'; 