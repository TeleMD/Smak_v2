import { 
  ShopifyLocation, ShopifyProduct, ShopifyVariant, ShopifyInventoryLevel,
  ShopifyStockSyncResult, ShopifyPushResult, CurrentInventory
} from '../types'

// Shopify API configuration
const SHOPIFY_ACCESS_TOKEN = import.meta.env.VITE_SHOPIFY_ACCESS_TOKEN || ''
const SHOPIFY_STORE_URL = import.meta.env.VITE_SHOPIFY_STORE_URL || 'https://admin.shopify.com/store/qajg9w-pn'
const SHOPIFY_API_VERSION = '2024-01'

// Extract store domain from URL
function getStoreDomain(storeUrl: string): string {
  // Extract store name from URL like https://admin.shopify.com/store/qajg9w-pn
  const match = storeUrl.match(/\/store\/([^\/]+)/)
  if (match) {
    return `${match[1]}.myshopify.com`
  }
  throw new Error('Invalid Shopify store URL format')
}

const SHOPIFY_DOMAIN = getStoreDomain(SHOPIFY_STORE_URL)

// Helper function to make Shopify API requests
async function shopifyApiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  if (!SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Shopify access token not configured. Please set VITE_SHOPIFY_ACCESS_TOKEN environment variable.')
  }

  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  return response.json()
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
    // Search for products with the specific barcode
    const response = await shopifyApiRequest(`/products.json?fields=id,variants&limit=250`)
    const products: ShopifyProduct[] = response.products || []
    
    for (const product of products) {
      const variant = product.variants?.find(v => v.barcode === barcode)
      if (variant) {
        return variant
      }
    }
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

  // Process each inventory item
  for (const inventoryItem of inventory) {
    const product = inventoryItem.product
    if (!product || !product.barcode) {
      results.push({
        barcode: product?.sku || 'unknown',
        status: 'skipped',
        message: 'Product missing barcode'
      })
      skippedProducts++
      continue
    }

    try {
      // Find the corresponding Shopify variant by barcode
      const shopifyVariant = await findShopifyVariantByBarcode(product.barcode)
      
      if (!shopifyVariant) {
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
    await shopifyApiRequest('/shop.json')
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