import { supabase } from '../utils/supabase'
import { findShopifyVariantByBarcode } from './shopify'

// =====================================================
// DYNAMIC SHOPIFY MAPPING SERVICE
// =====================================================
// This service eliminates the hardcoded knownProducts mapping
// by dynamically discovering and persisting Shopify product IDs

export interface ShopifyMappingResult {
  barcode: string
  shopifyProductId?: string
  shopifyVariantId?: number
  shopifyInventoryItemId?: number
  found: boolean
  source: 'database' | 'api_discovery' | 'hardcoded_fallback'
  searchTimeMs?: number
}

export interface BulkMappingResult {
  mappings: Map<string, ShopifyMappingResult>
  totalRequested: number
  foundInDatabase: number
  discoveredViaAPI: number
  notFound: number
  totalTimeMs: number
}

// =====================================================
// CORE MAPPING FUNCTIONS
// =====================================================

/**
 * Get Shopify mapping for a single barcode
 * Tries database first, then API discovery, then saves result
 */
export async function getShopifyMapping(barcode: string): Promise<ShopifyMappingResult> {
  console.log(`🔍 Getting Shopify mapping for barcode: ${barcode}`)
  
  const startTime = Date.now()
  
  // Step 1: Check database first
  const { data: existingProduct, error } = await supabase
    .from('products')
    .select('shopify_product_id, shopify_variant_id, name')
    .eq('barcode', barcode)
    .not('shopify_product_id', 'is', null)
    .single()
  
  if (!error && existingProduct?.shopify_product_id) {
    console.log(`✅ Found in database: ${barcode} → ${existingProduct.shopify_product_id}`)
    return {
      barcode,
      shopifyProductId: existingProduct.shopify_product_id.toString(),
      shopifyVariantId: existingProduct.shopify_variant_id,
      found: true,
      source: 'database',
      searchTimeMs: Date.now() - startTime
    }
  }
  
  // Step 2: API Discovery
  console.log(`🔍 Not in database, searching Shopify API for: ${barcode}`)
  
  try {
    const variant = await findShopifyVariantByBarcode(barcode)
    
    if (variant?.product_id) {
      const searchTimeMs = Date.now() - startTime
      console.log(`✅ Discovered via API: ${barcode} → ${variant.product_id} (${searchTimeMs}ms)`)
      
      // Step 3: Save discovery to database
      await saveShopifyMapping(barcode, variant.product_id, variant.id, variant.inventory_item_id)
      
      return {
        barcode,
        shopifyProductId: variant.product_id.toString(),
        shopifyVariantId: variant.id,
        shopifyInventoryItemId: variant.inventory_item_id,
        found: true,
        source: 'api_discovery',
        searchTimeMs
      }
    }
  } catch (error) {
    console.warn(`⚠️ API discovery failed for ${barcode}:`, error)
  }
  
  // Step 4: Not found
  const searchTimeMs = Date.now() - startTime
  console.log(`❌ Not found anywhere: ${barcode} (${searchTimeMs}ms)`)
  
  return {
    barcode,
    found: false,
    source: 'api_discovery',
    searchTimeMs
  }
}

/**
 * Get Shopify mappings for multiple barcodes efficiently
 * Uses batch database queries and parallel API calls
 */
