// =====================================================
// CORE ENTITY TYPES (NEW IN V2)
// =====================================================

export interface Store {
  id: string;
  name: string;
  shopify_location_id?: number;
  pos_system_id?: string;
  address?: string;
  phone?: string;
  manager_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  shopify_product_id?: number;
  shopify_variant_id?: number;
  category?: string;
  unit_price?: number;
  cost_price?: number;
  supplier_sku?: string;
  min_stock_level?: number;
  max_stock_level?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CurrentInventory {
  id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number; // Generated column
  last_updated: string;
  last_counted_at?: string;
  // Joined data
  store?: Store;
  product?: Product;
}

// =====================================================
// STOCK RECEIPT TYPES (NEW IN V2)
// =====================================================

export interface StockReceipt {
  id: string;
  store_id: string;
  receipt_number?: string;
  supplier_name: string;
  supplier_id?: string;
  receipt_date: string;
  expected_delivery_date?: string;
  total_items: number;
  total_cost: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  notes?: string;
  created_by?: string;
  created_at: string;
  processed_at?: string;
  // Joined data
  store?: Store;
  items?: StockReceiptItem[];
}

export interface StockReceiptItem {
  id: string;
  receipt_id: string;
  product_id: string;
  quantity: number;
  unit_cost?: number;
  total_cost: number; // Generated column
  batch_number?: string;
  expiry_date?: string;
  created_at: string;
  // Joined data
  product?: Product;
}

// =====================================================
// SALES TRANSACTION TYPES (NEW IN V2)
// =====================================================

export interface SalesTransaction {
  id: string;
  store_id: string;
  transaction_type: 'offline' | 'online';
  transaction_date: string;
  pos_transaction_id?: string;
  shopify_order_id?: number;
  shopify_order_number?: string;
  total_amount?: number;
  tax_amount?: number;
  discount_amount?: number;
  customer_id?: string;
  customer_email?: string;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  payment_method?: string;
  created_at: string;
  // Joined data
  store?: Store;
  items?: SalesTransactionItem[];
}

export interface SalesTransactionItem {
  id: string;
  transaction_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total: number; // Generated column
  discount_amount?: number;
  variant_title?: string;
  created_at: string;
  // Joined data
  product?: Product;
}

// =====================================================
// INVENTORY MOVEMENT TYPES (NEW IN V2)
// =====================================================

export interface InventoryMovement {
  id: string;
  store_id: string;
  product_id: string;
  movement_type: 'receipt' | 'sale_offline' | 'sale_online' | 'adjustment' | 
                 'return' | 'transfer_in' | 'transfer_out' | 'shrinkage';
  quantity_change: number;
  previous_quantity: number;
  new_quantity: number;
  reference_id?: string;
  reference_type?: string;
  unit_cost?: number;
  notes?: string;
  created_by?: string;
  created_at: string;
  // Joined data
  store?: Store;
  product?: Product;
}

// =====================================================
// SYNC JOB TYPES (ENHANCED IN V2)
// =====================================================

export interface SyncJob {
  id: string;
  job_type: 'export_to_pos' | 'export_to_shopify' | 'import_sales' | 
            'import_receipts' | 'sync_inventory' | 'data_migration';
  store_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_records: number;
  processed_records: number;
  successful_records: number;
  failed_records: number;
  error_message?: string;
  file_path?: string;
  result_file_path?: string;
  job_data?: any; // JSONB data
  started_at?: string;
  completed_at?: string;
  created_by?: string;
  created_at: string;
  // Joined data
  store?: Store;
}

// =====================================================
// LEGACY V1 TYPES (FOR COMPATIBILITY)
// =====================================================

export interface CSVRow {
  barcode: string;
  quantity: number;
}

export type SyncMode = 'pos_shopify' | 'supplier_delivery';

// Legacy shop/supplier types (mapped to new Store entity)
export interface Shop {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  description?: string;
  contact_info?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CSVMapping {
  id: string;
  product_column: string;
  barcode_column: string;
  quantity_column: string;
  delimiter: string;
  has_header: boolean;
  file_type: string;
}

export interface ProcessingResult {
  barcode: string;
  // For POS-Shopify mode
  posQuantity?: number | null;
  shopifyQuantity?: number | null;
  // For Supplier-Stock mode
  currentQuantity?: number | null;
  deliveryQuantity?: number | null;
  originalQuantity?: number | null;
  // Generic fields
  file1Quantity?: number | null;
  file2Quantity?: number | null;
  updatedQuantity: number;
  status: 'success' | 'error' | 'warning';
  discrepancyReason?: string;
  isNewProduct?: boolean;
}

export interface ProcessingLog {
  id: string;
  created_at: string;
  user_id: string;
  // Legacy fields (backwards compatible)
  pos_file_name?: string;
  shopify_file_name?: string;
  // New generic fields
  file1_name?: string;
  file2_name?: string;
  sync_mode: SyncMode;
  supplier_name?: string;
  total_products: number;
  successful_updates: number;
  errors: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_messages?: string[];
  generated_csv_url?: string;
  new_products_csv_url?: string;
  processing_duration_ms?: number;
}

export interface InventoryUpdate {
  id: string;
  processing_log_id: string;
  barcode: string;
  // Legacy fields (backwards compatible)
  pos_quantity?: number | null;
  shopify_quantity?: number | null;
  // New generic fields
  file1_quantity?: number | null;
  file2_quantity?: number | null;
  original_quantity?: number | null;
  delivery_quantity?: number | null;
  updated_quantity: number;
  status: 'success' | 'error' | 'warning' | 'pending';
  discrepancy_reason?: string;
  is_new_product?: boolean;
  created_at: string;
}

export interface FileUpload {
  id: string;
  file_name: string;
  file_type: 'pos' | 'shopify' | 'supplier_invoice' | 'current_stock' | 'file1' | 'file2';
  upload_timestamp: string;
  file_size: number;
  processing_log_id: string;
  file_url?: string;
  file_hash?: string;
}

export interface ProcessingSummary {
  totalProducts: number;
  successfulUpdates: number;
  errors: number;
  warnings: number;
  processingDurationMs: number;
  // For supplier delivery mode
  newProducts?: number;
  updatedExisting?: number;
}

export interface ProcessingResponse {
  success: boolean;
  processingLogId: string;
  summary: ProcessingSummary;
  downloadUrl?: string;
  newProductsUrl?: string;
  results: ProcessingResult[];
  syncMode: SyncMode;
}

export interface UploadedFile {
  file: File;
  preview: CSVRow[];
  isValid: boolean;
  errorMessage?: string;
}

export interface SyncModeConfig {
  mode: SyncMode;
  title: string;
  description: string;
  file1Label: string;
  file2Label: string;
  file1Description: string;
  file2Description: string;
  processingDescription: string;
}

// =====================================================
// SHOPIFY INTEGRATION TYPES
// =====================================================

export interface ShopifyCredentials {
  id?: string;
  user_id?: string;
  shop_id?: string;
  store_url: string;
  access_token: string;
  api_key?: string;
  api_secret?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ShopifyPushResult {
  barcode: string;
  status: 'success' | 'error';
  message: string;
  shopify_variant_id?: number;
  shopify_inventory_item_id?: number;
  details?: string;
  inventory_levels_before?: Array<{
    location_name: string;
    location_id: number;
    quantity: number;
  }>;
  inventory_levels_after?: Array<{
    location_name: string;
    location_id: number;
    quantity: number;
  }>;
  total_before?: number;
  total_after?: number;
}

export interface ShopifyPushSummary {
  total_updates: number;
  successful_updates: number;
  failed_updates: number;
  processing_time_ms: number;
  shopify_location: string;
  shopify_location_id: number;
  shopify_store?: string;
  api_version_used?: string;
}

export interface ShopifyPushResponse {
  success: boolean;
  summary: ShopifyPushSummary;
  results: ShopifyPushResult[];
  error?: string;
  isProcessing?: boolean;
}

export interface ShopifyPushLog {
  id: string;
  processing_log_id: string;
  user_id: string;
  shop_id: string;
  shopify_location_name: string;
  shopify_location_id: string;
  total_updates: number;
  successful_updates: number;
  failed_updates: number;
  processing_time_ms?: number;
  push_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// =====================================================
// USER MANAGEMENT TYPES
// =====================================================

export interface UserProfile {
  approval_status: 'pending' | 'approved' | 'rejected';
  is_admin: boolean;
  approved_at?: string;
  approved_by?: string;
  rejected_reason?: string;
}

export interface PendingUser {
  id: string;
  user_id: string;
  email: string;
  full_name?: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  rejected_reason?: string;
}

// =====================================================
// NEW V2 UI TYPES
// =====================================================

export interface DashboardStats {
  totalStores: number;
  totalProducts: number;
  totalInventoryValue: number;
  lowStockItems: number;
  recentMovements: number;
  pendingReceipts: number;
}

export interface InventoryAlert {
  id: string;
  store_id: string;
  product_id: string;
  alert_type: 'low_stock' | 'out_of_stock' | 'overstock';
  current_quantity: number;
  threshold_quantity: number;
  created_at: string;
  resolved_at?: string;
  // Joined data
  store?: Store;
  product?: Product;
}

export interface StoreInventoryDetail {
  store: Store;
  inventory: CurrentInventory[];
  stats: {
    totalProducts: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
}

// Form types for the new UI
export interface CreateProductForm {
  sku: string;
  barcode?: string;
  name: string;
  category?: string;
  unit_price?: number;
  cost_price?: number;
  min_stock_level?: number;
  max_stock_level?: number;
}

export interface CreateStoreForm {
  name: string;
  address?: string;
  phone?: string;
  manager_name?: string;
  shopify_location_id?: number;
  pos_system_id?: string;
}

export interface CreateReceiptForm {
  store_id: string;
  supplier_name: string;
  receipt_date: string;
  expected_delivery_date?: string;
  notes?: string;
  items: {
    product_id: string;
    quantity: number;
    unit_cost?: number;
    batch_number?: string;
    expiry_date?: string;
  }[];
}

export interface InventoryAdjustmentForm {
  store_id: string;
  adjustments: {
    product_id: string;
    new_quantity: number;
    notes?: string;
  }[];
} 