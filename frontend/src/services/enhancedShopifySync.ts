import { 
  ShopifyStockSyncResult, ShopifyPushResult, CurrentInventory
} from '../types'
import { 
  findShopifyLocationByName, updateInventoryLevel 
} from './shopify'
import { 
  getBulkShopifyMappings, getShopifyMapping, migrateHardcodedMappings 
} from './dynamicShopifyMapping'

// =====================================================
// ENHANCED SHOPIFY SYNC SERVICE
// =====================================================
// This service replaces the hardcoded knownProducts approach
// with a dynamic, database-driven mapping system

/**
 * Enhanced sync that eliminates hardcoded mappings
 * Uses dynamic discovery and database persistence
 */
export async function enhancedSyncStoreStockToShopify(
  storeId: string,
  storeName: string,
  inventory: CurrentInventory[]
): Promise<ShopifyStockSyncResult> {
  console.log(`🚀 ENHANCED SYNC: Starting dynamic sync for ${inventory.length} products`)
  console.log(`📍 Target store: ${storeName}`)
  
  const startTime = Date.now()
  const results: ShopifyPushResult[] = []
  let successfulUpdates = 0
  let failedUpdates = 0
  let skippedProducts = 0

  try {
    // Step 1: Find Shopify location
    console.log(`📍 Step 1: Finding Shopify location...`)
    const shopifyLocation = await findShopifyLocationByName(storeName)
    
    if (!shopifyLocation) {
      throw new Error(`No Shopify location found with name "${storeName}"`)
    }
    
    console.log(`✅ Found location: ${shopifyLocation.name} (ID: ${shopifyLocation.id})`)

    // Step 2: Filter valid inventory items
    const validInventory = inventory.filter(item => item.product?.barcode)
    const invalidCount = inventory.length - validInventory.length
    
    if (invalidCount > 0) {
      console.log(`⚠️ Skipping ${invalidCount} products without barcodes`)
      skippedProducts += invalidCount
      
      // Add skipped items to results
      for (let i = 0; i < invalidCount; i++) {
        results.push({
          barcode: 'unknown',
          status: 'skipped',
          message: 'Product missing barcode'
        })
      }
    }

    console.log(`📦 Processing ${validInventory.length} valid products with barcodes`)

    // Step 3: Get all barcodes for bulk mapping
    const allBarcodes = validInventory.map(item => item.product!.barcode!)
    console.log(`🔍 Getting Shopify mappings for ${allBarcodes.length} barcodes...`)

    // Step 4: Bulk get Shopify mappings (database + API discovery)
    const bulkMappingResult = await getBulkShopifyMappings(allBarcodes)
    
    console.log(`📊 Mapping results:`)
    console.log(`   ✅ Found in database: ${bulkMappingResult.foundInDatabase}`)
    console.log(`   🔍 Discovered via API: ${bulkMappingResult.discoveredViaAPI}`)
    console.log(`   ❌ Not found: ${bulkMappingResult.notFound}`)
    console.log(`   ⏱️ Total mapping time: ${bulkMappingResult.totalTimeMs}ms`)

    // Step 5: Process each inventory item with its mapping
    console.log(`🔄 Step 5: Processing inventory updates...`)
    
    for (let i = 0; i < validInventory.length; i++) {
      const inventoryItem = validInventory[i]
      const product = inventoryItem.product!
      const barcode = product.barcode!
      const progress = `${i + 1}/${validInventory.length}`
      
      try {
        // Get the mapping result for this barcode
        const mappingResult = bulkMappingResult.mappings.get(barcode)
        
        if (!mappingResult?.found || !mappingResult.shopifyProductId) {
          console.log(`❌ [${progress}] No Shopify mapping found for: ${barcode}`)
          results.push({
            barcode,
            status: 'skipped',
            message: 'Product not found in Shopify - consider adding manually'
          })
          skippedProducts++
          continue
        }

        console.log(`✅ [${progress}] Using mapping: ${barcode} → ${mappingResult.shopifyProductId} (${mappingResult.source})`)

        // Verify the mapping works by getting the product
        let shopifyVariant
        try {
          const { shopifyApiRequest } = await import('./shopify')
          const response = await shopifyApiRequest(`/products/${mappingResult.shopifyProductId}.json`)
          
          if (response.product?.variants) {
            for (const variant of response.product.variants) {
              if (variant.barcode === barcode) {
                shopifyVariant = variant
                break
              }
            }
          }
        } catch (error) {
          console.warn(`⚠️ [${progress}] Failed to verify Shopify product ${mappingResult.shopifyProductId}:`, error)
        }

        if (!shopifyVariant) {
          console.log(`❌ [${progress}] Shopify product verification failed for: ${barcode}`)
          results.push({
            barcode,
            status: 'error',
            message: 'Shopify product mapping is invalid - needs re-discovery'
          })
          failedUpdates++
          continue
        }

        // Update inventory level
        const newQuantity = inventoryItem.available_quantity
        console.log(`📝 [${progress}] Updating inventory: ${product.name} → ${newQuantity}`)
        
        await updateInventoryLevel(
          shopifyVariant.inventory_item_id,
          shopifyLocation.id,
          newQuantity
        )

        console.log(`✅ [${progress}] Successfully updated: ${barcode}`)
        
        results.push({
          barcode,
          status: 'success',
          message: `Updated inventory to ${newQuantity}`,
          shopify_variant_id: shopifyVariant.id,
          shopify_inventory_item_id: shopifyVariant.inventory_item_id
        })
        
        successfulUpdates++

        // Progress reporting
        if ((i + 1) % 10 === 0) {
          const elapsed = (Date.now() - startTime) / 1000
          const avgTimePerItem = elapsed / (i + 1)
          const estimatedTotal = avgTimePerItem * validInventory.length
          const remaining = Math.max(0, estimatedTotal - elapsed)
          
          console.log(`📊 Progress: ${i + 1}/${validInventory.length} (${Math.round((i + 1) / validInventory.length * 100)}%) - ETA: ${Math.round(remaining)}s`)
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
    }

    const processingTime = Date.now() - startTime
    const successRate = validInventory.length > 0 ? Math.round((successfulUpdates / validInventory.length) * 100) : 0

    console.log(`🏁 Enhanced sync completed in ${(processingTime / 1000).toFixed(1)}s:`)
    console.log(`   ✅ Successful updates: ${successfulUpdates}`)
    console.log(`   ❌ Failed updates: ${failedUpdates}`)
    console.log(`   ⚠️ Skipped products: ${skippedProducts}`)
    console.log(`   📊 Success rate: ${successRate}%`)
    console.log(`   🔍 Database hits: ${bulkMappingResult.foundInDatabase}`)
    console.log(`   🌐 API discoveries: ${bulkMappingResult.discoveredViaAPI}`)

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

  } catch (error) {
    console.error('❌ Enhanced sync failed:', error)
    
    const processingTime = Date.now() - startTime
    
    return {
      store_id: storeId,
      store_name: storeName,
      total_products: inventory.length,
      successful_updates: 0,
      failed_updates: 0,
      skipped_products: inventory.length,
      processing_time_ms: processingTime,
      results: inventory.map(item => ({
        barcode: item.product?.barcode || 'unknown',
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Sync failed'
      })),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Initialize the enhanced sync system
 * Migrates hardcoded mappings to database and prepares for dynamic sync
 */
export async function initializeEnhancedSync(): Promise<{
  success: boolean
  message: string
  stats?: {
    totalProducts: number
    withShopifyIds: number
    withoutShopifyIds: number
    percentageMapped: number
  }
  migration?: {
    migrated: number
    errors: number
  }
}> {
  console.log(`🚀 Initializing Enhanced Sync System...`)
  
  try {
    // Step 1: Get current mapping statistics
    const { getShopifyMappingStats } = await import('./dynamicShopifyMapping')
    const initialStats = await getShopifyMappingStats()
    
    console.log(`📊 Current database state:`)
    console.log(`   📦 Total products: ${initialStats.totalProducts}`)
    console.log(`   ✅ With Shopify IDs: ${initialStats.withShopifyIds}`)
    console.log(`   ❌ Without Shopify IDs: ${initialStats.withoutShopifyIds}`)
    console.log(`   📈 Percentage mapped: ${initialStats.percentageMapped}%`)
    
    // Step 2: Migrate hardcoded mappings if needed
    let migrationResult
    if (initialStats.withoutShopifyIds > 0) {
      console.log(`🔄 Migrating hardcoded mappings to database...`)
      migrationResult = await migrateHardcodedMappings()
      
      console.log(`✅ Migration complete:`)
      console.log(`   📦 Migrated: ${migrationResult.migrated}`)
      console.log(`   ❌ Errors: ${migrationResult.errors}`)
    }
    
    // Step 3: Get final statistics
    const finalStats = await getShopifyMappingStats()
    
    console.log(`📊 Final database state:`)
    console.log(`   📦 Total products: ${finalStats.totalProducts}`)
    console.log(`   ✅ With Shopify IDs: ${finalStats.withShopifyIds}`)
    console.log(`   ❌ Without Shopify IDs: ${finalStats.withoutShopifyIds}`)
    console.log(`   📈 Percentage mapped: ${finalStats.percentageMapped}%`)
    
    const message = migrationResult 
      ? `Enhanced sync initialized. Migrated ${migrationResult.migrated} hardcoded mappings. ${finalStats.percentageMapped}% of products now have Shopify mappings.`
      : `Enhanced sync initialized. ${finalStats.percentageMapped}% of products have Shopify mappings.`
    
    return {
      success: true,
      message,
      stats: finalStats,
      migration: migrationResult
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize enhanced sync:', error)
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Initialization failed'
    }
  }
}

/**
 * Quick diagnostic function to test the enhanced sync system
 */
export async function diagnoseEnhancedSync(testBarcodes: string[] = ['4770175046139', '4770237043687']): Promise<{
  success: boolean
  message: string
  mappingResults?: Array<{
    barcode: string
    found: boolean
    source?: string
    shopifyProductId?: string
    searchTimeMs?: number
  }>
  error?: string
}> {
  console.log(`🔬 Diagnosing Enhanced Sync System...`)
  console.log(`🧪 Testing with barcodes: ${testBarcodes.join(', ')}`)
  
  try {
    const mappingResults = []
    
    for (const barcode of testBarcodes) {
      console.log(`🔍 Testing barcode: ${barcode}`)
      
      const mappingResult = await getShopifyMapping(barcode)
      
      mappingResults.push({
        barcode,
        found: mappingResult.found,
        source: mappingResult.source,
        shopifyProductId: mappingResult.shopifyProductId,
        searchTimeMs: mappingResult.searchTimeMs
      })
      
      if (mappingResult.found) {
        console.log(`✅ ${barcode}: Found via ${mappingResult.source} (${mappingResult.searchTimeMs}ms)`)
      } else {
        console.log(`❌ ${barcode}: Not found (${mappingResult.searchTimeMs}ms)`)
      }
    }
    
    const foundCount = mappingResults.filter(r => r.found).length
    const successRate = Math.round((foundCount / testBarcodes.length) * 100)
    
    const message = `Diagnostic complete: ${foundCount}/${testBarcodes.length} test barcodes found (${successRate}% success rate)`
    
    return {
      success: true,
      message,
      mappingResults
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error)
    
    return {
      success: false,
      message: 'Diagnostic failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}