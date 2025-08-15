import { supabase } from '../utils/supabase'
import { 
  Store, Product, CurrentInventory, StockReceipt,
  SalesTransaction, InventoryMovement, SyncJob,
  CreateProductForm, CreateStoreForm, CreateReceiptForm, 
  InventoryAdjustmentForm, DashboardStats, ShopifyStockSyncResult
} from '../types'
import { syncStoreStockToShopify, syncStoreStockToShopifyDirect } from './shopify'

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
  newQuantity: number
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

// =====================================================
// CSV UPLOAD PROCESSING
// =====================================================

interface CSVProcessingResult {
  success: boolean
  summary: {
    totalProducts: number
    successfulUpdates: number
    newProducts: number
    errors: number
  }
  details: Array<{
    barcode: string
    status: 'success' | 'error' | 'created'
    message: string
    quantity?: number
  }>
  error?: string
}

export async function uploadCurrentStock(storeId: string, csvData: any[]): Promise<CSVProcessingResult> {
  try {
    const results: CSVProcessingResult['details'] = []
    let successfulUpdates = 0
    let errors = 0
    let newProducts = 0

    // Process each row in the CSV
    for (const row of csvData) {
      try {
        // Find barcode/SKU column (using store-specific mapping)
        const barcodeValue = await findColumnValueWithMapping(row, storeId, 'current_stock', 'barcode')
        const quantityValue = await findColumnValueWithMapping(row, storeId, 'current_stock', 'quantity')

        if (!barcodeValue || quantityValue === null || quantityValue === undefined) {
          results.push({
            barcode: barcodeValue || 'Unknown',
            status: 'error',
            message: 'Missing barcode or quantity'
          })
          errors++
          continue
        }

        const quantity = parseInt(quantityValue.toString())
        if (isNaN(quantity) || quantity < 0) {
          results.push({
            barcode: barcodeValue,
            status: 'error',
            message: 'Invalid quantity value'
          })
          errors++
          continue
        }

        // Find existing product by barcode or SKU
        let product = await getProductByBarcode(barcodeValue)
        if (!product) {
          product = await getProductBySku(barcodeValue)
        }

        if (!product) {
          // Create new product if it doesn't exist
          const nameValue = await findColumnValueWithMapping(row, storeId, 'current_stock', 'name')
          const categoryValue = await findColumnValueWithMapping(row, storeId, 'current_stock', 'category')
          const priceValue = await findColumnValueWithMapping(row, storeId, 'current_stock', 'price')
          
          // Fix multiline product names - only keep the first line
          let productName = nameValue || `Product ${barcodeValue}`
          if (typeof productName === 'string') {
            productName = productName.split('\n')[0].trim()
          }
          
          const newProduct: CreateProductForm = {
            sku: barcodeValue,
            barcode: barcodeValue,
            name: productName,
            category: categoryValue || undefined,
            unit_price: priceValue ? parseFloat(priceValue) || undefined : undefined,
            cost_price: priceValue ? parseFloat(priceValue) || undefined : undefined
          }

          product = await createProduct(newProduct)
          newProducts++
          
          results.push({
            barcode: barcodeValue,
            status: 'created',
            message: 'New product created',
            quantity
          })
        }

        // Update inventory for this store (skip movements for current stock uploads)
        await updateInventoryQuantitySkipMovements(storeId, product.id, quantity)
        
        if (!results.find(r => r.barcode === barcodeValue && r.status === 'created')) {
          results.push({
            barcode: barcodeValue,
            status: 'success',
            message: 'Inventory updated',
            quantity
          })
        }
        successfulUpdates++

      } catch (error) {
        const barcodeValue = findColumnValue(row, ['barcode', 'sku', 'code', 'product_code']) || 'Unknown'
        results.push({
          barcode: barcodeValue,
          status: 'error',
          message: error instanceof Error ? error.message : 'Processing error'
        })
        errors++
      }
    }

    return {
      success: true,
      summary: {
        totalProducts: csvData.length,
        successfulUpdates,
        newProducts,
        errors
      },
      details: results
    }

  } catch (error) {
    return {
      success: false,
      summary: {
        totalProducts: 0,
        successfulUpdates: 0,
        newProducts: 0,
        errors: 0
      },
      details: [],
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

export async function uploadSupplierDelivery(
  storeId: string, 
  csvData: any[], 
  supplierName: string
): Promise<CSVProcessingResult> {
  try {
    const results: CSVProcessingResult['details'] = []
    let successfulUpdates = 0
    let errors = 0
    let newProducts = 0

    // Create stock receipt header
    const receiptData: CreateReceiptForm = {
      store_id: storeId,
      supplier_name: supplierName,
      receipt_date: new Date().toISOString().split('T')[0],
      notes: `Uploaded from CSV on ${new Date().toLocaleString()}`,
      items: []
    }

    // Process each row to build receipt items
    const receiptItems: any[] = []
    for (const row of csvData) {
      try {
        const barcodeValue = await findColumnValueWithMapping(row, storeId, 'supplier_delivery', 'barcode')
        const quantityValue = await findColumnValueWithMapping(row, storeId, 'supplier_delivery', 'quantity')
        const unitCostValue = await findColumnValueWithMapping(row, storeId, 'supplier_delivery', 'price')

        if (!barcodeValue || quantityValue === null || quantityValue === undefined) {
          results.push({
            barcode: barcodeValue || 'Unknown',
            status: 'error',
            message: 'Missing barcode or quantity'
          })
          errors++
          continue
        }

        const quantity = parseInt(quantityValue.toString())
        const unitCost = unitCostValue ? parseFloat(unitCostValue.toString()) : undefined

        if (isNaN(quantity) || quantity <= 0) {
          results.push({
            barcode: barcodeValue,
            status: 'error',
            message: 'Invalid quantity value'
          })
          errors++
          continue
        }

        // Find existing product by barcode or SKU
        let product = await getProductByBarcode(barcodeValue)
        if (!product) {
          product = await getProductBySku(barcodeValue)
        }

        if (!product) {
          // Create new product if it doesn't exist
          const nameValue = await findColumnValueWithMapping(row, storeId, 'supplier_delivery', 'name')
          const categoryValue = await findColumnValueWithMapping(row, storeId, 'supplier_delivery', 'category')
          
          const newProduct: CreateProductForm = {
            sku: barcodeValue,
            barcode: barcodeValue,
            name: nameValue || `Product ${barcodeValue}`,
            category: categoryValue || undefined,
            unit_price: unitCost || undefined,
            cost_price: unitCost || undefined
          }

          product = await createProduct(newProduct)
          newProducts++
          
          results.push({
            barcode: barcodeValue,
            status: 'created',
            message: 'New product created',
            quantity
          })
        }

        // Add to receipt items
        const batchValue = findColumnValue(row, ['batch', 'batch_number', 'lot'])
        const expiryValue = findColumnValue(row, ['expiry', 'expiry_date', 'exp_date'])
        
        receiptItems.push({
          product_id: product.id,
          quantity,
          unit_cost: unitCost,
          batch_number: batchValue,
          expiry_date: expiryValue
        })

        if (!results.find(r => r.barcode === barcodeValue && r.status === 'created')) {
          results.push({
            barcode: barcodeValue,
            status: 'success',
            message: 'Added to delivery',
            quantity
          })
        }
        successfulUpdates++

      } catch (error) {
        const barcodeValue = findColumnValue(row, ['barcode', 'sku', 'code', 'product_code']) || 'Unknown'
        results.push({
          barcode: barcodeValue,
          status: 'error',
          message: error instanceof Error ? error.message : 'Processing error'
        })
        errors++
      }
    }

    // Create the stock receipt if we have valid items
    if (receiptItems.length > 0) {
      receiptData.items = receiptItems
      const receipt = await createStockReceipt(receiptData)
      
      // Process the receipt to update inventory
      await processStockReceipt(receipt.id)
    }

    return {
      success: true,
      summary: {
        totalProducts: csvData.length,
        successfulUpdates,
        newProducts,
        errors
      },
      details: results
    }

  } catch (error) {
    return {
      success: false,
      summary: {
        totalProducts: 0,
        successfulUpdates: 0,
        newProducts: 0,
        errors: 0
      },
      details: [],
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

// Store-specific CSV mapping interface
interface StoreCsvMapping {
  id: string
  store_id: string
  mapping_name: string
  barcode_columns: string[]
  name_columns: string[]
  quantity_columns: string[]
  price_columns?: string[]
  category_columns?: string[]
}

// Get store-specific CSV mapping
async function getStoreCsvMapping(storeId: string, mappingType: 'current_stock' | 'supplier_delivery'): Promise<StoreCsvMapping | null> {
  const { data, error } = await supabase
    .from('store_csv_mappings')
    .select('*')
    .eq('store_id', storeId)
    .eq('mapping_name', mappingType)
    .maybeSingle()

  if (error) {
    console.warn('Could not load store CSV mapping:', error)
    return null
  }
  return data
}

// Enhanced helper function to find column value with store-specific mapping
async function findColumnValueWithMapping(
  row: any, 
  storeId: string, 
  mappingType: 'current_stock' | 'supplier_delivery',
  columnType: 'barcode' | 'name' | 'quantity' | 'price' | 'category'
): Promise<string | null> {
  // Try to get store-specific mapping first
  const storeMapping = await getStoreCsvMapping(storeId, mappingType)
  
  let possibleNames: string[] = []
  
  if (storeMapping) {
    switch (columnType) {
      case 'barcode':
        possibleNames = storeMapping.barcode_columns
        break
      case 'name':
        possibleNames = storeMapping.name_columns
        break
      case 'quantity':
        possibleNames = storeMapping.quantity_columns
        break
      case 'price':
        possibleNames = storeMapping.price_columns || []
        break
      case 'category':
        possibleNames = storeMapping.category_columns || []
        break
    }
  }
  
  // Fall back to default naming if no store-specific mapping
  if (possibleNames.length === 0) {
    switch (columnType) {
      case 'barcode':
        possibleNames = ['barcode', 'sku', 'code', 'product_code', 'Barcode']
        break
      case 'name':
        possibleNames = ['name', 'product_name', 'title', 'Item name', 'item_name']
        break
      case 'quantity':
        possibleNames = ['quantity', 'qty', 'stock', 'count', 'Quantity']
        break
      case 'price':
        possibleNames = ['price', 'unit_price', 'cost', 'unit_cost']
        break
      case 'category':
        possibleNames = ['category', 'type', 'group']
        break
    }
  }
  
  return findColumnValue(row, possibleNames)
}

// Helper function to find column value with flexible naming
function findColumnValue(row: any, possibleNames: string[]): string | null {
  for (const name of possibleNames) {
    // Check exact match (case-sensitive first for specific mappings like "Barcode")
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return row[name].toString().trim()
    }
    
    // Check case-insensitive match
    const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase())
    if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key].toString().trim()
    }
    
    // Check partial match
    const partialKey = Object.keys(row).find(k => 
      k.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(k.toLowerCase())
    )
    if (partialKey && row[partialKey] !== undefined && row[partialKey] !== null && row[partialKey] !== '') {
      return row[partialKey].toString().trim()
    }
  }
  return null
}

// Function to update inventory quantity without creating movement logs (for current stock uploads)
export async function updateInventoryQuantitySkipMovements(storeId: string, productId: string, quantity: number): Promise<void> {
  const { error } = await supabase.rpc('update_inventory_skip_movements', {
    p_store_id: storeId,
    p_product_id: productId,
    p_quantity: quantity
  })

  if (error) {
    console.error('Error updating inventory (skip movements):', error)
    throw error
  }
}

// =====================================================
// SHOPIFY INTEGRATION
// =====================================================

export async function syncStoreToShopify(storeId: string): Promise<ShopifyStockSyncResult> {
  try {
    // Get store information
    const store = await getStore(storeId)
    if (!store) {
      throw new Error('Store not found')
    }

    // Get current inventory for the store
    const inventory = await getCurrentInventory(storeId)
    if (inventory.length === 0) {
      throw new Error('No inventory found for this store')
    }

    // Create a sync job record
    const syncJob = await createSyncJob({
      job_type: 'sync_inventory',
      store_id: storeId,
      status: 'processing',
      total_records: inventory.length,
      job_data: { 
        sync_type: 'shopify_stock_sync',
        store_name: store.name 
      }
    })

    try {
      // Perform the actual sync using DIRECT method (bypasses pagination limits)
      const result = await syncStoreStockToShopifyDirect(storeId, store.name, inventory)

      // Update sync job with results
      await supabase
        .from('sync_jobs')
        .update({
          status: 'completed',
          processed_records: result.summary.totalProducts,
          successful_records: result.summary.successfulUpdates,
          failed_records: result.summary.failedUpdates,
          completed_at: new Date().toISOString(),
          job_data: {
            ...syncJob.job_data,
            result: result
          }
        })
        .eq('id', syncJob.id)

      return result
    } catch (error) {
      // Update sync job with error
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString()
        })
        .eq('id', syncJob.id)

      throw error
    }
  } catch (error) {
    console.error('Error syncing store to Shopify:', error)
    throw error
  }
} 