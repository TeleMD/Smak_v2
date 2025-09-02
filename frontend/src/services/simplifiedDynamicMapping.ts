// Simplified Dynamic Mapping - Uses Existing Database Schema
// No new tables required - works with existing products table

import { supabase } from '../utils/supabase'
import { ShopifyVariant } from '../types'
import { shopifyApiRequest } from './shopify'

// Simplified mapping interface using existing schema
export interface SimpleShopifyMapping {
  barcode: string
  shopify_product_id: string
  shopify_variant_id?: number
  shopify_inventory_item_id?: number
  product_name?: string
  discovery_method: 'existing' | 'csv_direct' | 'graphql_search' | 'rest_search'
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
// SIMPLE CACHE MANAGEMENT
// =====================================================

let mappingCache: Map<string, SimpleShopifyMapping> = new Map()
let cacheLastUpdated = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Enhanced search function for problematic products
async function findProblematicProduct(barcode: string): Promise<SimpleShopifyMapping | null> {
  console.log(`🔍 Enhanced search for problematic product: ${barcode}`)
  
  try {
    // Strategy 1: Try multiple GraphQL query formats
    const queryFormats = [
      `barcode:'${barcode}'`,
      `barcode:${barcode}`,
      `"${barcode}"`,
      barcode
    ]
    
    for (const queryFormat of queryFormats) {
      const graphqlQuery = `
        query {
          products(first: 250, query: "${queryFormat}") {
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
        
        if (response.data?.products?.edges?.length > 0) {
          for (const productEdge of response.data.products.edges) {
            const product = productEdge.node
            
            if (product.variants?.edges) {
              for (const variantEdge of product.variants.edges) {
                const variant = variantEdge.node
                
                if (variant.barcode === barcode) {
                  console.log(`✅ Found ${barcode} with query format: ${queryFormat}`)
                  
                  const mapping: SimpleShopifyMapping = {
                    barcode,
                    shopify_product_id: product.id.replace('gid://shopify/Product/', ''),
                    shopify_variant_id: parseInt(variant.id.replace('gid://shopify/ProductVariant/', '')),
                    shopify_inventory_item_id: parseInt(variant.inventoryItem.id.replace('gid://shopify/InventoryItem/', '')),
                    product_name: product.title,
                    discovery_method: 'graphql_search'
                  }
                  
                  // Save to database
                  await saveToExistingTable(mapping)
                  return mapping
                }
              }
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Query format ${queryFormat} failed: ${error}`)
      }
    }
    
    // Strategy 2: Comprehensive REST search
    console.log(`🔄 Trying comprehensive REST search for ${barcode}...`)
    
    let sinceId = 0
    let searchedProducts = 0
    const limit = 250
    const maxProducts = 3000 // Search more products
    
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
              console.log(`✅ Found ${barcode} with REST search after ${searchedProducts} products`)
              
              const mapping: SimpleShopifyMapping = {
                barcode,
                shopify_product_id: product.id.toString(),
                shopify_variant_id: variant.id,
                shopify_inventory_item_id: variant.inventory_item_id,
                product_name: product.title,
                discovery_method: 'rest_search'
              }
              
              // Save to database
              await saveToExistingTable(mapping)
              return mapping
            }
          }
        }
      }
      
      sinceId = products[products.length - 1].id
      
      if (searchedProducts % 500 === 0) {
        console.log(`   Searched ${searchedProducts} products...`)
      }
    }
    
    console.log(`❌ ${barcode} not found after comprehensive search`)
    return null
    
  } catch (error) {
    console.error(`❌ Enhanced search failed for ${barcode}:`, error)
    return null
  }
}

// Load mappings from existing products table
async function loadExistingMappings(): Promise<void> {
  const now = Date.now()
  
  if (mappingCache.size > 0 && (now - cacheLastUpdated) < CACHE_DURATION) {
    console.log(`📦 Using cached mappings: ${mappingCache.size} entries`)
    return
  }

  try {
    console.log(`🔄 Loading existing product mappings...`)
    
    const { data: products, error } = await supabase
      .from('products')
      .select('barcode, shopify_product_id, shopify_variant_id, name')
      .not('shopify_product_id', 'is', null)
      .not('barcode', 'is', null)
    
    if (error) {
      console.error('❌ Error loading existing mappings:', error)
      return
    }

    mappingCache.clear()
    
    // Load existing products from database
    products?.forEach(product => {
      if (product.barcode && product.shopify_product_id) {
        const mapping: SimpleShopifyMapping = {
          barcode: product.barcode,
          shopify_product_id: product.shopify_product_id.toString(),
          shopify_variant_id: product.shopify_variant_id,
          product_name: product.name,
          discovery_method: 'existing'
        }
        mappingCache.set(product.barcode, mapping)
      }
    })

    cacheLastUpdated = now
    console.log(`✅ Loaded ${products?.length || 0} existing product mappings`)
  } catch (error) {
    console.error('❌ Error loading existing mappings:', error)
  }
}

