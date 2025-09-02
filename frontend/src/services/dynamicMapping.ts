// Dynamic Product Mapping Service
// Intelligent Shopify product identification with self-learning capabilities

import { supabase } from '../utils/supabase'
import { ShopifyVariant } from '../types'
import { shopifyApiRequest } from './shopify'

// Types for dynamic mapping
export interface ShopifyProductMapping {
  id?: string
  barcode: string
  shopify_product_id: string
  shopify_variant_id?: number
  shopify_inventory_item_id?: number
  product_name?: string
  pos_item_id?: string // From CSV "Item id (Do not change)"
  pos_variant_id?: string // From CSV "Variant id (Do not change)"
  discovery_method: 'csv_direct' | 'graphql_search' | 'rest_search' | 'manual' | 'cache_hit'
  confidence_score?: number
  last_verified_at?: string
  search_time_ms?: number
}

export interface CSVProductRow {
  'Item name': string
  Barcode: string
  Quantity: string
  'Item id (Do not change)': string
  'Variant id (Do not change)': string
  [key: string]: string
}

// =====================================================
// CACHE MANAGEMENT
// =====================================================

let mappingCache: Map<string, ShopifyProductMapping> = new Map()
let cacheLastUpdated = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Load mappings from database into memory cache
async function loadMappingsCache(): Promise<void> {
  const now = Date.now()
  
  if (mappingCache.size > 0 && (now - cacheLastUpdated) < CACHE_DURATION) {
    console.log(`📦 Using cached mappings: ${mappingCache.size} entries`)
    return
  }

  try {
    console.log(`🔄 Loading product mappings from database...`)
    
    const { data: mappings, error } = await supabase
      .from('shopify_product_mappings')
      .select('*')
      .order('last_verified_at', { ascending: false })
    
    if (error) {
      console.error('❌ Error loading mappings:', error)
      return
    }

    mappingCache.clear()
    mappings?.forEach(mapping => {
      mappingCache.set(mapping.barcode, mapping)
    })

    cacheLastUpdated = now
    console.log(`✅ Loaded ${mappings?.length || 0} product mappings into cache`)
  } catch (error) {
    console.error('❌ Error loading mappings cache:', error)
  }
}

// Save mapping to database and update cache
async function saveMappingToDatabase(mapping: ShopifyProductMapping): Promise<void> {
  try {
    const { data, error } = await supabase
      .rpc('upsert_shopify_product_mapping', {
        p_barcode: mapping.barcode,
        p_shopify_product_id: mapping.shopify_product_id,
        p_shopify_variant_id: mapping.shopify_variant_id,
        p_shopify_inventory_item_id: mapping.shopify_inventory_item_id,
        p_product_name: mapping.product_name,
        p_pos_item_id: mapping.pos_item_id,
        p_pos_variant_id: mapping.pos_variant_id,
        p_discovery_method: mapping.discovery_method,
        p_search_time_ms: mapping.search_time_ms
      })

    if (error) {
      console.error('❌ Error saving mapping:', error)
      return
    }

    // Update cache
    mappingCache.set(mapping.barcode, { ...mapping, id: data })
    console.log(`💾 Saved mapping for ${mapping.barcode} (${mapping.discovery_method})`)
  } catch (error) {
    console.error('❌ Error saving mapping to database:', error)
  }
}

// =====================================================
// DISCOVERY STRATEGIES
// =====================================================

