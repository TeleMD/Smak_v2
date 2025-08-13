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

export async function findShopifyVariantByBarcode(barcode: string): Promise<ShopifyVariant | null> {
  try {
    console.log(`🔍 Searching for barcode: ${barcode}`)
    
    // Search for products - increased limit and added barcode field
    const response = await shopifyApiRequest(`/products.json?fields=id,title,variants&limit=250`)
    const products: ShopifyProduct[] = response.products || []
    
    console.log(`📦 Found ${products.length} products in Shopify`)
    
    // Log first few products for debugging
    console.log('Sample products:', products.slice(0, 3).map(p => ({
      title: p.title,
      variants: p.variants?.map(v => ({ id: v.id, barcode: v.barcode }))
    })))
    
    for (const product of products) {
      if (product.variants) {
        for (const variant of product.variants) {
          // Try exact match and trimmed match
          if (variant.barcode === barcode || variant.barcode?.trim() === barcode.trim()) {
            console.log(`✅ Found variant for barcode ${barcode}:`, {
              product_title: product.title,
              variant_id: variant.id,
              inventory_item_id: variant.inventory_item_id,
              stored_barcode: variant.barcode
            })
            return variant
          }
        }
      }
    }
    
    console.log(`❌ No variant found for barcode: ${barcode}`)
    
    // Log all barcodes for debugging if not found
    const allBarcodes = products.flatMap(p => 
      p.variants?.map(v => v.barcode).filter(Boolean) || []
    )
    console.log(`📊 Available barcodes (first 10):`, allBarcodes.slice(0, 10))
    
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