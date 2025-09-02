// Diagnostic Tool for Shopify Product Search Issues
// Test specific barcodes that are failing to be found

import { shopifyApiRequest } from './shopify'
import { supabase } from '../utils/supabase'

// Test specific failing barcodes
const FAILING_BARCODES = [
  '4840022010436',
  '4036117010034'
]

export async function diagnoseMissingProducts(): Promise<void> {
  console.log('🔬 DIAGNOSTIC: Investigating missing product mappings')
  console.log('=' .repeat(60))
  
  for (const barcode of FAILING_BARCODES) {
    console.log(`\n🔍 INVESTIGATING BARCODE: ${barcode}`)
    console.log('-'.repeat(40))
    
    // 1. Check if exists in Supabase
    const { data: supabaseProduct, error: supabaseError } = await supabase
      .from('products')
      .select('id, sku, barcode, name, shopify_product_id, shopify_variant_id')
      .eq('barcode', barcode)
      .single()
    
    if (supabaseError && supabaseError.code !== 'PGRST116') {
      console.log(`❌ Supabase Error: ${supabaseError.message}`)
      continue
    }
    
    if (supabaseProduct) {
      console.log(`✅ Found in Supabase:`)
      console.log(`   - ID: ${supabaseProduct.id}`)
      console.log(`   - Name: ${supabaseProduct.name}`)
      console.log(`   - Shopify Product ID: ${supabaseProduct.shopify_product_id || 'NULL'}`)
      console.log(`   - Shopify Variant ID: ${supabaseProduct.shopify_variant_id || 'NULL'}`)
    } else {
      console.log(`❌ NOT found in Supabase products table`)
    }
    
    // 2. Test GraphQL search
    console.log(`\n🔍 Testing GraphQL Search...`)
    const graphqlResult = await testGraphQLSearch(barcode)
    
    // 3. Test REST API comprehensive search  
    console.log(`\n🔍 Testing REST API Search...`)
    const restResult = await testRESTSearch(barcode)
    
    // 4. Test direct product lookup if we have a product ID
    let directResult = false
    if (supabaseProduct?.shopify_product_id) {
      console.log(`\n🔍 Testing Direct Product Lookup...`)
      directResult = await testDirectLookup(supabaseProduct.shopify_product_id.toString(), barcode)
    }
    
    // 5. Summary for this barcode
    console.log(`\n📊 SUMMARY for ${barcode}:`)
    console.log(`   - In Supabase: ${supabaseProduct ? '✅' : '❌'}`)
    console.log(`   - GraphQL Found: ${graphqlResult ? '✅' : '❌'}`)
    console.log(`   - REST Found: ${restResult ? '✅' : '❌'}`)
    console.log(`   - Direct Lookup: ${directResult ? '✅' : '❌'}`)
    
    if (!graphqlResult && !restResult) {
      console.log(`🚨 PROBLEM: Product exists in Shopify admin but search APIs can't find it!`)
      console.log(`   This suggests either:`)
      console.log(`   - Barcode mismatch between systems`)
      console.log(`   - Shopify search indexing issue`)
      console.log(`   - API query syntax problem`)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('🔬 DIAGNOSTIC COMPLETE')
}

// Test GraphQL search for a specific barcode
async function testGraphQLSearch(barcode: string): Promise<boolean> {
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
    
    console.log(`   GraphQL Query: barcode:'${barcode}'`)
    
    const response = await shopifyApiRequest('/graphql.json', {
      method: 'POST',
      body: JSON.stringify({ query: graphqlQuery })
    })
    
    if (response.errors) {
      console.log(`   ❌ GraphQL Errors:`, response.errors)
      return false
    }
    
    if (response.data?.products?.edges?.length > 0) {
      const products = response.data.products.edges
      console.log(`   ✅ GraphQL found ${products.length} products`)
      
      for (const productEdge of products) {
        const product = productEdge.node
        console.log(`      Product: ${product.title} (ID: ${product.id})`)
        
        if (product.variants?.edges) {
          for (const variantEdge of product.variants.edges) {
            const variant = variantEdge.node
            console.log(`         Variant: ${variant.barcode} (ID: ${variant.id})`)
            
            if (variant.barcode === barcode) {
              console.log(`         🎯 EXACT MATCH FOUND!`)
              return true
            }
          }
        }
      }
    } else {
      console.log(`   ❌ GraphQL found 0 products`)
    }
    
    return false
  } catch (error) {
    console.log(`   ❌ GraphQL Error: ${error}`)
    return false
  }
}

// Test REST API search
async function testRESTSearch(barcode: string): Promise<boolean> {
  try {
    console.log(`   Testing REST search for first 500 products...`)
    
    let found = false
    let searchedProducts = 0
    let sinceId = 0
    const limit = 250
    
    // Search first few batches
    for (let batch = 0; batch < 2; batch++) {
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
              console.log(`   ✅ REST API found: ${product.title} (Product ID: ${product.id}, Variant ID: ${variant.id})`)
              return true
            }
          }
        }
      }
      
      sinceId = products[products.length - 1].id
    }
    
    console.log(`   ❌ REST API: Not found in first ${searchedProducts} products`)
    return found
  } catch (error) {
    console.log(`   ❌ REST API Error: ${error}`)
    return false
  }
}

