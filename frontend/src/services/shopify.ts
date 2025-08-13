import { 
  ShopifyLocation, ShopifyProduct, ShopifyVariant, ShopifyInventoryLevel,
  ShopifyStockSyncResult, ShopifyPushResult, CurrentInventory
} from '../types'

// Shopify API configuration - now handled by the serverless proxy
// The proxy function will read environment variables server-side

// Helper function to make Shopify API requests via proxy
async function shopifyApiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const method = options.method || 'GET'
  const body = options.body
  
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

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Proxy error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  } catch (error) {
    console.error('Shopify API request failed:', error)
    
    // Check if it's a network/CORS error
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Unable to connect to Shopify API proxy. Please check your internet connection and try again.')
    }
    
    // Re-throw the original error if it's something else
    throw error
  }
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
      
      if (products.length < limit) break
      
      page++
      // Rate limiting: wait between requests
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    
    console.log(`✅ Loaded ${allProducts.length} total products from ${page} pages`)
    
    // Update cache
    shopifyProductsCache = allProducts
    cacheTimestamp = now
    
    return allProducts
  } catch (error) {
    console.error('❌ Error fetching all products:', error)
    // Return partial results if we have some
    return allProducts
  }
}

export async function findShopifyVariantByBarcode(barcode: string): Promise<ShopifyVariant | null> {
  try {
    console.log(`🔍 Searching for barcode: ${barcode}`)
    
    // Get all products (from cache or API)
    const products = await getAllShopifyProducts()
    
    console.log(`📦 Searching through ${products.length} products`)
    
    // Check products for matching barcodes
    for (const product of products) {
      if (product.variants) {
        for (const variant of product.variants) {
          // Try multiple matching strategies
          const shopifyBarcode = variant.barcode
          if (!shopifyBarcode) continue
          
          // Strategy 1: Exact match
          if (shopifyBarcode === barcode || shopifyBarcode.trim() === barcode.trim()) {
            console.log(`✅ Found variant for barcode ${barcode} (exact match):`, {
              product_title: product.title,
              variant_id: variant.id,
              inventory_item_id: variant.inventory_item_id,
              stored_barcode: shopifyBarcode
            })
            return variant
          }
          
          // Strategy 2: Remove leading zeros and compare
          const normalizedShopify = shopifyBarcode.replace(/^0+/, '')
          const normalizedSearch = barcode.replace(/^0+/, '')
          if (normalizedShopify === normalizedSearch && normalizedShopify.length > 0) {
            console.log(`✅ Found variant for barcode ${barcode} (normalized match):`, {
              product_title: product.title,
              variant_id: variant.id,
              inventory_item_id: variant.inventory_item_id,
              stored_barcode: shopifyBarcode,
              normalized_match: `${normalizedSearch} = ${normalizedShopify}`
            })
            return variant
          }
          
          // Strategy 3: Case insensitive alphanumeric only
          const alphaNumShopify = shopifyBarcode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
          const alphaNumSearch = barcode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
          if (alphaNumShopify === alphaNumSearch && alphaNumShopify.length > 0) {
            console.log(`✅ Found variant for barcode ${barcode} (alphanumeric match):`, {
              product_title: product.title,
              variant_id: variant.id,
              inventory_item_id: variant.inventory_item_id,
              stored_barcode: shopifyBarcode,
              alphanumeric_match: `${alphaNumSearch} = ${alphaNumShopify}`
            })
            return variant
          }
        }
      }
    }
    
    console.log(`❌ No variant found for barcode: ${barcode} in ${products.length} products`)
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

  // Find the Shopify location that matches the store name
  const shopifyLocation = await findShopifyLocationByName(storeName)
  
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

  console.log(`🚀 Starting sync for ${inventory.length} products to location: ${shopifyLocation.name}`)
  
  // Process each inventory item
  for (const inventoryItem of inventory) {
    const product = inventoryItem.product
    if (!product || !product.barcode) {
      console.log(`⚠️ Skipping product: missing barcode`, { product: product?.name || 'Unknown' })
      results.push({
        barcode: product?.sku || 'unknown',
        status: 'skipped',
        message: 'Product missing barcode'
      })
      skippedProducts++
      continue
    }

    console.log(`🔄 Processing: ${product.name} (${product.barcode}) - Quantity: ${inventoryItem.available_quantity}`)

    try {
      // Find the corresponding Shopify variant by barcode
      const shopifyVariant = await findShopifyVariantByBarcode(product.barcode)
      
      if (!shopifyVariant) {
        console.log(`❌ Product not found in Shopify: ${product.barcode}`)
        results.push({
          barcode: product.barcode,
          status: 'skipped',
          message: 'Product not found in Shopify'
        })
        skippedProducts++
        continue
      }

      // Get current inventory levels for this item
      const currentLevels = await getInventoryLevels(shopifyVariant.inventory_item_id)
      const currentLevel = currentLevels.find(level => level.location_id === shopifyLocation.id)
      
      const inventoryBefore = currentLevel ? currentLevel.available : 0

      // Update the inventory level
      await updateInventoryLevel(
        shopifyVariant.inventory_item_id,
        shopifyLocation.id,
        inventoryItem.available_quantity
      )

      results.push({
        barcode: product.barcode,
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

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      console.error(`Error updating Shopify inventory for ${product.barcode}:`, error)
      results.push({
        barcode: product.barcode,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        shopify_variant_id: undefined,
        shopify_inventory_item_id: undefined
      })
      failedUpdates++
    }
  }

  return {
    store_id: storeId,
    store_name: storeName,
    shopify_location_name: shopifyLocation.name,
    shopify_location_id: shopifyLocation.id,
    total_products: inventory.length,
    successful_updates: successfulUpdates,
    failed_updates: failedUpdates,
    skipped_products: skippedProducts,
    processing_time_ms: Date.now() - startTime,
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