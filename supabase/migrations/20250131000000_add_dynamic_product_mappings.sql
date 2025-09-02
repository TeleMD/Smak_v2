-- Create dynamic product mappings table for intelligent Shopify sync
-- This migration adds a self-learning system for product identification

-- =====================================================
-- DYNAMIC PRODUCT MAPPINGS TABLE
-- =====================================================

-- Create table to store dynamic product mappings for Shopify sync
CREATE TABLE IF NOT EXISTS shopify_product_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode VARCHAR(100) NOT NULL,
    shopify_product_id VARCHAR(50) NOT NULL,
    shopify_variant_id BIGINT,
    shopify_inventory_item_id BIGINT,
    product_name VARCHAR(500),
    -- CSV-specific identifiers for direct mapping
    pos_item_id UUID, -- From CSV "Item id (Do not change)"
    pos_variant_id UUID, -- From CSV "Variant id (Do not change)"
    -- Discovery metadata
    discovery_method VARCHAR(50) NOT NULL, -- 'csv_direct', 'graphql_search', 'rest_search', 'manual'
    confidence_score INTEGER DEFAULT 100, -- 0-100, higher is better
    last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verification_count INTEGER DEFAULT 1,
    -- Performance tracking
    search_time_ms INTEGER, -- How long it took to find this mapping
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(barcode),
    UNIQUE(shopify_variant_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_shopify_mappings_barcode ON shopify_product_mappings(barcode);
CREATE INDEX IF NOT EXISTS idx_shopify_mappings_shopify_product_id ON shopify_product_mappings(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_mappings_pos_item_id ON shopify_product_mappings(pos_item_id);
CREATE INDEX IF NOT EXISTS idx_shopify_mappings_pos_variant_id ON shopify_product_mappings(pos_variant_id);
CREATE INDEX IF NOT EXISTS idx_shopify_mappings_discovery_method ON shopify_product_mappings(discovery_method);
CREATE INDEX IF NOT EXISTS idx_shopify_mappings_last_verified ON shopify_product_mappings(last_verified_at);

-- Enable RLS
ALTER TABLE shopify_product_mappings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view product mappings" ON shopify_product_mappings
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify product mappings" ON shopify_product_mappings
    FOR ALL USING (auth.role() = 'authenticated');

-- Add trigger for updated_at
CREATE TRIGGER update_shopify_mappings_updated_at BEFORE UPDATE ON shopify_product_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SYNC STATISTICS TABLE
-- =====================================================

-- Create table to track sync performance and patterns
CREATE TABLE IF NOT EXISTS shopify_sync_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    sync_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_products INTEGER NOT NULL DEFAULT 0,
    successful_updates INTEGER NOT NULL DEFAULT 0,
    failed_updates INTEGER NOT NULL DEFAULT 0,
    new_mappings_discovered INTEGER NOT NULL DEFAULT 0,
    avg_search_time_ms INTEGER,
    sync_duration_ms INTEGER,
    discovery_methods_used JSONB, -- Track which methods were used
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate daily stats
    UNIQUE(store_id, sync_date)
);

-- Create indexes for sync stats
CREATE INDEX IF NOT EXISTS idx_sync_stats_store_date ON shopify_sync_stats(store_id, sync_date);
CREATE INDEX IF NOT EXISTS idx_sync_stats_sync_date ON shopify_sync_stats(sync_date);

-- Enable RLS for sync stats
ALTER TABLE shopify_sync_stats ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for sync stats
CREATE POLICY "Authenticated users can view sync stats" ON shopify_sync_stats
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can modify sync stats" ON shopify_sync_stats
    FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to upsert product mapping with verification tracking
CREATE OR REPLACE FUNCTION upsert_shopify_product_mapping(
    p_barcode VARCHAR(100),
    p_shopify_product_id VARCHAR(50),
    p_shopify_variant_id BIGINT DEFAULT NULL,
    p_shopify_inventory_item_id BIGINT DEFAULT NULL,
    p_product_name VARCHAR(500) DEFAULT NULL,
    p_pos_item_id UUID DEFAULT NULL,
    p_pos_variant_id UUID DEFAULT NULL,
    p_discovery_method VARCHAR(50) DEFAULT 'manual',
    p_search_time_ms INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    mapping_id UUID;
BEGIN
    -- Insert or update the mapping
    INSERT INTO shopify_product_mappings (
        barcode,
        shopify_product_id,
        shopify_variant_id,
        shopify_inventory_item_id,
        product_name,
        pos_item_id,
        pos_variant_id,
        discovery_method,
        search_time_ms,
        last_verified_at,
        verification_count
    ) VALUES (
        p_barcode,
        p_shopify_product_id,
        p_shopify_variant_id,
        p_shopify_inventory_item_id,
        p_product_name,
        p_pos_item_id,
        p_pos_variant_id,
        p_discovery_method,
        p_search_time_ms,
        NOW(),
        1
    )
    ON CONFLICT (barcode) DO UPDATE SET
        shopify_product_id = EXCLUDED.shopify_product_id,
        shopify_variant_id = EXCLUDED.shopify_variant_id,
        shopify_inventory_item_id = EXCLUDED.shopify_inventory_item_id,
        product_name = COALESCE(EXCLUDED.product_name, shopify_product_mappings.product_name),
        pos_item_id = COALESCE(EXCLUDED.pos_item_id, shopify_product_mappings.pos_item_id),
        pos_variant_id = COALESCE(EXCLUDED.pos_variant_id, shopify_product_mappings.pos_variant_id),
        discovery_method = EXCLUDED.discovery_method,
        search_time_ms = COALESCE(EXCLUDED.search_time_ms, shopify_product_mappings.search_time_ms),
        last_verified_at = NOW(),
        verification_count = shopify_product_mappings.verification_count + 1,
        updated_at = NOW()
    RETURNING id INTO mapping_id;
    
    RETURN mapping_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get mapping by barcode
CREATE OR REPLACE FUNCTION get_shopify_mapping_by_barcode(p_barcode VARCHAR(100))
RETURNS TABLE (
    id UUID,
    barcode VARCHAR(100),
    shopify_product_id VARCHAR(50),
    shopify_variant_id BIGINT,
    shopify_inventory_item_id BIGINT,
    product_name VARCHAR(500),
    pos_item_id UUID,
    pos_variant_id UUID,
    discovery_method VARCHAR(50),
    confidence_score INTEGER,
    last_verified_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.barcode,
        m.shopify_product_id,
        m.shopify_variant_id,
        m.shopify_inventory_item_id,
        m.product_name,
        m.pos_item_id,
        m.pos_variant_id,
        m.discovery_method,
        m.confidence_score,
        m.last_verified_at
    FROM shopify_product_mappings m
    WHERE m.barcode = p_barcode;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE shopify_product_mappings IS 'Dynamic product mappings for intelligent Shopify sync with self-learning capabilities';
COMMENT ON TABLE shopify_sync_stats IS 'Performance tracking and analytics for Shopify sync operations';
COMMENT ON FUNCTION upsert_shopify_product_mapping IS 'Upserts product mapping with verification tracking';
COMMENT ON FUNCTION get_shopify_mapping_by_barcode IS 'Retrieves product mapping by barcode';