export async function getBulkShopifyMappings(barcodes: string[]): Promise<BulkMappingResult> {
  console.log(`🚀 Getting bulk Shopify mappings for ${barcodes.length} barcodes`)
  
  const startTime = Date.now()
  const mappings = new Map<string, ShopifyMappingResult>()
  
  // Step 1: Batch query database for all barcodes
  console.log(`📊 Step 1: Checking database for all ${barcodes.length} barcodes...`)
  
  const { data: existingProducts, error } = await supabase
    .from('products')
    .select('barcode, shopify_product_id, shopify_variant_id, name')
    .in('barcode', barcodes)
    .not('shopify_product_id', 'is', null)
  
  let foundInDatabase = 0
  const remainingBarcodes: string[] = []
  
  if (!error && existingProducts) {
    // Process database results
    for (const product of existingProducts) {
      if (product.barcode && product.shopify_product_id) {
        mappings.set(product.barcode, {
          barcode: product.barcode,
          shopifyProductId: product.shopify_product_id.toString(),
          shopifyVariantId: product.shopify_variant_id,
          found: true,
          source: 'database'
        })
        foundInDatabase++
      }
    }
    
    // Find barcodes not in database
    for (const barcode of barcodes) {
      if (!mappings.has(barcode)) {
        remainingBarcodes.push(barcode)
      }
    }
  } else {
    remainingBarcodes.push(...barcodes)
  }
  
  console.log(`✅ Database results: ${foundInDatabase} found, ${remainingBarcodes.length} need API discovery`)
  
  // Step 2: API discovery for remaining barcodes (with rate limiting)
  let discoveredViaAPI = 0
  
  if (remainingBarcodes.length > 0) {
    console.log(`🔍 Step 2: API discovery for ${remainingBarcodes.length} remaining barcodes...`)
    
    // Process in smaller batches to avoid overwhelming the API
    const batchSize = 10
    const batches = []
    for (let i = 0; i < remainingBarcodes.length; i += batchSize) {
      batches.push(remainingBarcodes.slice(i, i + batchSize))
    }
    
    console.log(`📦 Processing ${batches.length} batches of up to ${batchSize} barcodes each`)
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      console.log(`🔍 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} barcodes)`)
      
      // Process batch in parallel (but limited batch size for rate limiting)
      const batchPromises = batch.map(async (barcode) => {
        const searchStart = Date.now()
        
        try {
          const variant = await findShopifyVariantByBarcode(barcode)
          
          if (variant?.product_id) {
            const searchTimeMs = Date.now() - searchStart
            
            // Save to database
            await saveShopifyMapping(barcode, variant.product_id, variant.id, variant.inventory_item_id)
            
            return {
              barcode,
              shopifyProductId: variant.product_id.toString(),
              shopifyVariantId: variant.id,
              shopifyInventoryItemId: variant.inventory_item_id,
              found: true,
              source: 'api_discovery' as const,
              searchTimeMs
            }
          }
        } catch (error) {
          console.warn(`⚠️ API discovery failed for ${barcode}:`, error)
        }
        
        return {
          barcode,
          found: false,
          source: 'api_discovery' as const,
          searchTimeMs: Date.now() - searchStart
        }
      })
      
      const batchResults = await Promise.all(batchPromises)
      
      // Add batch results to mappings
      for (const result of batchResults) {
        mappings.set(result.barcode, result)
        if (result.found) {
          discoveredViaAPI++
        }
      }
      
      console.log(`✅ Batch ${batchIndex + 1} complete: ${batchResults.filter(r => r.found).length}/${batch.length} found`)
      
      // Rate limiting delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }
  
  const totalTimeMs = Date.now() - startTime
  const notFound = barcodes.length - foundInDatabase - discoveredViaAPI
  
  console.log(`🏁 Bulk mapping complete (${totalTimeMs}ms):`)
  console.log(`   📊 Total requested: ${barcodes.length}`)
  console.log(`   ✅ Found in database: ${foundInDatabase}`)
  console.log(`   🔍 Discovered via API: ${discoveredViaAPI}`)
  console.log(`   ❌ Not found: ${notFound}`)
  
  return {
    mappings,
    totalRequested: barcodes.length,
    foundInDatabase,
    discoveredViaAPI,
    notFound,
    totalTimeMs
  }
}

/**
 * Save a discovered Shopify mapping to the database
 */
async function saveShopifyMapping(
  barcode: string, 
  shopifyProductId: number, 
  shopifyVariantId?: number,
  _shopifyInventoryItemId?: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from('products')
      .update({
        shopify_product_id: shopifyProductId,
        shopify_variant_id: shopifyVariantId,
        updated_at: new Date().toISOString()
      })
      .eq('barcode', barcode)
    
    if (error) {
      console.warn(`⚠️ Failed to save mapping for ${barcode}:`, error)
    } else {
      console.log(`💾 Saved mapping: ${barcode} → ${shopifyProductId}`)
    }
  } catch (error) {
    console.warn(`⚠️ Error saving mapping for ${barcode}:`, error)
  }
}

// =====================================================
// MIGRATION AND MAINTENANCE FUNCTIONS
// =====================================================

/**
 * Migrate from hardcoded knownProducts to database
 * This helps transition existing hardcoded mappings to the database
 */
