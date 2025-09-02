// Quick Fix for Specific Missing Products
// Manually discover and fix the problematic barcodes

import { shopifyApiRequest } from './shopify'
import { supabase } from '../utils/supabase'

const PROBLEMATIC_BARCODES = [
  '4840022010436',
  '4036117010034'
]

// Discover the correct Shopify IDs for problematic products
export async function discoverAndFixProblematicProducts(): Promise<void> {
  console.log('🔧 QUICK FIX: Discovering problematic products')
  console.log('=' .repeat(50))
  
  for (const barcode of PROBLEMATIC_BARCODES) {
    console.log(`\n🔍 Processing barcode: ${barcode}`)
    
    try {
      // Use a more comprehensive search approach
      const discovered = await findProductByBarcodeComprehensive(barcode)
      
      if (discovered) {
        console.log(`✅ FOUND: ${barcode}`)
        console.log(`   Product ID: ${discovered.product_id}`)
        console.log(`   Variant ID: ${discovered.id}`)
        console.log(`   Inventory Item ID: ${discovered.inventory_item_id}`)
        console.log(`   Title: ${discovered.title}`)
        
        // Update the Supabase products table
        const { error } = await supabase
          .from('products')
          .update({
            shopify_product_id: discovered.product_id,
            shopify_variant_id: discovered.id,
            updated_at: new Date().toISOString()
          })
          .eq('barcode', barcode)
        
        if (error) {
          console.log(`❌ Database update error: ${error.message}`)
        } else {
          console.log(`💾 Database updated successfully for ${barcode}`)
        }
      } else {
        console.log(`❌ FAILED: Could not find ${barcode} in Shopify`)
        
        // Let's try to find it by searching for partial matches or similar barcodes
        await tryAlternativeSearches(barcode)
      }
    } catch (error) {
      console.error(`❌ Error processing ${barcode}:`, error)
    }
  }
}

// Comprehensive search using multiple strategies
async function findProductByBarcodeComprehensive(barcode: string): Promise<any | null> {
  console.log(`   🔍 Comprehensive search for: ${barcode}`)
  
  // Strategy 1: GraphQL with exact barcode
  let result = await tryGraphQLExactSearch(barcode)
  if (result) return result
  
  // Strategy 2: REST API comprehensive search (first 2000 products)
  result = await tryRESTComprehensiveSearch(barcode)
  if (result) return result
  
  // Strategy 3: Try variations of the barcode
  const barcodeVariations = [
    barcode,
    barcode.replace(/^0+/, ''), // Remove leading zeros
    '0' + barcode, // Add leading zero
    barcode.substring(1), // Remove first digit
    barcode.slice(0, -1), // Remove last digit
  ]
  
  for (const variation of barcodeVariations) {
    if (variation !== barcode && variation.length > 6) {
      console.log(`   🔄 Trying barcode variation: ${variation}`)
      result = await tryGraphQLExactSearch(variation)
      if (result) {
        console.log(`   ✅ Found with variation: ${variation}`)
        return result
      }
    }
  }
  
  return null
}

// GraphQL exact search
async function tryGraphQLExactSearch(barcode: string): Promise<any | null> {
  try {
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
    
    if (response.data?.products?.edges?.length > 0) {
      for (const productEdge of response.data.products.edges) {
        const product = productEdge.node
        
        if (product.variants?.edges) {
          for (const variantEdge of product.variants.edges) {
            const variant = variantEdge.node
            
            if (variant.barcode === barcode) {
              return {
                id: parseInt(variant.id.replace('gid://shopify/ProductVariant/', '')),
                product_id: parseInt(product.id.replace('gid://shopify/Product/', '')),
                title: product.title,
                barcode: variant.barcode,
                inventory_item_id: parseInt(variant.inventoryItem.id.replace('gid://shopify/InventoryItem/', ''))
              }
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.log(`   ❌ GraphQL search error: ${error}`)
    return null
  }
}

// REST API comprehensive search
async function tryRESTComprehensiveSearch(barcode: string): Promise<any | null> {
  try {
    console.log(`   🔄 REST comprehensive search...`)
    
    let sinceId = 0
    let searchedProducts = 0
    const limit = 250
    const maxProducts = 2000 // Search first 2000 products
    
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
              console.log(`   ✅ REST found after ${searchedProducts} products`)
              return variant
            }
          }
        }
      }
      
      sinceId = products[products.length - 1].id
      
      // Progress update
      if (searchedProducts % 500 === 0) {
        console.log(`      Searched ${searchedProducts} products...`)
      }
    }
    
    console.log(`   ❌ REST search: not found in ${searchedProducts} products`)
    return null
  } catch (error) {
    console.log(`   ❌ REST search error: ${error}`)
    return null
  }
}

// Try alternative searches for products that can't be found
async function tryAlternativeSearches(barcode: string): Promise<void> {
  console.log(`   🔍 Trying alternative searches for: ${barcode}`)
  
  // Search by partial barcode in product titles/descriptions
  try {
    const partialBarcode = barcode.substring(2, 10) // Take middle part
    
    const graphqlQuery = `
      query {
        products(first: 50, query: "${partialBarcode}") {
          edges {
            node {
              id
              title
              variants(first: 5) {
                edges {
                  node {
                    id
                    barcode
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
    
    if (response.data?.products?.edges?.length > 0) {
      console.log(`   🔍 Found products with partial match "${partialBarcode}":`)
      
      for (const productEdge of response.data.products.edges) {
        const product = productEdge.node
        console.log(`      Product: ${product.title}`)
        
        if (product.variants?.edges) {
          for (const variantEdge of product.variants.edges) {
            const variant = variantEdge.node
            console.log(`         Variant barcode: ${variant.barcode}`)
          }
        }
      }
    }
  } catch (error) {
    console.log(`   ❌ Alternative search error: ${error}`)
  }
}

// Generate manual mapping code for products that need to be added
export async function generateManualMappings(): Promise<void> {
  console.log('\n🔧 GENERATING MANUAL MAPPINGS')
  console.log('=' .repeat(40))
  
  const manualMappings: Record<string, any> = {}
  
  for (const barcode of PROBLEMATIC_BARCODES) {
    const discovered = await findProductByBarcodeComprehensive(barcode)
    
    if (discovered) {
      manualMappings[barcode] = {
        productId: discovered.product_id.toString(),
        variantId: discovered.id,
        inventoryItemId: discovered.inventory_item_id
      }
      
      console.log(`✅ ${barcode}: Found mapping`)
    } else {
      console.log(`❌ ${barcode}: No mapping found`)
    }
  }
  
  console.log('\n📋 MANUAL MAPPINGS CODE:')
  console.log('const MANUAL_PRODUCT_MAPPINGS = {')
  Object.entries(manualMappings).forEach(([barcode, mapping]) => {
    console.log(`  '${barcode}': {`)
    console.log(`    productId: '${mapping.productId}',`)
    console.log(`    variantId: ${mapping.variantId},`)
    console.log(`    inventoryItemId: ${mapping.inventoryItemId}`)
    console.log(`  },`)
  })
  console.log('};')
}
