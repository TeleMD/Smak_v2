// Simplified Enhanced Shopify Sync - Uses Existing Database Only
// No new tables required - works with existing products table

import { CurrentInventory, ShopifyStockSyncResult, ShopifyPushResult } from '../types'
import { findShopifyLocationByName, updateInventoryLevel, getInventoryLevels } from './shopify'
import { 
  discoverMultipleSimpleMappings,
  discoverSimpleShopifyMapping,
  getSimpleShopifyMapping,
  SimpleShopifyMapping,
  CSVProductRow
} from './simplifiedDynamicMapping'

// =====================================================
// SIMPLIFIED ENHANCED SYNC
// =====================================================

export async function simplifiedEnhancedSync(
  storeId: string,
  storeName: string,
  inventory: CurrentInventory[],
  csvData?: CSVProductRow[]
): Promise<ShopifyStockSyncResult> {
  const startTime = Date.now()
  const results: ShopifyPushResult[] = []
  let successfulUpdates = 0
  let failedUpdates = 0
  let skippedProducts = 0

  console.log(`🚀 SIMPLIFIED ENHANCED SYNC: Starting for ${inventory.length} products`)
  console.log(`📊 Using existing database schema - no new tables needed!`)

  // Find the Shopify location
  let shopifyLocation
  try {
    shopifyLocation = await findShopifyLocationByName(storeName)
  } catch (error) {
    console.error('Error finding Shopify location:', error)
    return createErrorResult(storeId, storeName, inventory.length, error instanceof Error ? error : new Error(String(error)))
  }
  
  if (!shopifyLocation) {
    const error = `No Shopify location found with name "${storeName}"`
    console.error(error)
    return createErrorResult(storeId, storeName, inventory.length, new Error(error))
  }

  console.log(`📍 Target location: ${shopifyLocation.name} (ID: ${shopifyLocation.id})`)

  // Filter valid inventory items
  const validInventory = inventory.filter(item => item.product?.barcode)
  const invalidCount = inventory.length - validInventory.length
  
  if (invalidCount > 0) {
    console.log(`⚠️ Skipping ${invalidCount} products without barcodes`)
    skippedProducts += invalidCount
  }

  console.log(`📦 Processing ${validInventory.length} valid products...`)

  // =====================================================
  // INTELLIGENT PRODUCT DISCOVERY (Simplified)
  // =====================================================

  let productMappings: Map<string, SimpleShopifyMapping>

  if (csvData && csvData.length > 0) {
    // Enhanced mode: Use CSV data for intelligent bulk discovery
    console.log(`🧠 ENHANCED MODE: Using CSV data with existing database`)
    productMappings = await discoverMultipleSimpleMappings(csvData)
  } else {
    // Legacy mode: Discover products individually using existing data
    console.log(`🔍 LEGACY MODE: Individual discovery using existing products table`)
    productMappings = new Map()
    
    for (const inventoryItem of validInventory) {
      const barcode = inventoryItem.product!.barcode!
      
      if (!productMappings.has(barcode)) {
        // First check existing products table
        const existing = await getSimpleShopifyMapping(barcode)
        if (existing) {
          productMappings.set(barcode, existing)
        } else {
          // Discover new mapping and save to existing products table
          const discovered = await discoverSimpleShopifyMapping(barcode)
          if (discovered) {
            productMappings.set(barcode, discovered)
          }
        }
      }
    }
  }

  console.log(`🎯 Product Discovery Complete: ${productMappings.size}/${validInventory.length} products mapped`)

  // =====================================================
  // INVENTORY UPDATES
  // =====================================================

  let processed = 0
  const discoveryStats = {
    existing: 0,
    csv_direct: 0,
    graphql_search: 0,
    rest_search: 0,
    not_found: 0
  }

  for (const inventoryItem of validInventory) {
    const barcode = inventoryItem.product!.barcode!
    const progress = `${++processed}/${validInventory.length}`
    
    try {
      console.log(`🔄 [${progress}] Processing: ${inventoryItem.product?.name} (${barcode})`)
      
      // Get the product mapping
      const mapping = productMappings.get(barcode)
      
      if (!mapping) {
        console.log(`❌ [${progress}] No Shopify mapping found for: ${barcode}`)
        discoveryStats.not_found++
        
        results.push({
          barcode,
          status: 'skipped',
          message: 'Product not found in Shopify - no mapping available'
        })
        skippedProducts++
        continue
      }

      // Track discovery method
      discoveryStats[mapping.discovery_method]++

      // Get current inventory levels
      let inventoryBefore = 0
      try {
        if (mapping.shopify_inventory_item_id) {
          const currentLevels = await getInventoryLevels(mapping.shopify_inventory_item_id)
          const currentLevel = currentLevels.find(level => level.location_id === shopifyLocation.id)
          inventoryBefore = currentLevel ? currentLevel.available : 0
        }
      } catch (error) {
        console.warn(`⚠️ [${progress}] Could not get current inventory levels, assuming 0:`, error)
      }

      // Update the inventory level
      const newQuantity = inventoryItem.available_quantity
      
      console.log(`📝 [${progress}] Updating inventory: ${inventoryBefore} → ${newQuantity} (${mapping.discovery_method})`)
      
      if (mapping.shopify_inventory_item_id) {
        await updateInventoryLevel(
          mapping.shopify_inventory_item_id,
          shopifyLocation.id,
          newQuantity
        )

        console.log(`✅ [${progress}] Successfully updated inventory`)

        results.push({
          barcode,
          status: 'success',
          message: `Updated from ${inventoryBefore} to ${newQuantity} via ${mapping.discovery_method}`,
          shopify_variant_id: mapping.shopify_variant_id,
          shopify_inventory_item_id: mapping.shopify_inventory_item_id
        })
        
        successfulUpdates++
      } else {
        console.log(`⚠️ [${progress}] Missing inventory item ID, skipping update`)
        results.push({
          barcode,
          status: 'skipped',
          message: 'Missing inventory item ID - product found but cannot update stock'
        })
        skippedProducts++
      }

      // Progress reporting
      if (processed % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const avgTimePerItem = elapsed / processed
        const estimatedTotal = avgTimePerItem * validInventory.length
        const eta = Math.round(estimatedTotal - elapsed)
        
        console.log(`📊 Progress: ${processed}/${validInventory.length} (${Math.round((processed / validInventory.length) * 100)}%) - ETA: ${eta}s`)
        console.log(`   Discovery methods: Existing:${discoveryStats.existing} CSV:${discoveryStats.csv_direct} GraphQL:${discoveryStats.graphql_search} NotFound:${discoveryStats.not_found}`)
      }

    } catch (error) {
      console.error(`❌ [${progress}] Error updating inventory for ${barcode}:`, error)
      
      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        if (error.message.includes('429')) {
          errorMessage = 'Rate limit exceeded - try again later'
        } else if (error.message.includes('404')) {
          errorMessage = 'Inventory item not found in Shopify'
        } else if (error.message.includes('422')) {
          errorMessage = 'Invalid inventory data'
        } else {
          errorMessage = error.message
        }
      }
      
      results.push({
        barcode,
        status: 'error',
        message: errorMessage
      })
      
      failedUpdates++
    }
  }

  // =====================================================
  // RESULTS
  // =====================================================

  const processingTime = Date.now() - startTime
  const successRate = validInventory.length > 0 ? Math.round((successfulUpdates / validInventory.length) * 100) : 0

  console.log(`🏁 Simplified Enhanced Sync Completed in ${(processingTime / 1000).toFixed(1)}s:`)
  console.log(`   ✅ Successful: ${successfulUpdates}`)
  console.log(`   ❌ Failed: ${failedUpdates}`)
  console.log(`   ⚠️ Skipped: ${skippedProducts}`)
  console.log(`   📊 Success Rate: ${successRate}%`)
  console.log(`   🧠 Discovery Methods Used:`)
  console.log(`      - Existing Products: ${discoveryStats.existing}`)
  console.log(`      - CSV Direct: ${discoveryStats.csv_direct}`)
  console.log(`      - GraphQL Search: ${discoveryStats.graphql_search}`)
  console.log(`      - Not Found: ${discoveryStats.not_found}`)

  return {
    store_id: storeId,
    store_name: storeName,
    shopify_location_name: shopifyLocation.name,
    shopify_location_id: shopifyLocation.id,
    total_products: inventory.length,
    successful_updates: successfulUpdates,
    failed_updates: failedUpdates,
    skipped_products: skippedProducts,
    processing_time_ms: processingTime,
    results
  }
}