// Strategy 1: Direct CSV ID mapping (fastest, most reliable)
async function tryCSVDirectMapping(
  barcode: string, 
  posItemId?: string, 
  posVariantId?: string
): Promise<ShopifyProductMapping | null> {
  if (!posItemId && !posVariantId) {
    return null
  }

  const startTime = Date.now()
  
  try {
    console.log(`🎯 CSV Direct: Trying direct mapping for ${barcode} (Item: ${posItemId}, Variant: ${posVariantId})`)
    
    // Try using the POS Item ID as Shopify Product ID
    if (posItemId) {
      try {
        const response = await shopifyApiRequest(`/products/${posItemId}.json`)
        
        if (response.product?.variants) {
          for (const variant of response.product.variants) {
            if (variant.barcode === barcode || !variant.barcode) {
              const searchTime = Date.now() - startTime
              
              console.log(`✅ CSV Direct Success: Found product via Item ID in ${searchTime}ms`)
              
              const mapping: ShopifyProductMapping = {
                barcode,
                shopify_product_id: posItemId,
                shopify_variant_id: variant.id,
                shopify_inventory_item_id: variant.inventory_item_id,
                product_name: response.product.title,
                pos_item_id: posItemId,
                pos_variant_id: posVariantId,
                discovery_method: 'csv_direct',
                confidence_score: 95,
                search_time_ms: searchTime
              }
              
              await saveMappingToDatabase(mapping)
              return mapping
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ CSV Direct: Item ID ${posItemId} not found in Shopify`)
      }
    }
    
    // Try using the POS Variant ID as Shopify Variant ID
    if (posVariantId) {
      try {
        const response = await shopifyApiRequest(`/variants/${posVariantId}.json`)
        
        if (response.variant && (response.variant.barcode === barcode || !response.variant.barcode)) {
          const searchTime = Date.now() - startTime
          
          console.log(`✅ CSV Direct Success: Found variant via Variant ID in ${searchTime}ms`)
          
          const mapping: ShopifyProductMapping = {
            barcode,
            shopify_product_id: response.variant.product_id.toString(),
            shopify_variant_id: response.variant.id,
            shopify_inventory_item_id: response.variant.inventory_item_id,
            product_name: response.variant.title || 'Unknown Product',
            pos_item_id: posItemId,
            pos_variant_id: posVariantId,
            discovery_method: 'csv_direct',
            confidence_score: 95,
            search_time_ms: searchTime
          }
          
          await saveMappingToDatabase(mapping)
          return mapping
        }
      } catch (error) {
        console.log(`⚠️ CSV Direct: Variant ID ${posVariantId} not found in Shopify`)
      }
    }
    
    return null
  } catch (error) {
    console.error(`❌ CSV Direct mapping failed for ${barcode}:`, error)
    return null
  }
}

// Strategy 2: GraphQL bulk search (efficient for multiple products)
async function tryGraphQLSearch(barcodes: string[]): Promise<Map<string, ShopifyProductMapping>> {
  const results = new Map<string, ShopifyProductMapping>()
  const startTime = Date.now()
  
  try {
    console.log(`🔍 GraphQL Search: Searching for ${barcodes.length} barcodes`)
    
    // Process in batches to avoid query length limits
    const batchSize = 50
    const batches = []
    
    for (let i = 0; i < barcodes.length; i += batchSize) {
      batches.push(barcodes.slice(i, i + batchSize))
    }
    
    for (const batch of batches) {
      const batchResults = await searchBatchGraphQL(batch)
      const batchTime = Date.now() - startTime
      
      batchResults.forEach((variant, barcode) => {
        const mapping: ShopifyProductMapping = {
          barcode,
          shopify_product_id: variant.product_id.toString(),
          shopify_variant_id: variant.id,
          shopify_inventory_item_id: variant.inventory_item_id,
          product_name: variant.title,
          discovery_method: 'graphql_search',
          confidence_score: 90,
          search_time_ms: Math.round(batchTime / batch.length)
        }
        
        results.set(barcode, mapping)
        // Save to database asynchronously
        saveMappingToDatabase(mapping).catch(console.error)
      })
    }
    
    const totalTime = Date.now() - startTime
    console.log(`✅ GraphQL Search: Found ${results.size}/${barcodes.length} products in ${totalTime}ms`)
    
    return results
  } catch (error) {
    console.error('❌ GraphQL search failed:', error)
    return results
  }
}

// Helper function for GraphQL batch search
async function searchBatchGraphQL(barcodes: string[]): Promise<Map<string, ShopifyVariant>> {
  const results = new Map<string, ShopifyVariant>()
  
  const barcodeQuery = barcodes.map(barcode => `barcode:'${barcode}'`).join(' OR ')
  const graphqlQuery = `
    query {
      products(first: 250, query: "${barcodeQuery}") {
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
  
  try {
    const response = await shopifyApiRequest('/graphql.json', {
      method: 'POST',
      body: JSON.stringify({ query: graphqlQuery })
    })
    
    if (response.data?.products?.edges) {
      const products = response.data.products.edges
      
      for (const productEdge of products) {
        const product = productEdge.node
        
        if (product.variants?.edges) {
          for (const variantEdge of product.variants.edges) {
            const variant = variantEdge.node
            
            if (variant.barcode && barcodes.includes(variant.barcode)) {
              const restVariant: ShopifyVariant = {
                id: parseInt(variant.id.replace('gid://shopify/ProductVariant/', '')),
                product_id: parseInt(product.id.replace('gid://shopify/Product/', '')),
                title: product.title,
                barcode: variant.barcode,
                inventory_item_id: parseInt(variant.inventoryItem.id.replace('gid://shopify/InventoryItem/', '')),
                price: '0',
                inventory_management: 'shopify',
                inventory_quantity: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }
              
              results.set(variant.barcode, restVariant)
            }
          }
        }
      }
    }
    
    return results
  } catch (error) {
    console.error('❌ GraphQL batch search failed:', error)
    return results
  }
}

// Strategy 3: REST API comprehensive search (slowest, most thorough)
async function tryRESTSearch(barcode: string): Promise<ShopifyProductMapping | null> {
  const startTime = Date.now()
  
  try {
    console.log(`🔍 REST Search: Comprehensive search for ${barcode}`)
    
    let sinceId = 0
    let searchedProducts = 0
    const limit = 250
    const maxProducts = 10000 // Reasonable limit for individual searches
    
    while (searchedProducts < maxProducts) {
      const endpoint = sinceId > 0 
        ? `/products.json?fields=id,title,variants&limit=${limit}&since_id=${sinceId}`
        : `/products.json?fields=id,title,variants&limit=${limit}`
        
      const response = await shopifyApiRequest(endpoint)
      const products = response.products || []
      
      if (products.length === 0) break
      
      // Search through this batch
      for (const product of products) {
        if (product.variants) {
          for (const variant of product.variants) {
            if (variant.barcode === barcode) {
              const searchTime = Date.now() - startTime
              
              console.log(`✅ REST Search Success: Found ${barcode} in ${searchTime}ms after ${searchedProducts} products`)
              
              const mapping: ShopifyProductMapping = {
                barcode,
                shopify_product_id: product.id.toString(),
                shopify_variant_id: variant.id,
                shopify_inventory_item_id: variant.inventory_item_id,
                product_name: product.title,
                discovery_method: 'rest_search',
                confidence_score: 85,
                search_time_ms: searchTime
              }
              
              await saveMappingToDatabase(mapping)
              return mapping
            }
          }
        }
      }
      
      searchedProducts += products.length
      sinceId = products[products.length - 1].id
    }
    
    console.log(`❌ REST Search: ${barcode} not found after searching ${searchedProducts} products`)
    return null
  } catch (error) {
    console.error(`❌ REST search failed for ${barcode}:`, error)
    return null
  }
}

// =====================================================
// MAIN DISCOVERY FUNCTION
// =====================================================

// Intelligent product discovery with multiple fallback strategies
export async function discoverShopifyMapping(
  barcode: string,
  posItemId?: string,
  posVariantId?: string,
  _productName?: string // Prefixed with underscore to indicate intentionally unused
): Promise<ShopifyProductMapping | null> {
  console.log(`🔍 Starting intelligent discovery for: ${barcode}`)
  
  // Load cache if needed
  await loadMappingsCache()
  
  // Strategy 0: Check cache first
  const cached = mappingCache.get(barcode)
  if (cached) {
    console.log(`⚡ Cache Hit: Found ${barcode} in cache (${cached.discovery_method})`)
    return { ...cached, discovery_method: 'cache_hit' }
  }
  
  // Strategy 1: Try CSV direct mapping (fastest)
  if (posItemId || posVariantId) {
    const directResult = await tryCSVDirectMapping(barcode, posItemId, posVariantId)
    if (directResult) {
      return directResult
    }
  }
  
  // Strategy 2: Try GraphQL search (for single product, still efficient)
  const graphqlResults = await tryGraphQLSearch([barcode])
  const graphqlResult = graphqlResults.get(barcode)
  if (graphqlResult) {
    return graphqlResult
  }
  
  // Strategy 3: Try comprehensive REST search (slowest, last resort)
  const restResult = await tryRESTSearch(barcode)
  if (restResult) {
    return restResult
  }
  
  console.log(`❌ Discovery failed: ${barcode} not found in Shopify`)
  return null
}

// Bulk discovery for multiple products (optimized for CSV uploads)
export async function discoverMultipleShopifyMappings(
  csvData: CSVProductRow[]
): Promise<Map<string, ShopifyProductMapping>> {
  console.log(`🚀 Starting bulk discovery for ${csvData.length} products`)
  
  const results = new Map<string, ShopifyProductMapping>()
  await loadMappingsCache()
  
  // Separate products by strategy
  const cacheHits: string[] = []
  const csvDirectCandidates: Array<{ barcode: string, posItemId?: string, posVariantId?: string }> = []
  const graphqlSearchCandidates: string[] = []
  
  // Categorize products
  for (const row of csvData) {
    const barcode = row.Barcode?.trim()
    if (!barcode) continue
    
    // Check cache first
    const cached = mappingCache.get(barcode)
    if (cached) {
      results.set(barcode, { ...cached, discovery_method: 'cache_hit' })
      cacheHits.push(barcode)
      continue
    }
    
    // Check if we have CSV IDs for direct mapping
    const posItemId = row['Item id (Do not change)']?.trim()
    const posVariantId = row['Variant id (Do not change)']?.trim()
    
    if (posItemId || posVariantId) {
      csvDirectCandidates.push({ barcode, posItemId, posVariantId })
    } else {
      graphqlSearchCandidates.push(barcode)
    }
  }
  
  console.log(`📊 Discovery Strategy Breakdown:`)
  console.log(`   - Cache Hits: ${cacheHits.length}`)
  console.log(`   - CSV Direct Candidates: ${csvDirectCandidates.length}`)
  console.log(`   - GraphQL Search Needed: ${graphqlSearchCandidates.length}`)
  
  // Execute CSV Direct strategy
  if (csvDirectCandidates.length > 0) {
    console.log(`🎯 Processing ${csvDirectCandidates.length} CSV direct mappings...`)
    
    for (const candidate of csvDirectCandidates) {
      const result = await tryCSVDirectMapping(
        candidate.barcode, 
        candidate.posItemId, 
        candidate.posVariantId
      )
      
      if (result) {
        results.set(candidate.barcode, result)
      } else {
        // Failed CSV direct, add to GraphQL search
        graphqlSearchCandidates.push(candidate.barcode)
      }
    }
  }
  
  // Execute GraphQL bulk search for remaining products
  if (graphqlSearchCandidates.length > 0) {
    console.log(`🔍 GraphQL searching for ${graphqlSearchCandidates.length} remaining products...`)
    const graphqlResults = await tryGraphQLSearch(graphqlSearchCandidates)
    
    graphqlResults.forEach((mapping, barcode) => {
      results.set(barcode, mapping)
    })
  }
  
  const totalFound = results.size
  const totalRequested = csvData.filter(row => row.Barcode?.trim()).length
  const successRate = Math.round((totalFound / totalRequested) * 100)
  
  console.log(`🎯 Bulk Discovery Complete:`)
  console.log(`   - Found: ${totalFound}/${totalRequested} (${successRate}%)`)
  console.log(`   - Cache Hits: ${cacheHits.length}`)
  console.log(`   - New Discoveries: ${totalFound - cacheHits.length}`)
  
  return results
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

// Get mapping by barcode (checks cache first, then database)
export async function getShopifyMapping(barcode: string): Promise<ShopifyProductMapping | null> {
  await loadMappingsCache()
  
  const cached = mappingCache.get(barcode)
  if (cached) {
    return cached
  }
  
  // Not in cache, check database directly
  try {
    const { data, error } = await supabase
      .rpc('get_shopify_mapping_by_barcode', { p_barcode: barcode })
    
    if (error || !data || data.length === 0) {
      return null
    }
    
    const mapping = data[0]
    mappingCache.set(barcode, mapping)
    return mapping
  } catch (error) {
    console.error('❌ Error getting mapping from database:', error)
    return null
  }
}

// Clear cache (useful for testing or after bulk updates)
export function clearMappingCache(): void {
  mappingCache.clear()
  cacheLastUpdated = 0
  console.log('🧹 Mapping cache cleared')
}

// Get cache statistics
export function getCacheStats(): { size: number, lastUpdated: number, hitRate?: number } {
  return {
    size: mappingCache.size,
    lastUpdated: cacheLastUpdated,
    // hitRate would need to be tracked separately
  }
}

// Export for testing
export { mappingCache }
