import { supabase } from '../utils/supabase'
import { 
  Store, Product, CurrentInventory, StockReceipt, StockReceiptItem,
  SalesTransaction, SalesTransactionItem, InventoryMovement, SyncJob,
  CreateProductForm, CreateStoreForm, CreateReceiptForm, 
  InventoryAdjustmentForm, DashboardStats
} from '../types'

// =====================================================
// STORE MANAGEMENT
// =====================================================

export async function getStores(): Promise<Store[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data || []
}

export async function getStore(id: string): Promise<Store | null> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('id', id)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createStore(store: CreateStoreForm): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .insert([store])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateStore(id: string, updates: Partial<Store>): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteStore(id: string): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update({ is_active: false })
    .eq('id', id)

  if (error) throw error
}

// =====================================================
// PRODUCT MANAGEMENT
// =====================================================

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data || []
}

export async function getProduct(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createProduct(product: CreateProductForm): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert([product])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', id)

  if (error) throw error
}

// =====================================================
// INVENTORY MANAGEMENT
// =====================================================

export async function getCurrentInventory(storeId?: string): Promise<CurrentInventory[]> {
  let query = supabase
    .from('current_inventory')
    .select(`
      *,
      store:stores(*),
      product:products(*)
    `)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query.order('product(name)')

  if (error) throw error
  return data || []
}

export async function getInventoryByStore(storeId: string): Promise<CurrentInventory[]> {
  return getCurrentInventory(storeId)
}

export async function updateInventoryQuantity(
  storeId: string, 
  productId: string, 
  newQuantity: number,
  notes?: string
): Promise<CurrentInventory> {
  const { data, error } = await supabase
    .from('current_inventory')
    .upsert({
      store_id: storeId,
      product_id: productId,
      quantity: newQuantity
    })
    .select(`
      *,
      store:stores(*),
      product:products(*)
    `)
    .single()

  if (error) throw error
  return data
}

export async function bulkAdjustInventory(adjustments: InventoryAdjustmentForm): Promise<void> {
  const { error } = await supabase.rpc('bulk_adjust_inventory', {
    p_store_id: adjustments.store_id,
    p_adjustments: adjustments.adjustments
  })

  if (error) throw error
}

// =====================================================
// STOCK RECEIPTS MANAGEMENT
// =====================================================

export async function getStockReceipts(storeId?: string): Promise<StockReceipt[]> {
  let query = supabase
    .from('stock_receipts')
    .select(`
      *,
      store:stores(*),
      items:stock_receipt_items(
        *,
        product:products(*)
      )
    `)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query.order('receipt_date', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getStockReceipt(id: string): Promise<StockReceipt | null> {
  const { data, error } = await supabase
    .from('stock_receipts')
    .select(`
      *,
      store:stores(*),
      items:stock_receipt_items(
        *,
        product:products(*)
      )
    `)
    .eq('id', id)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createStockReceipt(receipt: CreateReceiptForm): Promise<StockReceipt> {
  const { data: receiptData, error: receiptError } = await supabase
    .from('stock_receipts')
    .insert([{
      store_id: receipt.store_id,
      supplier_name: receipt.supplier_name,
      receipt_date: receipt.receipt_date,
      expected_delivery_date: receipt.expected_delivery_date,
      notes: receipt.notes,
      total_items: receipt.items.length
    }])
    .select()
    .single()

  if (receiptError) throw receiptError

  // Add receipt items
  const { error: itemsError } = await supabase
    .from('stock_receipt_items')
    .insert(receipt.items.map(item => ({
      receipt_id: receiptData.id,
      ...item
    })))

  if (itemsError) throw itemsError

  return receiptData
}

export async function processStockReceipt(receiptId: string): Promise<void> {
  const { error } = await supabase.rpc('process_stock_receipt', {
    p_receipt_id: receiptId
  })

  if (error) throw error
}

// =====================================================
// SALES TRANSACTIONS MANAGEMENT
// =====================================================

export async function getSalesTransactions(storeId?: string): Promise<SalesTransaction[]> {
  let query = supabase
    .from('sales_transactions')
    .select(`
      *,
      store:stores(*),
      items:sales_transaction_items(
        *,
        product:products(*)
      )
    `)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query.order('transaction_date', { ascending: false })

  if (error) throw error
  return data || []
}

export async function importSalesFromCSV(storeId: string, csvData: any[]): Promise<void> {
  const { error } = await supabase.rpc('import_sales_from_csv', {
    p_store_id: storeId,
    p_sales_data: csvData
  })

  if (error) throw error
}

// =====================================================
// INVENTORY MOVEMENTS
// =====================================================

export async function getInventoryMovements(
  storeId?: string, 
  productId?: string,
  limit = 100
): Promise<InventoryMovement[]> {
  let query = supabase
    .from('inventory_movements')
    .select(`
      *,
      store:stores(*),
      product:products(*)
    `)

  if (storeId) query = query.eq('store_id', storeId)
  if (productId) query = query.eq('product_id', productId)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

// =====================================================
// DASHBOARD STATISTICS
// =====================================================

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats')

  if (error) throw error
  return data
}

// =====================================================
// SYNC JOBS MANAGEMENT
// =====================================================

export async function getSyncJobs(): Promise<SyncJob[]> {
  const { data, error } = await supabase
    .from('sync_jobs')
    .select(`
      *,
      store:stores(*)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data || []
}

export async function createSyncJob(jobData: Partial<SyncJob>): Promise<SyncJob> {
  const { data, error } = await supabase
    .from('sync_jobs')
    .insert([jobData])
    .select()
    .single()

  if (error) throw error
  return data
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

export async function searchProducts(searchTerm: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`)
    .eq('is_active', true)
    .limit(20)

  if (error) throw error
  return data || []
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', barcode)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getProductBySku(sku: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('sku', sku)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  return data
} 