// Save mapping to existing products table
async function saveToExistingTable(mapping: SimpleShopifyMapping): Promise<void> {
  try {
    // First, try to find existing product by barcode
    const { data: existingProduct, error: findError } = await supabase
      .from('products')
      .select('id, sku, name')
      .eq('barcode', mapping.barcode)
      .single()

    if (findError && findError.code !== 'PGRST116') {
      console.error('❌ Error finding existing product:', findError)
      return
    }

    if (existingProduct) {
      // Update existing product with Shopify IDs
      const { error: updateError } = await supabase
        .from('products')
        .update({
          shopify_product_id: parseInt(mapping.shopify_product_id),
          shopify_variant_id: mapping.shopify_variant_id,
          name: mapping.product_name || existingProduct.name,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProduct.id)

      if (updateError) {
        console.error('❌ Error updating existing product:', updateError)
        return
      }

      console.log(`💾 Updated existing product ${mapping.barcode} with Shopify IDs`)
    } else {
      // Create new product
      const { error: insertError } = await supabase
        .from('products')
        .insert({
          sku: mapping.barcode, // Use barcode as SKU if no existing product
          barcode: mapping.barcode,
          name: mapping.product_name || `Product ${mapping.barcode}`,
          shopify_product_id: parseInt(mapping.shopify_product_id),
          shopify_variant_id: mapping.shopify_variant_id,
          is_active: true
        })

      if (insertError) {
        console.error('❌ Error creating new product:', insertError)
        return
      }

      console.log(`💾 Created new product ${mapping.barcode} with Shopify IDs`)
    }

    // Update cache
    mappingCache.set(mapping.barcode, mapping)
  } catch (error) {
    console.error('❌ Error saving to existing table:', error)
  }
}

// =====================================================
// DISCOVERY STRATEGIES (Same as before)
// =====================================================

// Strategy 1: Direct CSV ID mapping
async function tryCSVDirectMapping(
  barcode: string, 
  posItemId?: string, 
  posVariantId?: string
): Promise<SimpleShopifyMapping | null> {
  if (!posItemId && !posVariantId) {
    return null
  }

  try {
    console.log(`🎯 CSV Direct: Trying ${barcode} (Item: ${posItemId})`)
    
    if (posItemId) {
      try {
        const response = await shopifyApiRequest(`/products/${posItemId}.json`)
        
        if (response.product?.variants) {
          for (const variant of response.product.variants) {
            if (variant.barcode === barcode || !variant.barcode) {
              console.log(`✅ CSV Direct Success: Found via Item ID`)
              
              const mapping: SimpleShopifyMapping = {
                barcode,
                shopify_product_id: posItemId,
                shopify_variant_id: variant.id,
                shopify_inventory_item_id: variant.inventory_item_id,
                product_name: response.product.title,
                discovery_method: 'csv_direct'
              }
              
              await saveToExistingTable(mapping)
              return mapping
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ CSV Direct: Item ID ${posItemId} not found`)
      }
    }
    
    return null
  } catch (error) {
    console.error(`❌ CSV Direct failed for ${barcode}:`, error)
    return null
  }
}

// Strategy 2: GraphQL search (simplified)
async function tryGraphQLSearch(barcodes: string[]): Promise<Map<string, SimpleShopifyMapping>> {
  const results = new Map<string, SimpleShopifyMapping>()
  
  try {
    console.log(`🔍 GraphQL Search: Searching for ${barcodes.length} barcodes`)
    
    // Process in smaller batches
    const batchSize = 25
    for (let i = 0; i < barcodes.length; i += batchSize) {
      const batch = barcodes.slice(i, i + batchSize)
      const batchResults = await searchBatchGraphQL(batch)
      
      batchResults.forEach((variant, barcode) => {
        const mapping: SimpleShopifyMapping = {
          barcode,
          shopify_product_id: variant.product_id.toString(),
          shopify_variant_id: variant.id,
          shopify_inventory_item_id: variant.inventory_item_id,
          product_name: variant.title,
          discovery_method: 'graphql_search'
        }
        
        results.set(barcode, mapping)
        // Save to existing table asynchronously
        saveToExistingTable(mapping).catch(console.error)
      })
    }
    
    console.log(`✅ GraphQL Search: Found ${results.size}/${barcodes.length} products`)
    return results
  } catch (error) {
    console.error('❌ GraphQL search failed:', error)
    return results
  }
}

// Helper for GraphQL batch search
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

// =====================================================
// MAIN FUNCTIONS (Simplified)
// =====================================================

// Get mapping (checks existing products first)
export async function getSimpleShopifyMapping(barcode: string): Promise<SimpleShopifyMapping | null> {
  await loadExistingMappings()
  
  const cached = mappingCache.get(barcode)
  if (cached) {
    return cached
  }
  
  return null
}

// Discover mapping for single product
export async function discoverSimpleShopifyMapping(
  barcode: string,
  posItemId?: string,
  posVariantId?: string
): Promise<SimpleShopifyMapping | null> {
  console.log(`🔍 Simple discovery for: ${barcode}`)
  
  // Load existing mappings first
  await loadExistingMappings()
  
  // Check if already exists
  const existing = mappingCache.get(barcode)
  if (existing) {
    console.log(`⚡ Found existing mapping for ${barcode}`)
    return existing
  }
  
  // Try CSV direct mapping
  if (posItemId || posVariantId) {
    const directResult = await tryCSVDirectMapping(barcode, posItemId, posVariantId)
    if (directResult) {
      return directResult
    }
  }
  
  // Try GraphQL search
  const graphqlResults = await tryGraphQLSearch([barcode])
  const graphqlResult = graphqlResults.get(barcode)
  if (graphqlResult) {
    return graphqlResult
  }
  
  // For specific problematic products, try enhanced search
  const problematicBarcodes = ['4840022010436', '4036117010034']
  if (problematicBarcodes.includes(barcode)) {
    console.log(`🔧 Using enhanced search for problematic product: ${barcode}`)
    const enhancedResult = await findProblematicProduct(barcode)
    if (enhancedResult) {
      return enhancedResult
    }
  }
  
  console.log(`❌ No mapping found for ${barcode}`)
  return null
}

// Bulk discovery for CSV uploads
export async function discoverMultipleSimpleMappings(
  csvData: CSVProductRow[]
): Promise<Map<string, SimpleShopifyMapping>> {
  console.log(`🚀 Simple bulk discovery for ${csvData.length} products`)
  
  const results = new Map<string, SimpleShopifyMapping>()
  await loadExistingMappings()
  
  // Separate into existing and new products
  const existingProducts: string[] = []
  const newProducts: Array<{ barcode: string, posItemId?: string, posVariantId?: string }> = []
  
  for (const row of csvData) {
    const barcode = row.Barcode?.trim()
    if (!barcode) continue
    
    const existing = mappingCache.get(barcode)
    if (existing) {
      results.set(barcode, existing)
      existingProducts.push(barcode)
    } else {
      newProducts.push({
        barcode,
        posItemId: row['Item id (Do not change)']?.trim(),
        posVariantId: row['Variant id (Do not change)']?.trim()
      })
    }
  }
  
  console.log(`📊 Found ${existingProducts.length} existing, discovering ${newProducts.length} new`)
  
  // Try CSV direct mapping for new products
  const csvDirectCandidates: string[] = []
  
  for (const product of newProducts) {
    if (product.posItemId) {
      const result = await tryCSVDirectMapping(product.barcode, product.posItemId, product.posVariantId)
      if (result) {
        results.set(product.barcode, result)
      } else {
        csvDirectCandidates.push(product.barcode)
      }
    } else {
      csvDirectCandidates.push(product.barcode)
    }
  }
  
  // Try GraphQL for remaining products
  if (csvDirectCandidates.length > 0) {
    const graphqlResults = await tryGraphQLSearch(csvDirectCandidates)
    graphqlResults.forEach((mapping, barcode) => {
      results.set(barcode, mapping)
    })
  }
  
  const totalFound = results.size
  const successRate = Math.round((totalFound / csvData.length) * 100)
  
  console.log(`🎯 Simple bulk discovery complete: ${totalFound}/${csvData.length} (${successRate}%)`)
  
  return results
}

// Clear cache
export function clearSimpleMappingCache(): void {
  mappingCache.clear()
  cacheLastUpdated = 0
  console.log('🧹 Simple mapping cache cleared')
}

// Export for testing
export { mappingCache }
