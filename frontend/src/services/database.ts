import { supabase } from '../utils/supabase'
import { 
  Store, Product, CurrentInventory, StockReceipt,
  SalesTransaction, InventoryMovement, SyncJob,
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
        // Find barcode/SKU column (flexible naming)
        const barcodeValue = findColumnValue(row, ['barcode', 'sku', 'code', 'product_code'])
        const quantityValue = findColumnValue(row, ['quantity', 'qty', 'stock', 'count'])

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
          const newProduct: CreateProductForm = {
            sku: barcodeValue,
            barcode: barcodeValue,
            name: findColumnValue(row, ['name', 'product_name', 'title']) || `Product ${barcodeValue}`,
            category: findColumnValue(row, ['category']) || undefined,
            unit_price: parseFloat(findColumnValue(row, ['price', 'unit_price']) || '0') || undefined,
            cost_price: parseFloat(findColumnValue(row, ['cost', 'cost_price']) || '0') || undefined
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

        // Update inventory for this store
        await updateInventoryQuantity(storeId, product.id, quantity)
        
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
        const barcodeValue = findColumnValue(row, ['barcode', 'sku', 'code', 'product_code'])
        const quantityValue = findColumnValue(row, ['quantity', 'qty', 'delivery_qty', 'received'])
        const unitCostValue = findColumnValue(row, ['unit_cost', 'cost', 'price'])

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
          const newProduct: CreateProductForm = {
            sku: barcodeValue,
            barcode: barcodeValue,
            name: findColumnValue(row, ['name', 'product_name', 'title']) || `Product ${barcodeValue}`,
            category: findColumnValue(row, ['category']) || undefined,
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
        receiptItems.push({
          product_id: product.id,
          quantity,
          unit_cost: unitCost,
          batch_number: findColumnValue(row, ['batch', 'batch_number', 'lot']),
          expiry_date: findColumnValue(row, ['expiry', 'expiry_date', 'exp_date'])
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

// Helper function to find column value with flexible naming
function findColumnValue(row: any, possibleNames: string[]): string | null {
  for (const name of possibleNames) {
    // Check exact match
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