export async function migrateHardcodedMappings(): Promise<{
  migrated: number
  errors: number
  details: Array<{ barcode: string; status: 'success' | 'error'; message: string }>
}> {
  console.log(`🔄 Migrating hardcoded mappings to database...`)
  
  // Hardcoded mappings from current system (these will be eliminated after migration)
  const hardcodedMappings: Record<string, string> = {
    '4770175046139': '10700461048139', // cream-cheese-bars-with-coconut
    '4251727400116': '10357637120331', // snack-from-spotted-bigeye-salted-and-dried
    '4030011300116': '10357639905611', // sweetend-condensed-milk-8-fat
    '4033443612017': '10357666545995', // sour-cherry-fruit-drink
    '4251727401113': '10357696397643', // snack-of-selene-on-a-banded-doree
    '4251727401441': '10357712519499', // snack-composed-of-giant-squid-strips
    '4033443112272': '10357719400779', // snack-of-large-scales-of-lizardfish
    '4030957191182': '10357725430091', // buckwheat-flour
    '4030011300123': '10357733851467', // product-based-on-sour-and-cooked-condensed-milk
    '4030011300147': '10357735522635', // sweetened-condensed-milk-9-fat
    '4030011310016': '10357737750859', // atlantic-sardines-in-vegetable-oil
    '4030011310054': '10357739487563', // sprats-whole-and-in-pieces-fried
    '4030011310061': '10357741584715', // mackerel-with-skin-and-bones
    '4030011310184': '10357754659147', // skin-and-bones-in-its-own-juice
    '4030011310221': '10357755380043', // pacific-herring
    '4030011310320': '10357756232011', // sardinops-herring-fish-chunks
    '4030011310382': '10357757575499', // salmon-pieces-with-skin-and-bones
    '4030011310306': '10357770158411', // sprats-smoked-in-vegetable-oil
    '4030011310412': '10357778776395', // smoked-sprats-in-vegetable-oil
    '4750017355292': '10357780775243', // smoked-sprats-pate
    '4030011310498': '10357782872395', // atlantic-salmon-fillets-in-mustard-sauce
    '4030011310504': '10357783986507', // fish-liver-in-natural-juice
    '4030011310566': '10357789360459', // own-juice-and-oil-smoked
    '4030011310818': '10357794931019', // salmon-meatballs-in-tomato-sauce
    '4030011310825': '10357795750219', // pacific-humpback-salmon-head-slice
    '4030011330007': '10357797814603', // braised-pork-in-seafood
    '4030011330021': '10357802139979', // braised-beef-in-seafood
    '4030011330038': '10357803123019', // chicken-braised-stew
    '4030011330045': '10357803909451', // braised-turkey-stew
    '4030011330205': '10357807481163', // braised-pork-shoulder
    '4030011330304': '10357811118411', // beef-in-spicy-infusion
    '4030011330403': '10357815116107', // pork-porridge-with-buckwheat
    '4030011330458': '10357817147723', // rice-platter-with-pork-pilaf
    '4030011330502': '10357822193995', // barley-porridge-with-lamb
    '4030011330557': '10357822980427', // buckwheat-porridge-with-beef
    '4033443332182': '10357824225611', // moja-semja-braised-pork-with-chicken
    '4033443332205': '10357842018635', // moja-semja-lamb-and-beef-stewed
    '4030011350036': '10357846540619', // white-beans-in-tomato-sauce
    '4030011350067': '10357847294283', // eggplant-salad-with-prunes
    '4030011350098': '10357851783499', // eggplant-salad-with-vegetables
    '4030011350111': '10357852242251', // bulgarian-vegetable-salad
    '4030011350135': '10357852832075', // vegetable-salad-with-rice
    '4030011350197': '10357853749579', // danube-vegetable-salad
    '4030011350258': '10357857485131', // melange-de-legumes-ete-salad
    '4030011350326': '10357858140491', // bulgarian-eggplant-stew
    '4030011350401': '10357858828619', // bulgarian-salad-with-fried-eggplants
    '4030011350418': '10357862728011', // salad-of-bulgarian-legumes
    '4030011350517': '10357874852171', // preparation-de-legumes-ovoshchnoie
    '4850009749600': '10357879406923', // preparation-of-tomatoes-with-poivrons
    '4030957351739': '10357886779723', // ker-u-sus-eggplant-preparation
    '4030957351753': '10357889827147', // preparation-of-aubergines-eggs
    '4770237043687': '10790739673419', // dessert-based-on-cottage-cheese-strawberry-150-g
    '4770275047784': '67138526-b24b-4fe7-8ef2-06c60aac6f7a', // tworog-svalya-15-450g
    '4770275047746': 'e6d625db-ab60-44b3-a04c-9a1595cfd15a', // tworog-svalya-cheese-9-450g
    '4607012353382': '10358650437963', // White sunflower seeds in shell, salted "Ot Martina", 250g
    '4840022010436': '10359230965851', // Pitted cherry jam, 680g
    '4036117010034': '10697881878859', // Dumplings with potatoes "Varniki", 450g
  }
  
  const details: Array<{ barcode: string; status: 'success' | 'error'; message: string }> = []
  let migrated = 0
  let errors = 0
  
  for (const [barcode, shopifyProductId] of Object.entries(hardcodedMappings)) {
    try {
      // Check if product exists in database
      const { data: existingProduct, error: findError } = await supabase
        .from('products')
        .select('id, shopify_product_id')
        .eq('barcode', barcode)
        .single()
      
      if (findError || !existingProduct) {
        details.push({
          barcode,
          status: 'error',
          message: 'Product not found in database'
        })
        errors++
        continue
      }
      
      if (existingProduct.shopify_product_id) {
        details.push({
          barcode,
          status: 'success',
          message: 'Already has shopify_product_id'
        })
        continue
      }
      
      // Update with Shopify product ID
      const { error: updateError } = await supabase
        .from('products')
        .update({
          shopify_product_id: parseInt(shopifyProductId),
          updated_at: new Date().toISOString()
        })
        .eq('barcode', barcode)
      
      if (updateError) {
        details.push({
          barcode,
          status: 'error',
          message: `Update failed: ${updateError.message}`
        })
        errors++
      } else {
        details.push({
          barcode,
          status: 'success',
          message: `Migrated: ${shopifyProductId}`
        })
        migrated++
      }
      
    } catch (error) {
      details.push({
        barcode,
        status: 'error',
        message: `Exception: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      errors++
    }
  }
  
  console.log(`✅ Migration complete: ${migrated} migrated, ${errors} errors`)
  return { migrated, errors, details }
}

/**
 * Clear all Shopify mappings from database (for testing/reset)
 */
export async function clearAllShopifyMappings(): Promise<{ cleared: number; error?: string }> {
  try {
    const { count, error } = await supabase
      .from('products')
      .update({
        shopify_product_id: null,
        shopify_variant_id: null,
        updated_at: new Date().toISOString()
      })
      .not('shopify_product_id', 'is', null)
    
    if (error) {
      return { cleared: 0, error: error.message }
    }
    
    console.log(`🧹 Cleared ${count || 0} Shopify mappings from database`)
    return { cleared: count || 0 }
  } catch (error) {
    return { 
      cleared: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// =====================================================
// DIAGNOSTIC FUNCTIONS
// =====================================================

/**
 * Get statistics about current Shopify mappings in database
 */
export async function getShopifyMappingStats(): Promise<{
  totalProducts: number
  withShopifyIds: number
  withoutShopifyIds: number
  percentageMapped: number
}> {
  try {
    // Get total count
    const { count: totalProducts, error: totalError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
    
    if (totalError) {
      throw totalError
    }
    
    // Get count with Shopify IDs
    const { count: withShopifyIds, error: mappedError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .not('shopify_product_id', 'is', null)
    
    if (mappedError) {
      throw mappedError
    }
    
    const total = totalProducts || 0
    const mapped = withShopifyIds || 0
    const unmapped = total - mapped
    const percentage = total > 0 ? Math.round((mapped / total) * 100) : 0
    
    return {
      totalProducts: total,
      withShopifyIds: mapped,
      withoutShopifyIds: unmapped,
      percentageMapped: percentage
    }
  } catch (error) {
    console.error('Error getting mapping stats:', error)
    return {
      totalProducts: 0,
      withShopifyIds: 0,
      withoutShopifyIds: 0,
      percentageMapped: 0
    }
  }
}