// Test direct product lookup
async function testDirectLookup(productId: string, expectedBarcode: string): Promise<boolean> {
  try {
    console.log(`   Testing direct lookup for Product ID: ${productId}`)
    
    const response = await shopifyApiRequest(`/products/${productId}.json`)
    
    if (response.product) {
      console.log(`   ✅ Direct lookup found: ${response.product.title}`)
      
      if (response.product.variants) {
        for (const variant of response.product.variants) {
          console.log(`      Variant: ${variant.barcode} (ID: ${variant.id})`)
          
          if (variant.barcode === expectedBarcode) {
            console.log(`      🎯 BARCODE MATCH!`)
            return true
          }
        }
      }
      
      console.log(`   ⚠️ Product found but barcode doesn't match`)
      return false
    } else {
      console.log(`   ❌ Direct lookup failed - product not found`)
      return false
    }
  } catch (error) {
    console.log(`   ❌ Direct lookup error: ${error}`)
    return false
  }
}

// Fix missing mappings by discovering and updating the database
export async function fixMissingMappings(): Promise<void> {
  console.log('🔧 FIXING MISSING MAPPINGS')
  console.log('=' .repeat(40))
  
  for (const barcode of FAILING_BARCODES) {
    console.log(`\n🔧 Fixing mapping for: ${barcode}`)
    
    // Try comprehensive search
    const found = await comprehensiveProductSearch(barcode)
    
    if (found) {
      console.log(`✅ Fixed mapping for ${barcode}`)
      
      // Update the Supabase products table
      const { error } = await supabase
        .from('products')
        .update({
          shopify_product_id: parseInt(found.product_id.toString()),
          shopify_variant_id: found.id,
          updated_at: new Date().toISOString()
        })
        .eq('barcode', barcode)
      
      if (error) {
        console.log(`❌ Error updating database: ${error.message}`)
      } else {
        console.log(`💾 Database updated successfully`)
      }
    } else {
      console.log(`❌ Could not find ${barcode} in Shopify`)
    }
  }
}

// Comprehensive search that tries multiple strategies
async function comprehensiveProductSearch(barcode: string): Promise<any | null> {
  console.log(`🔍 Comprehensive search for: ${barcode}`)
  
  // Strategy 1: Try different GraphQL query formats
  const graphqlVariations = [
    `barcode:'${barcode}'`,
    `barcode:${barcode}`,
    `"${barcode}"`,
    barcode
  ]
  
  for (const queryVariation of graphqlVariations) {
    console.log(`   Trying GraphQL query: ${queryVariation}`)
    
    try {
      const graphqlQuery = `
        query {
          products(first: 250, query: "${queryVariation}") {
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
                console.log(`   ✅ Found with query variation: ${queryVariation}`)
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
    } catch (error) {
      console.log(`   ❌ Query variation failed: ${error}`)
    }
  }
  
  // Strategy 2: Comprehensive REST search (more thorough)
  console.log(`   Trying comprehensive REST search...`)
  
  try {
    let sinceId = 0
    let searchedProducts = 0
    const limit = 250
    const maxProducts = 5000 // Search more products
    
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
              console.log(`   ✅ Found with REST search after ${searchedProducts} products`)
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
    
    console.log(`   ❌ REST search complete: not found in ${searchedProducts} products`)
  } catch (error) {
    console.log(`   ❌ REST search error: ${error}`)
  }
  
  return null
}

// Export the failing barcodes for external use
export { FAILING_BARCODES }