// =====================================================
// CSV-DIRECT SYNC (Simplified)
// =====================================================

export async function simplifiedSyncFromCSV(
  storeId: string,
  storeName: string,
  csvData: CSVProductRow[]
): Promise<ShopifyStockSyncResult> {
  console.log(`🚀 SIMPLIFIED CSV-DIRECT SYNC: ${csvData.length} products (existing DB only)`)
  
  const startTime = Date.now()
  const results: ShopifyPushResult[] = []
  let successfulUpdates = 0
  let failedUpdates = 0
  let skippedProducts = 0

  // Find the Shopify location
  const shopifyLocation = await findShopifyLocationByName(storeName)
  if (!shopifyLocation) {
    throw new Error(`No Shopify location found with name "${storeName}"`)
  }

  console.log(`📍 Target location: ${shopifyLocation.name} (ID: ${shopifyLocation.id})`)

  // Filter valid CSV rows
  const validRows = csvData.filter(row => row.Barcode?.trim())
  console.log(`📦 Processing ${validRows.length}/${csvData.length} valid CSV rows`)

  // Bulk discover all product mappings using existing database
  const productMappings = await discoverMultipleSimpleMappings(validRows)
  console.log(`🎯 Discovered ${productMappings.size}/${validRows.length} product mappings`)

  // Process each CSV row
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i]
    const barcode = row.Barcode.trim()
    const quantity = parseInt(row.Quantity) || 0
    const progress = `${i + 1}/${validRows.length}`
    
    try {
      console.log(`🔄 [${progress}] Processing CSV row: ${row['Item name']} (${barcode}) - Qty: ${quantity}`)
      
      const mapping = productMappings.get(barcode)
      if (!mapping) {
        console.log(`❌ [${progress}] No mapping found for: ${barcode}`)
        results.push({
          barcode,
          status: 'skipped',
          message: 'Product not found in Shopify'
        })
        skippedProducts++
        continue
      }

      // Get current inventory level
      let inventoryBefore = 0
      try {
        if (mapping.shopify_inventory_item_id) {
          const currentLevels = await getInventoryLevels(mapping.shopify_inventory_item_id)
          const currentLevel = currentLevels.find(level => level.location_id === shopifyLocation.id)
          inventoryBefore = currentLevel ? currentLevel.available : 0
        }
      } catch (error) {
        console.warn(`⚠️ [${progress}] Could not get current inventory, assuming 0`)
      }

      // Update inventory
      if (mapping.shopify_inventory_item_id) {
        await updateInventoryLevel(
          mapping.shopify_inventory_item_id,
          shopifyLocation.id,
          quantity
        )

        console.log(`✅ [${progress}] Updated: ${inventoryBefore} → ${quantity} via ${mapping.discovery_method}`)

        results.push({
          barcode,
          status: 'success',
          message: `Updated from ${inventoryBefore} to ${quantity} via ${mapping.discovery_method}`,
          shopify_variant_id: mapping.shopify_variant_id,
          shopify_inventory_item_id: mapping.shopify_inventory_item_id
        })
        
        successfulUpdates++
      } else {
        results.push({
          barcode,
          status: 'skipped',
          message: 'Missing inventory item ID - cannot update stock'
        })
        skippedProducts++
      }

    } catch (error) {
      console.error(`❌ [${progress}] Error processing ${barcode}:`, error)
      
      results.push({
        barcode,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
      
      failedUpdates++
    }

    // Progress reporting
    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000
      const eta = Math.round((elapsed / (i + 1)) * (validRows.length - i - 1))
      console.log(`📊 Progress: ${i + 1}/${validRows.length} (${Math.round(((i + 1) / validRows.length) * 100)}%) - ETA: ${eta}s`)
    }
  }

  const processingTime = Date.now() - startTime
  const successRate = validRows.length > 0 ? Math.round((successfulUpdates / validRows.length) * 100) : 0

  console.log(`🏁 Simplified CSV-Direct Sync Completed in ${(processingTime / 1000).toFixed(1)}s:`)
  console.log(`   ✅ Successful: ${successfulUpdates}`)
  console.log(`   ❌ Failed: ${failedUpdates}`)
  console.log(`   ⚠️ Skipped: ${skippedProducts}`)
  console.log(`   📊 Success Rate: ${successRate}%`)

  return {
    store_id: storeId,
    store_name: storeName,
    shopify_location_name: shopifyLocation.name,
    shopify_location_id: shopifyLocation.id,
    total_products: csvData.length,
    successful_updates: successfulUpdates,
    failed_updates: failedUpdates,
    skipped_products: skippedProducts,
    processing_time_ms: processingTime,
    results
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function createErrorResult(
  storeId: string, 
  storeName: string, 
  totalProducts: number, 
  error: Error
): ShopifyStockSyncResult {
  return {
    store_id: storeId,
    store_name: storeName,
    total_products: totalProducts,
    successful_updates: 0,
    failed_updates: 0,
    skipped_products: totalProducts,
    processing_time_ms: 0,
    results: Array(totalProducts).fill({
      barcode: 'unknown',
      status: 'skipped' as const,
      message: `Sync initialization failed: ${error.message}`
    }),
    error: error.message
  }
}
