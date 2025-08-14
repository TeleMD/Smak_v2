import { 
  ShopifyLocation, ShopifyProduct, ShopifyVariant, ShopifyInventoryLevel,
  ShopifyStockSyncResult, ShopifyPushResult, CurrentInventory
} from '../types'

// Shopify API configuration - now handled by the serverless proxy
// The proxy function will read environment variables server-side

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxCallsPerSecond: 2, // Shopify allows 2 calls per second
  bucketSize: 40, // Standard bucket size
  baseDelay: 500, // Base delay between calls (500ms = 2 calls/second)
  maxRetries: 5,
  maxBackoffDelay: 30000 // Max 30 seconds backoff
}

// Rate limiter state
let rateLimitState = {
  calls: [] as number[],
  retryCount: 0
}

// Helper function to implement exponential backoff
function calculateBackoffDelay(retryCount: number): number {
  const baseDelay = 1000 // Start with 1 second
  const maxDelay = RATE_LIMIT_CONFIG.maxBackoffDelay
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)
  
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.1 * delay
  return Math.floor(delay + jitter)
}

// Helper function to check if we should rate limit
function shouldRateLimit(): boolean {
  const now = Date.now()
  const oneSecondAgo = now - 1000
  
  // Clean old calls
  rateLimitState.calls = rateLimitState.calls.filter(time => time > oneSecondAgo)
  
  // Check if we're at the limit
  return rateLimitState.calls.length >= RATE_LIMIT_CONFIG.maxCallsPerSecond
}

// Helper function to wait for rate limit
async function waitForRateLimit(): Promise<void> {
  while (shouldRateLimit()) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_CONFIG.baseDelay))
  }
  rateLimitState.calls.push(Date.now())
}

// Helper function to make Shopify API requests via proxy with proper rate limiting
async function shopifyApiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const method = options.method || 'GET'
  const body = options.body
  
  // Apply rate limiting before making the request
  await waitForRateLimit()
  
  let retries = 0
  
  while (retries <= RATE_LIMIT_CONFIG.maxRetries) {
    try {
      // Parse body appropriately
      let parsedBody = undefined
      if (body) {
        try {
          // If it's a string, try to parse it as JSON
          parsedBody = typeof body === 'string' ? JSON.parse(body) : body
        } catch (e) {
          // If parsing fails, use as-is
          parsedBody = body
        }
      }
      
      console.log(`🌐 API Request: ${method} ${endpoint} (attempt ${retries + 1})`)
      
      // Use our serverless proxy function to avoid CORS issues
      const response = await fetch('/api/shopify-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint,
          method,
          body: parsedBody,
        }),
      })

      if (response.status === 429) {
        // Rate limit hit - implement exponential backoff
        const backoffDelay = calculateBackoffDelay(retries)
        console.warn(`⚠️ Rate limit hit (429). Waiting ${backoffDelay}ms before retry ${retries + 1}/${RATE_LIMIT_CONFIG.maxRetries}`)
        
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
        retries++
        continue
      }

      if (!response.ok) {
        const errorData = await response.json()
        
        // For 400/422 errors, don't retry
        if (response.status === 400 || response.status === 422) {
          throw new Error(errorData.error || `Shopify API error: ${response.status} ${response.statusText}`)
        }
        
        // For other errors, retry if we haven't exceeded max retries
        if (retries < RATE_LIMIT_CONFIG.maxRetries) {
          console.warn(`⚠️ API error ${response.status}. Retrying in ${RATE_LIMIT_CONFIG.baseDelay}ms...`)
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_CONFIG.baseDelay))
          retries++
          continue
        }
        
        throw new Error(errorData.error || `Proxy error: ${response.status} ${response.statusText}`)
      }

      // Reset retry count on success
      rateLimitState.retryCount = 0
      console.log(`✅ API Request successful: ${method} ${endpoint}`)
      return response.json()
      
    } catch (error) {
      // Check if it's a network/CORS error
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        if (retries < RATE_LIMIT_CONFIG.maxRetries) {
          console.warn(`⚠️ Network error. Retrying in ${RATE_LIMIT_CONFIG.baseDelay}ms...`)
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_CONFIG.baseDelay))
          retries++
          continue
        }
        throw new Error('Unable to connect to Shopify API proxy. Please check your internet connection and try again.')
      }
      
      // If we've exhausted retries or it's not a retryable error, throw
      if (retries >= RATE_LIMIT_CONFIG.maxRetries || !(error instanceof Error && error.message.includes('429'))) {
        console.error('Shopify API request failed after retries:', error)
        throw error
      }
      
      retries++
    }
  }
  
  throw new Error('Maximum retries exceeded')
}

