import { 
  ShopifyStockSyncResult, ShopifyPushResult, CurrentInventory
} from '../types'
import { 
  findShopifyLocationByName, updateInventoryLevel, shopifyApiRequest
} from './shopify'
import { supabase } from '../utils/supabase'

// =====================================================
// ENHANCED VARIANT SYNC SERVICE
// =====================================================
// This service handles missing shopify_variant_id values during sync
// and attempts to resolve them in real-time

interface VariantDiscoveryResult {
  shopifyProductId: number
  shopifyVariantId: number
  shopifyInventoryItemId?: number
  found: boolean
  method: 'database' | 'graphql' | 'rest' | 'none'
}

/**
 * Enhanced sync that resolves missing variant IDs on-the-fly
 */
export async function enhancedVariantSyncStoreStockToShopify(
  storeId: string,
  storeName: string,
  inventory: CurrentInventory[]
): Promise<ShopifyStockSyncResult> {
  console.log(`🚀 ENHANCED VARIANT SYNC: Starting sync for ${inventory.length} products`)
  console.log(`📍 Target store: ${storeName}`)
  
  const startTime = Date.now()
  const results: ShopifyPushResult[] = []
  let successfulUpdates = 0
  let failedUpdates = 0
  let skippedProducts = 0
  let variantsFixed = 0

  try {
    // Step 1: Find Shopify location
    console.log(`📍 Step 1: Finding Shopify location...`)
    const shopifyLocation = await findShopifyLocationByName(storeName)
    
    if (!shopifyLocation) {
      throw new Error(`Shopify location "${storeName}" not found`)
    }
    
    console.log(`✅ Found Shopify location: ${shopifyLocation.name} (ID: ${shopifyLocation.id})`)

    // Step 2: Process each inventory item
    console.log(`🔄 Step 2: Processing ${inventory.length} inventory items...`)
    
    for (let i = 0; i < inventory.length; i++) {
      const item = inventory[i]
      const progress = `${i + 1}/${inventory.length}`
      
      if (!item.product) {
        console.log(`⚠️ [${progress}] Skipping item without product`)
        skippedProducts++
        continue
      }

      const { barcode, name } = item.product
      const quantity = item.quantity

      if (!barcode) {
        console.log(`⚠️ [${progress}] Skipping ${name} - no barcode`)
        results.push({
          barcode: barcode || 'unknown',
          status: 'skipped',
          message: 'No barcode available'
        })
        skippedProducts++
        continue
      }

      console.log(`🔄 [${progress}] Processing: ${name} (${barcode}) - Qty: ${quantity}`)

      try {
        // Step 2a: Get or discover variant ID
        const variantInfo = await getOrDiscoverVariantId(barcode, item.product.id!)
        
        if (!variantInfo.found) {
          console.log(`❌ [${progress}] Variant not found for ${barcode}`)
          results.push({
            barcode,
            status: 'skipped',
            message: 'Product not found in Shopify'
          })
          skippedProducts++
          continue
        }

        if (variantInfo.method !== 'database') {
          console.log(`🔧 [${progress}] Fixed missing variant ID via ${variantInfo.method}`)
          variantsFixed++
        }

        // Step 2b: Update inventory level
        if (variantInfo.shopifyInventoryItemId) {
          await updateInventoryLevel(
            variantInfo.shopifyInventoryItemId,
            shopifyLocation.id,
            quantity
          )

          console.log(`✅ [${progress}] Updated ${barcode}: ${quantity} units`)
          results.push({
            barcode,
            status: 'success',
            message: `Updated to ${quantity} units`
          })
          successfulUpdates++
        } else {
          console.log(`⚠️ [${progress}] No inventory item ID for ${barcode}`)
          results.push({
            barcode,
            status: 'error',
            message: 'Missing inventory item ID'
          })
          failedUpdates++
        }

      } catch (error) {
        console.error(`❌ [${progress}] Error processing ${barcode}:`, error)
        results.push({
          barcode,
          status: 'error',
          message: error instanceof Error ? error.message : 'Processing error'
        })
        failedUpdates++
      }

      // Rate limiting
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    const processingTime = Date.now() - startTime
    
    console.log(`🎉 Enhanced variant sync completed in ${processingTime}ms`)
    console.log(`✅ Successful: ${successfulUpdates}`)
    console.log(`❌ Failed: ${failedUpdates}`)
    console.log(`⏭️ Skipped: ${skippedProducts}`)
    console.log(`🔧 Variants fixed: ${variantsFixed}`)

    return {
      store_id: storeId,
      store_name: storeName,
      total_products: inventory.length,
      successful_updates: successfulUpdates,
      failed_updates: failedUpdates,
      skipped_products: skippedProducts,
      processing_time_ms: processingTime,
      results
    }

  } catch (error) {
    console.error('❌ Enhanced variant sync failed:', error)
    
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
 * Get variant ID from database or discover via Shopify API
 */
async function getOrDiscoverVariantId(barcode: string, productId: string): Promise<VariantDiscoveryResult> {
  console.log(`🔍 Getting variant ID for barcode: ${barcode}`)
  
  // Step 1: Check database first (including inventory_item_id if available)
  const { data: existingProduct, error } = await supabase
    .from('products')
    .select('shopify_product_id, shopify_variant_id')
    .eq('id', productId)
    .single()
  
  if (!error && existingProduct?.shopify_variant_id) {
    console.log(`✅ Found in database: ${barcode} → variant ${existingProduct.shopify_variant_id}`)
    
    // Try to get inventory item ID if we don't have it
    let shopifyInventoryItemId = undefined
    try {
      const variantResponse = await shopifyApiRequest(`/variants/${existingProduct.shopify_variant_id}.json`)
      shopifyInventoryItemId = variantResponse.variant?.inventory_item_id
    } catch (error) {
      console.warn(`⚠️ Could not get inventory item ID for variant ${existingProduct.shopify_variant_id}`)
    }
    
    return {
      shopifyProductId: existingProduct.shopify_product_id,
      shopifyVariantId: existingProduct.shopify_variant_id,
      shopifyInventoryItemId,
      found: true,
      method: 'database'
    }
  }
  
  // Step 2: Try GraphQL discovery
  console.log(`🔍 Variant ID missing, searching Shopify via GraphQL...`)
  
  try {
    const graphqlResult = await findVariantByBarcodeGraphQL(barcode)
    
    if (graphqlResult) {
      // Save discovery to database
      await saveVariantMapping(productId, graphqlResult)
      
      return {
        shopifyProductId: graphqlResult.shopifyProductId,
        shopifyVariantId: graphqlResult.shopifyVariantId,
        shopifyInventoryItemId: graphqlResult.shopifyInventoryItemId,
        found: true,
        method: 'graphql'
      }
    }
  } catch (error) {
    console.warn(`⚠️ GraphQL discovery failed for ${barcode}:`, error)
  }
  
  // Step 3: Try REST discovery (more comprehensive but slower)
  console.log(`🔍 GraphQL failed, trying REST search...`)
  
  try {
    const restResult = await findVariantByBarcodeREST(barcode)
    
    if (restResult) {
      // Save discovery to database
      await saveVariantMapping(productId, restResult)
      
      return {
        shopifyProductId: restResult.shopifyProductId,
        shopifyVariantId: restResult.shopifyVariantId,
        shopifyInventoryItemId: restResult.shopifyInventoryItemId,
        found: true,
        method: 'rest'
      }
    }
  } catch (error) {
    console.warn(`⚠️ REST discovery failed for ${barcode}:`, error)
  }
  
  // Step 4: Not found
  console.log(`❌ Variant not found anywhere: ${barcode}`)
  
  return {
    shopifyProductId: 0,
    shopifyVariantId: 0,
    found: false,
    method: 'none'
  }
}

/**
 * Find variant by barcode using GraphQL
 */
async function findVariantByBarcodeGraphQL(barcode: string) {
  const graphqlQuery = `
    query {
      products(first: 250, query: "barcode:'${barcode}'") {
        edges {
          node {
            id
            title
            variants(first: 10) {
              edges {
                node {
                  id
                  barcode
                  inventoryItem {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `

  const response = await shopifyApiRequest('/graphql.json', {
    method: 'POST',
    body: JSON.stringify({ query: graphqlQuery })
  })

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`)
  }

  if (response.data?.products?.edges?.length > 0) {
    for (const productEdge of response.data.products.edges) {
      const product = productEdge.node
      
      if (product.variants?.edges) {
        for (const variantEdge of product.variants.edges) {
          const variant = variantEdge.node
          
          if (variant.barcode === barcode) {
            return {
              shopifyProductId: parseInt(product.id.replace('gid://shopify/Product/', '')),
              shopifyVariantId: parseInt(variant.id.replace('gid://shopify/ProductVariant/', '')),
              shopifyInventoryItemId: parseInt(variant.inventoryItem.id.replace('gid://shopify/InventoryItem/', '')),
              productTitle: product.title
            }
          }
        }
      }
    }
  }

  return null
}

/**
 * Find variant by barcode using REST API
 */
async function findVariantByBarcodeREST(barcode: string, maxProducts = 1000) {
  let sinceId = 0
  let searchedProducts = 0
  const limit = 250

  while (searchedProducts < maxProducts) {
    const endpoint = sinceId > 0 
      ? `/products.json?fields=id,title,variants&limit=${limit}&since_id=${sinceId}`
      : `/products.json?fields=id,title,variants&limit=${limit}`
    
    const response = await shopifyApiRequest(endpoint)
    const products = response.products || []
    
    if (products.length === 0) break
    
    searchedProducts += products.length
    
    for (const product of products) {
      if (product.variants) {
        for (const variant of product.variants) {
          if (variant.barcode === barcode) {
            return {
              shopifyProductId: product.id,
              shopifyVariantId: variant.id,
              shopifyInventoryItemId: variant.inventory_item_id,
              productTitle: product.title
            }
          }
        }
      }
    }
    
    sinceId = products[products.length - 1].id
  }

  return null
}

/**
 * Save discovered variant mapping to database
 */
async function saveVariantMapping(productId: string, variantInfo: any): Promise<void> {
  try {
    const { error } = await supabase
      .from('products')
      .update({
        shopify_product_id: variantInfo.shopifyProductId,
        shopify_variant_id: variantInfo.shopifyVariantId,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
    
    if (error) {
      console.warn(`⚠️ Failed to save variant mapping for product ${productId}:`, error)
    } else {
      console.log(`💾 Saved variant mapping: product ${productId} → variant ${variantInfo.shopifyVariantId}`)
    }
  } catch (error) {
    console.warn(`⚠️ Error saving variant mapping for product ${productId}:`, error)
  }
}