// =====================================================
// SHOPIFY LOCATIONS
// =====================================================

export async function getShopifyLocations(): Promise<ShopifyLocation[]> {
  const response = await shopifyApiRequest('/locations.json')
  return response.locations || []
}

export async function findShopifyLocationByName(locationName: string): Promise<ShopifyLocation | null> {
  const locations = await getShopifyLocations()
  return locations.find(location => 
    location.name.toLowerCase() === locationName.toLowerCase()
  ) || null
}

// =====================================================
// SHOPIFY PRODUCTS AND VARIANTS
// =====================================================

export async function getShopifyProducts(limit = 250): Promise<ShopifyProduct[]> {
  const response = await shopifyApiRequest(`/products.json?limit=${limit}`)
  return response.products || []
}

// Cache for Shopify products to avoid repeated API calls
let shopifyProductsCache: ShopifyProduct[] | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export async function getAllShopifyProducts(): Promise<ShopifyProduct[]> {
  const now = Date.now()
  
  // Return cached data if still valid
  if (shopifyProductsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log(`📦 Using cached Shopify products: ${shopifyProductsCache.length} products`)
    return shopifyProductsCache
  }
  
  console.log(`🔄 Fetching all Shopify products...`)
  let allProducts: ShopifyProduct[] = []
  let page = 1
  const limit = 250
  
  try {
    while (true) {
      console.log(`📄 Fetching page ${page}...`)
      
      const response = await shopifyApiRequest(`/products.json?fields=id,title,variants&limit=${limit}&page=${page}`)
      const products: ShopifyProduct[] = response.products || []
      
      if (products.length === 0) break
      
      allProducts = allProducts.concat(products)
      console.log(`📊 Total loaded so far: ${allProducts.length} products`)
      
      if (products.length < limit) break
      
      page++
      // Longer delay to be extra safe with rate limits
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    console.log(`✅ Loaded ${allProducts.length} total products from ${page} pages`)
    
    // Update cache
    shopifyProductsCache = allProducts
    cacheTimestamp = now
    
    return allProducts
  } catch (error) {
    console.error('❌ Error fetching all products:', error)
    console.log(`⚠️ Returning ${allProducts.length} partial results`)
    
    // If we got some products, cache them and return
    if (allProducts.length > 0) {
      shopifyProductsCache = allProducts
      cacheTimestamp = now
    }
    
    return allProducts
  }
}

// Direct product search by barcode - much more efficient than loading all products
export async function searchProductsByBarcode(barcode: string): Promise<ShopifyProduct[]> {
  try {
    console.log(`🔍 Direct search for barcode: ${barcode}`)
    
    // Shopify doesn't have direct barcode search in REST API, so we skip targeted search
    // and go straight to the efficient paginated approach
    console.log(`ℹ️ Skipping targeted search (Shopify REST API limitation), using paginated search`)
    return []
  } catch (error) {
    console.error('Error searching products by barcode:', error)
    return []
  }
}

// Smart barcode matching with multiple strategies
function matchesBarcode(shopifyBarcode: string | undefined, searchBarcode: string): { matches: boolean; strategy: string } {
  if (!shopifyBarcode || !searchBarcode) {
    return { matches: false, strategy: 'no_barcode' }
  }
  
  // Strategy 1: Exact match
  if (shopifyBarcode === searchBarcode || shopifyBarcode.trim() === searchBarcode.trim()) {
    return { matches: true, strategy: 'exact' }
  }
  
  // Strategy 2: Remove leading zeros and compare
  const normalizedShopify = shopifyBarcode.replace(/^0+/, '')
  const normalizedSearch = searchBarcode.replace(/^0+/, '')
  if (normalizedShopify === normalizedSearch && normalizedShopify.length > 0) {
    return { matches: true, strategy: 'normalized' }
  }
  
  // Strategy 3: Case insensitive alphanumeric only
  const alphaNumShopify = shopifyBarcode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const alphaNumSearch = searchBarcode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  if (alphaNumShopify === alphaNumSearch && alphaNumShopify.length > 0) {
    return { matches: true, strategy: 'alphanumeric' }
  }
  
  // Strategy 4: Partial match (for cases where one might contain the other)
  if (shopifyBarcode.includes(searchBarcode) || searchBarcode.includes(shopifyBarcode)) {
    if (Math.abs(shopifyBarcode.length - searchBarcode.length) <= 2) { // Similar lengths
      return { matches: true, strategy: 'partial' }
    }
  }
  
  return { matches: false, strategy: 'no_match' }
}

export async function findShopifyVariantByBarcode(barcode: string): Promise<ShopifyVariant | null> {
  try {
    console.log(`🔍 Optimized search for barcode: ${barcode}`)
    
    // Use cursor-based pagination for more efficient searching
    let sinceId = 0
    let searchedProducts = 0
    const maxProducts = 1000 // Search through up to 1000 products
    const limit = 250
    
    while (searchedProducts < maxProducts) {
      console.log(`📄 Searching products since ID ${sinceId}... (searched: ${searchedProducts})`)
      
      try {
        const endpoint = sinceId > 0 
          ? `/products.json?fields=id,title,variants&limit=${limit}&since_id=${sinceId}`
          : `/products.json?fields=id,title,variants&limit=${limit}`
          
        const response = await shopifyApiRequest(endpoint)
        const products: ShopifyProduct[] = response.products || []
        
        if (products.length === 0) {
          console.log(`📋 No more products found, searched ${searchedProducts} total`)
          break
        }
        
        console.log(`📦 Checking ${products.length} products for barcode matches...`)
        
        // Search through this batch
        for (const product of products) {
          if (product.variants) {
            for (const variant of product.variants) {
              const matchResult = matchesBarcode(variant.barcode, barcode)
              
              if (matchResult.matches) {
                console.log(`✅ Found variant for barcode ${barcode} (${matchResult.strategy} match, searched ${searchedProducts + products.indexOf(product) + 1} products):`, {
                  product_title: product.title,
                  variant_id: variant.id,
                  inventory_item_id: variant.inventory_item_id,
                  stored_barcode: variant.barcode,
                  match_strategy: matchResult.strategy
                })
                return variant
              }
            }
          }
        }
        
        // Update for next iteration
        searchedProducts += products.length
        sinceId = products[products.length - 1].id
        
        // If we got fewer products than the limit, we've reached the end
        if (products.length < limit) {
          console.log(`📋 Reached end of products, searched ${searchedProducts} total`)
          break
        }
        
      } catch (error) {
        console.warn(`⚠️ Error searching products since ID ${sinceId}:`, error)
        break
      }
    }
    
    console.log(`❌ No variant found for barcode: ${barcode} after searching ${searchedProducts} products`)
    return null
  } catch (error) {
    console.error('Error finding Shopify variant by barcode:', error)
    return null
  }
}

// =====================================================
// INVENTORY MANAGEMENT
// =====================================================

export async function getInventoryLevels(inventoryItemId: number): Promise<ShopifyInventoryLevel[]> {
  const response = await shopifyApiRequest(`/inventory_levels.json?inventory_item_ids=${inventoryItemId}`)
  return response.inventory_levels || []
}

export async function updateInventoryLevel(
  inventoryItemId: number, 
  locationId: number, 
  availableQuantity: number
): Promise<ShopifyInventoryLevel> {
  const response = await shopifyApiRequest('/inventory_levels/set.json', {
    method: 'POST',
    body: JSON.stringify({
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available: availableQuantity
    })
  })
  return response.inventory_level
}

// =====================================================
// STOCK SYNCHRONIZATION
// =====================================================

export async function syncStoreStockToShopify(
  storeId: string,
  storeName: string,
  inventory: CurrentInventory[]
): Promise<ShopifyStockSyncResult> {
  const startTime = Date.now()
  const results: ShopifyPushResult[] = []
  let successfulUpdates = 0
  let failedUpdates = 0
  let skippedProducts = 0

  console.log(`🚀 Starting optimized sync for ${inventory.length} products to store: ${storeName}`)

  // Find the Shopify location that matches the store name
  let shopifyLocation
  try {
    shopifyLocation = await findShopifyLocationByName(storeName)
  } catch (error) {
    console.error('Error finding Shopify location:', error)
    return {
      store_id: storeId,
      store_name: storeName,
      total_products: inventory.length,
      successful_updates: 0,
      failed_updates: 0,
      skipped_products: inventory.length,
      processing_time_ms: Date.now() - startTime,
      results: inventory.map(item => ({
        barcode: item.product?.barcode || item.product?.sku || 'unknown',
        status: 'skipped' as const,
        message: `Error finding Shopify location: ${error instanceof Error ? error.message : 'Unknown error'}`
      })),
      error: `Error finding Shopify location: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
  
  if (!shopifyLocation) {
    return {
      store_id: storeId,
      store_name: storeName,
      total_products: inventory.length,
      successful_updates: 0,
      failed_updates: 0,
      skipped_products: inventory.length,
      processing_time_ms: Date.now() - startTime,
      results: inventory.map(item => ({
        barcode: item.product?.barcode || item.product?.sku || 'unknown',
        status: 'skipped' as const,
        message: `No Shopify location found with name "${storeName}"`
      })),
      error: `No Shopify location found with name "${storeName}"`
    }
  }

  console.log(`📍 Found Shopify location: ${shopifyLocation.name} (ID: ${shopifyLocation.id})`)
  
  // Filter out products without barcodes upfront
  const validInventory = inventory.filter(item => item.product?.barcode)
  const invalidCount = inventory.length - validInventory.length
  
  if (invalidCount > 0) {
    console.log(`⚠️ Skipping ${invalidCount} products without barcodes`)
    for (let i = 0; i < invalidCount; i++) {
      results.push({
        barcode: 'unknown',
        status: 'skipped',
        message: 'Product missing barcode'
      })
    }
    skippedProducts += invalidCount
  }

  console.log(`🔄 Processing ${validInventory.length} valid products...`)
  
  // Process each inventory item with optimized error handling
  for (let i = 0; i < validInventory.length; i++) {
    const inventoryItem = validInventory[i]
    const product = inventoryItem.product!
    const progress = `${i + 1}/${validInventory.length}`
    
    console.log(`🔄 [${progress}] Processing: ${product.name} (${product.barcode}) - Quantity: ${inventoryItem.available_quantity}`)

    try {
      // Find the corresponding Shopify variant by barcode using optimized search
      const shopifyVariant = await findShopifyVariantByBarcode(product.barcode!)
      
      if (!shopifyVariant) {
        console.log(`❌ [${progress}] Product not found in Shopify: ${product.barcode}`)
        results.push({
          barcode: product.barcode!,
          status: 'skipped',
          message: 'Product not found in Shopify'
        })
        skippedProducts++
        continue
      }

      console.log(`✅ [${progress}] Found Shopify variant: ${shopifyVariant.id}`)

      // Get current inventory levels for this item
      let inventoryBefore = 0
      try {
        const currentLevels = await getInventoryLevels(shopifyVariant.inventory_item_id)
        const currentLevel = currentLevels.find(level => level.location_id === shopifyLocation.id)
        inventoryBefore = currentLevel ? currentLevel.available : 0
      } catch (error) {
        console.warn(`⚠️ [${progress}] Could not get current inventory levels, assuming 0:`, error)
      }

      // Update the inventory level
      await updateInventoryLevel(
        shopifyVariant.inventory_item_id,
        shopifyLocation.id,
        inventoryItem.available_quantity
      )

      console.log(`✅ [${progress}] Updated inventory: ${inventoryBefore} → ${inventoryItem.available_quantity}`)

      results.push({
        barcode: product.barcode!,
        status: 'success',
        message: `Updated from ${inventoryBefore} to ${inventoryItem.available_quantity}`,
        shopify_variant_id: shopifyVariant.id,
        shopify_inventory_item_id: shopifyVariant.inventory_item_id,
        inventory_levels_before: [{
          location_name: shopifyLocation.name,
          location_id: shopifyLocation.id,
          quantity: inventoryBefore
        }],
        inventory_levels_after: [{
          location_name: shopifyLocation.name,
          location_id: shopifyLocation.id,
          quantity: inventoryItem.available_quantity
        }],
        total_before: inventoryBefore,
        total_after: inventoryItem.available_quantity
      })
      successfulUpdates++

      // Progress update every 10 items
      if ((i + 1) % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const avgTimePerItem = elapsed / (i + 1)
        const estimatedTotal = avgTimePerItem * validInventory.length
        console.log(`📊 Progress: ${i + 1}/${validInventory.length} (${Math.round((i + 1) / validInventory.length * 100)}%) - ETA: ${Math.round(estimatedTotal - elapsed)}s`)
      }

    } catch (error) {
      console.error(`❌ [${progress}] Error updating Shopify inventory for ${product.barcode}:`, error)
      
      // Determine error type for better reporting
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
        barcode: product.barcode!,
        status: 'error',
        message: errorMessage,
        shopify_variant_id: undefined,
        shopify_inventory_item_id: undefined
      })
      failedUpdates++
    }
  }

  const processingTime = Date.now() - startTime
  const successRate = validInventory.length > 0 ? Math.round((successfulUpdates / validInventory.length) * 100) : 0

  console.log(`🏁 Sync completed in ${(processingTime / 1000).toFixed(1)}s:`)
  console.log(`   ✅ Successful: ${successfulUpdates}`)
  console.log(`   ❌ Failed: ${failedUpdates}`)
  console.log(`   ⚠️ Skipped: ${skippedProducts}`)
  console.log(`   📊 Success Rate: ${successRate}%`)

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
// UTILITY FUNCTIONS
// =====================================================

export async function testShopifyConnection(): Promise<boolean> {
  try {
    console.log('Testing Shopify connection via proxy...')
    
    await shopifyApiRequest('/shop.json')
    console.log('Shopify connection test successful!')
    return true
  } catch (error) {
    console.error('Shopify connection test failed:', error)
    return false
  }
}

export async function validateShopifyCredentials(): Promise<{ valid: boolean; shopName?: string; error?: string }> {
  try {
    const response = await shopifyApiRequest('/shop.json')
    return {
      valid: true,
      shopName: response.shop?.name || 'Unknown Shop'
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Test function to validate the sync improvements
export async function testShopifySyncOptimizations(testBarcode: string): Promise<{
  success: boolean
  searchTime: number
  variantFound: boolean
  searchStrategy?: string
  error?: string
}> {
  const startTime = Date.now()
  
  try {
    console.log(`🧪 Testing sync optimizations with barcode: ${testBarcode}`)
    
    // Test the optimized search
    const variant = await findShopifyVariantByBarcode(testBarcode)
    const searchTime = Date.now() - startTime
    
    if (variant) {
      console.log(`✅ Test successful! Found variant in ${searchTime}ms`)
      return {
        success: true,
        searchTime,
        variantFound: true,
        searchStrategy: 'optimized_search'
      }
    } else {
      console.log(`ℹ️ Test completed - no variant found for barcode (${searchTime}ms)`)
      return {
        success: true,
        searchTime,
        variantFound: false
      }
    }
  } catch (error) {
    const searchTime = Date.now() - startTime
    console.error(`❌ Test failed after ${searchTime}ms:`, error)
    return {
      success: false,
      searchTime,
      variantFound: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}