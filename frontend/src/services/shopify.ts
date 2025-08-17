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
  
  console.log(`🔍 Looking for Shopify location: "${locationName}"`)
  console.log(`📍 Available Shopify locations:`, locations.map(l => ({
    id: l.id,
    name: l.name,
    active: l.active
  })))
  
  const match = locations.find(location => 
    location.name.toLowerCase() === locationName.toLowerCase()
  )
  
  if (match) {
    console.log(`✅ Found matching location: ${match.name} (ID: ${match.id})`)
  } else {
    console.log(`❌ No exact match found for "${locationName}"`)
    // Try partial matching
    const partialMatch = locations.find(location => 
      location.name.toLowerCase().includes(locationName.toLowerCase()) ||
      locationName.toLowerCase().includes(location.name.toLowerCase())
    )
    if (partialMatch) {
      console.log(`⚠️ Found partial match: ${partialMatch.name} (ID: ${partialMatch.id})`)
      return partialMatch
    }
  }
  
  return match || null
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

// Efficient bulk search for sync operations - loads products in batches and searches multiple barcodes
export async function findMultipleShopifyVariantsByBarcodes(barcodes: string[]): Promise<Map<string, ShopifyVariant>> {
  const results = new Map<string, ShopifyVariant>()
  const remainingBarcodes = new Set(barcodes)
  
  console.log(`🔍 Bulk search for ${barcodes.length} barcodes`)
  
  let sinceId = 0
  let searchedProducts = 0
  const limit = 250
  const maxProductsToSearch = 2000 // Keep reasonable limit for bulk search performance
  let consecutiveEmptyBatches = 0
  const maxEmptyBatches = 2
  
  while (searchedProducts < maxProductsToSearch && consecutiveEmptyBatches < maxEmptyBatches && remainingBarcodes.size > 0) {
    try {
      const endpoint = sinceId > 0 
        ? `/products.json?fields=id,title,variants&limit=${limit}&since_id=${sinceId}`
        : `/products.json?fields=id,title,variants&limit=${limit}`
        
      const response = await shopifyApiRequest(endpoint)
      const products: ShopifyProduct[] = response.products || []
      
      if (products.length === 0) {
        consecutiveEmptyBatches++
        continue
      }
      
      consecutiveEmptyBatches = 0
      
      // Check all products against all remaining barcodes
      for (const product of products) {
        if (product.variants) {
          for (const variant of product.variants) {
            for (const barcode of remainingBarcodes) {
              const matchResult = matchesBarcode(variant.barcode, barcode)
              if (matchResult.matches) {
                results.set(barcode, variant)
                remainingBarcodes.delete(barcode)
                console.log(`✅ Found variant for barcode ${barcode} (${matchResult.strategy} match)`)
                
                // Special logging for problematic barcode
                if (barcode === '4770175046139') {
                  console.log(`🎯 FOUND 4770175046139 in bulk search!`)
                  console.log(`   - Product: ${product.title}`)
                  console.log(`   - Variant ID: ${variant.id}`)
                  console.log(`   - Shopify barcode: "${variant.barcode}"`)
                  console.log(`   - Search barcode: "${barcode}"`)
                  console.log(`   - Match strategy: ${matchResult.strategy}`)
                }
              }
            }
          }
        }
      }
      
      searchedProducts += products.length
      sinceId = products[products.length - 1].id
      
      if (searchedProducts % 500 === 0) {
        console.log(`📊 Bulk search progress: ${searchedProducts}/${maxProductsToSearch} products, ${results.size}/${barcodes.length} barcodes found`)
      }
      
    } catch (error) {
      console.warn(`⚠️ Error in bulk search:`, error)
      break
    }
  }
  
  console.log(`🏁 Bulk search completed: found ${results.size}/${barcodes.length} variants after searching ${searchedProducts} products`)
  return results
}

export async function findShopifyVariantByBarcode(barcode: string): Promise<ShopifyVariant | null> {
  try {
    console.log(`🔍 Comprehensive individual search for barcode: ${barcode}`)
    
    // For individual searches, search ALL products without limits to ensure we find it
    let sinceId = 0
    let searchedProducts = 0
    const limit = 250
    let consecutiveEmptyBatches = 0
    const maxEmptyBatches = 5 // More patience for individual searches
    
    while (consecutiveEmptyBatches < maxEmptyBatches) {
      console.log(`📄 Searching products since ID ${sinceId}... (searched: ${searchedProducts})`)
      
      try {
        const endpoint = sinceId > 0 
          ? `/products.json?fields=id,title,variants&limit=${limit}&since_id=${sinceId}`
          : `/products.json?fields=id,title,variants&limit=${limit}`
          
        const response = await shopifyApiRequest(endpoint)
        const products: ShopifyProduct[] = response.products || []
        
        if (products.length === 0) {
          consecutiveEmptyBatches++
          console.log(`📋 Empty batch ${consecutiveEmptyBatches}/${maxEmptyBatches}, searched ${searchedProducts} total`)
          if (consecutiveEmptyBatches >= maxEmptyBatches) {
            console.log(`📋 Stopping search after ${consecutiveEmptyBatches} consecutive empty batches`)
            break
          }
          continue
        }
        
        // Reset empty batch counter when we get products
        consecutiveEmptyBatches = 0
        
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
        
        // Progress reporting every 500 products
        if (searchedProducts % 500 === 0 && searchedProducts > 0) {
          console.log(`📊 Progress: searched ${searchedProducts} products so far...`)
        }
        
      } catch (error) {
        console.warn(`⚠️ Error searching products since ID ${sinceId}:`, error)
        break
      }
    }
    
    console.log(`❌ No variant found for barcode: ${barcode} after searching ${searchedProducts} products with cursor-based pagination`)
    
    // Try one more approach: search with a very broad ID range
    console.log(`🔄 Final attempt: searching with different ID strategies for ${barcode}`)
    
    const largeIdRanges = [10000000, 50000000, 100000000, 500000000] // Try very large ID ranges
    
    for (const startId of largeIdRanges) {
      try {
        console.log(`📄 Trying search from very large product ID ${startId}...`)
        const response = await shopifyApiRequest(`/products.json?fields=id,title,variants&limit=250&since_id=${startId}`)
        const products: ShopifyProduct[] = response.products || []
        
        if (products.length === 0) continue
        
        console.log(`📦 Found ${products.length} products starting from large ID ${startId}`)
        
        for (const product of products) {
          if (product.variants) {
            for (const variant of product.variants) {
              const matchResult = matchesBarcode(variant.barcode, barcode)
              
              if (matchResult.matches) {
                console.log(`✅ FOUND ${barcode} using large ID range search! (${matchResult.strategy} match)`)
                console.log(`   - Product: ${product.title}`)
                console.log(`   - Variant ID: ${variant.id}`)
                console.log(`   - Shopify barcode: "${variant.barcode}"`)
                return variant
              }
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Large ID range search failed for ${startId}:`, error)
      }
    }
    
    console.log(`❌ No variant found for barcode: ${barcode} after comprehensive search including large ID ranges`)
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

// SOLUTION: Direct Product ID Sync (bypasses pagination limits)
export async function syncStoreStockToShopifyDirect(
  storeId: string,
  storeName: string,
  inventory: CurrentInventory[]
): Promise<ShopifyStockSyncResult> {
  console.log(`🚀 DIRECT SYNC: Starting sync with ${inventory.length} products`)
  
  // CRITICAL DIAGNOSTIC: Check if 4770237043687 is in inventory
  const target = inventory.find(item => item.product?.barcode === '4770237043687')
  if (target) {
    console.log(`🎯 FOUND 4770237043687 in inventory:`)
    console.log(`   - quantity: ${target.quantity}`)
    console.log(`   - reserved_quantity: ${target.reserved_quantity}`)
    console.log(`   - available_quantity: ${target.available_quantity}`)
    console.log(`   - product_id: ${target.product_id}`)
    console.log(`   - store_id: ${target.store_id}`)
  } else {
    console.log(`❌ CRITICAL: 4770237043687 NOT FOUND in inventory list!`)
    console.log(`   - Total inventory items: ${inventory.length}`)
    console.log(`   - Sample barcodes:`, inventory.slice(0, 5).map(i => i.product?.barcode).filter(Boolean))
  }
  
  const startTime = Date.now()
  const results: ShopifyPushResult[] = []
  let successfulUpdates = 0
  let failedUpdates = 0
  
  // Find the Shopify location that matches the store name
  let shopifyLocation
  try {
    shopifyLocation = await findShopifyLocationByName(storeName)
  } catch (error) {
    console.error('Error finding Shopify location:', error)
    throw new Error(`Error finding Shopify location: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
  
  if (!shopifyLocation) {
    throw new Error(`No Shopify location found with name "${storeName}"`)
  }
  
  console.log(`📍 Target location: ${shopifyLocation.name} (ID: ${shopifyLocation.id})`)
  
  // EXPANDED: Known product mappings from CSV for fast direct access
  const knownProducts: Record<string, string> = {
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
    // Add more as needed - this should cover many of the common products
  }
  
  let processed = 0
  let found = 0
  
  // Filter to only products with barcodes
  const validInventory = inventory.filter(item => item.product?.barcode)
  console.log(`📋 Processing ${validInventory.length} products with barcodes`)
  
  // OPTIMIZATION: Split into known and unknown products for different processing strategies
  const knownProductItems = validInventory.filter(item => knownProducts[item.product!.barcode!])
  const unknownProductItems = validInventory.filter(item => !knownProducts[item.product!.barcode!])
  
  console.log(`⚡ OPTIMIZATION: ${knownProductItems.length} known products (fast), ${unknownProductItems.length} unknown (slow search)`)
  
  // Phase 1: Process known products FAST (direct API calls)
  console.log(`\n🚀 Phase 1: Processing ${knownProductItems.length} known products (FAST)...`)
  for (const item of knownProductItems) {
    const barcode = item.product!.barcode!
    processed++
    
    try {
      if (processed % 50 === 0) {
        console.log(`📊 Progress: ${processed}/${validInventory.length} (${Math.round(processed/validInventory.length*100)}%)`)
      }
      
      const productId = knownProducts[barcode]
      const response = await shopifyApiRequest(`/products/${productId}.json`)
      
      let variant = null
      if (response.product?.variants) {
        for (const v of response.product.variants) {
          if (v.barcode === barcode) {
            variant = v
            break
          }
        }
      }
      
      if (!variant) {
        console.log(`⚠️ Known product ${barcode} not found, skipping`)
        results.push({
          barcode,
          status: 'error',
          message: 'Known product ID returned no matching variant'
        })
        failedUpdates++
        continue
      }
      
      found++
      
      // Update inventory - use available quantity (not total quantity)
      const newQuantity = item.available_quantity
      
      // Special debugging for problematic barcode
      if (barcode === '4770237043687') {
        console.log(`🎯 DEBUGGING FULL SYNC for 4770237043687:`)
        console.log(`   - Database quantity: ${item.quantity}`)
        console.log(`   - Database reserved_quantity: ${item.reserved_quantity}`)
        console.log(`   - Database available_quantity: ${item.available_quantity}`)
        console.log(`   - Using newQuantity: ${newQuantity}`)
        console.log(`   - Product ID: ${item.product_id}`)
        console.log(`   - Store ID: ${item.store_id}`)
        console.log(`   - Full item:`, JSON.stringify(item, null, 2))
      }
      
      await updateInventoryLevel(variant.inventory_item_id, shopifyLocation.id, newQuantity)
      
      successfulUpdates++
      results.push({
        barcode,
        status: 'success',
        message: `Updated inventory to ${newQuantity}`,
        shopify_variant_id: variant.id,
        shopify_inventory_item_id: variant.inventory_item_id
      })
      
    } catch (error) {
      console.error(`❌ Error processing known product ${barcode}:`, error)
      failedUpdates++
      results.push({
        barcode,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
  
  // Phase 2: Process unknown products with bulk search
  console.log(`\n🔍 Phase 2: Processing ${unknownProductItems.length} unknown products (bulk search)...`)
  if (unknownProductItems.length > 0) {
    // First try bulk search to find as many as possible
    const unknownBarcodes = unknownProductItems.map(item => item.product!.barcode!)
    console.log(`🔄 Bulk searching for ${unknownBarcodes.length} unknown products...`)
    
    const bulkResults = await findMultipleShopifyVariantsByBarcodes(unknownBarcodes)
    
    // Process bulk results
    for (const item of unknownProductItems) {
      const barcode = item.product!.barcode!
      processed++
      
      try {
        if (processed % 50 === 0) {
          console.log(`📊 Progress: ${processed}/${validInventory.length} (${Math.round(processed/validInventory.length*100)}%)`)
        }
        
        const bulkVariant = bulkResults.get(barcode)
        
        if (bulkVariant) {
          found++
          
          // Update inventory - use available quantity (not total quantity)  
          const newQuantity = item.available_quantity
          
          // Special debugging for problematic barcode
          if (barcode === '4770237043687') {
            console.log(`🎯 DEBUGGING FULL SYNC Phase 2 for 4770237043687:`)
            console.log(`   - Database quantity: ${item.quantity}`)
            console.log(`   - Database reserved_quantity: ${item.reserved_quantity}`)
            console.log(`   - Database available_quantity: ${item.available_quantity}`)
            console.log(`   - Using newQuantity: ${newQuantity}`)
            console.log(`   - Found via bulk search`)
          }
          
          await updateInventoryLevel(bulkVariant.inventory_item_id, shopifyLocation.id, newQuantity)
          
          successfulUpdates++
          results.push({
            barcode,
            status: 'success',
            message: `Updated inventory to ${newQuantity} (bulk found)`,
            shopify_variant_id: bulkVariant.id,
            shopify_inventory_item_id: bulkVariant.inventory_item_id
          })
        } else {
          // Not found in bulk search
          results.push({
            barcode,
            status: 'error',
            message: 'Product not found in accessible products'
          })
          failedUpdates++
        }
        
      } catch (error) {
        console.error(`❌ Error processing unknown product ${barcode}:`, error)
        failedUpdates++
        results.push({
          barcode,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }
  
  const duration = Date.now() - startTime
  
  console.log(`\n📊 DIRECT SYNC COMPLETE:`)
  console.log(`   - Processed: ${processed}`)
  console.log(`   - Found: ${found}`)
  console.log(`   - Updated: ${successfulUpdates}`)
  console.log(`   - Errors: ${failedUpdates}`)
  console.log(`   - Success Rate: ${found > 0 ? Math.round((successfulUpdates/found) * 100) : 0}%`)
  console.log(`   - Duration: ${Math.round(duration/1000)}s`)
  
  return {
    store_id: storeId,
    store_name: storeName,
    shopify_location_name: shopifyLocation.name,
    shopify_location_id: shopifyLocation.id,
    total_products: validInventory.length,
    successful_updates: successfulUpdates,
    failed_updates: failedUpdates,
    skipped_products: 0,
    processing_time_ms: duration,
    results
  }
}

// LEGACY: Original sync function (limited by pagination)
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
  
  // Extract all barcodes for bulk search
  const allBarcodes = validInventory.map(item => item.product!.barcode!)
  console.log(`🚀 Starting bulk search for ${allBarcodes.length} barcodes...`)
  
  // Perform bulk search to find all variants at once
  const bulkSearchResults = await findMultipleShopifyVariantsByBarcodes(allBarcodes)
  
  console.log(`📊 Bulk search found ${bulkSearchResults.size}/${allBarcodes.length} variants`)
  
  // For any missing products, try individual comprehensive search
  const missingBarcodes = allBarcodes.filter(barcode => !bulkSearchResults.has(barcode))
  console.log(`🔍 Attempting individual search for ${missingBarcodes.length} missing products...`)
  
  for (const barcode of missingBarcodes) {
    if (barcode === '4770175046139') {
      console.log(`🎯 Trying comprehensive individual search for 4770175046139...`)
    }
    
    const variant = await findShopifyVariantByBarcode(barcode)
    if (variant) {
      bulkSearchResults.set(barcode, variant)
      console.log(`✅ Found missing product ${barcode} via individual search`)
    }
  }
  
  console.log(`📊 After individual searches: ${bulkSearchResults.size}/${allBarcodes.length} variants found`)
  
  // Process each inventory item with pre-found variants
  for (let i = 0; i < validInventory.length; i++) {
    const inventoryItem = validInventory[i]
    const product = inventoryItem.product!
    const progress = `${i + 1}/${validInventory.length}`
    
    console.log(`🔄 [${progress}] Processing: ${product.name} (${product.barcode}) - Quantity: ${inventoryItem.available_quantity}`)

    try {
      // Get the pre-found Shopify variant from bulk search
      const shopifyVariant = bulkSearchResults.get(product.barcode!)
      
      // Special detailed logging for the specific problematic barcode
      if (product.barcode === '4770175046139') {
        console.log(`🎯 SPECIAL DEBUG for barcode 4770175046139:`)
        console.log(`   - Bulk search found variant:`, shopifyVariant ? 'YES' : 'NO')
        if (shopifyVariant) {
          console.log(`   - Variant details:`, {
            variant_id: shopifyVariant.id,
            inventory_item_id: shopifyVariant.inventory_item_id,
            stored_barcode: shopifyVariant.barcode
          })
        }
        console.log(`   - Target location: ${shopifyLocation.name} (ID: ${shopifyLocation.id})`)
        console.log(`   - Expected quantity: ${inventoryItem.available_quantity}`)
      }
      
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
      let currentLevels: ShopifyInventoryLevel[] = []
      try {
        currentLevels = await getInventoryLevels(shopifyVariant.inventory_item_id)
        const currentLevel = currentLevels.find(level => level.location_id === shopifyLocation.id)
        inventoryBefore = currentLevel ? currentLevel.available : 0
        
        // Special detailed logging for the specific problematic barcode
        if (product.barcode === '4770175046139') {
          console.log(`🎯 INVENTORY LEVELS for 4770175046139:`)
          console.log(`   - All locations for this product:`, currentLevels.map(level => ({
            location_id: level.location_id,
            available: level.available
          })))
          console.log(`   - Current level at target location (${shopifyLocation.id}):`, inventoryBefore)
        }
      } catch (error) {
        console.warn(`⚠️ [${progress}] Could not get current inventory levels, assuming 0:`, error)
      }

      // Special logging before update for problematic barcode
      if (product.barcode === '4770175046139') {
        console.log(`🎯 ABOUT TO UPDATE 4770175046139:`)
        console.log(`   - Inventory Item ID: ${shopifyVariant.inventory_item_id}`)
        console.log(`   - Location ID: ${shopifyLocation.id}`)
        console.log(`   - New Quantity: ${inventoryItem.available_quantity}`)
        console.log(`   - Previous Quantity: ${inventoryBefore}`)
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

// COMPREHENSIVE PRODUCT DIAGNOSTIC: Test specific product sync process
export async function testSingleProductUpdate(barcode: string = '4770175046139'): Promise<{
  success: boolean
  found: boolean
  updated: boolean
  details: any
  error?: string
}> {
  console.log(`🔬 COMPREHENSIVE DIAGNOSTIC: Testing product sync for ${barcode}`)
  console.log(`📋 TESTING FULL SYNC PROCESS:`)
  console.log(`   - Check if barcode exists in known products`)
  console.log(`   - Test direct API access`)
  console.log(`   - Check current inventory levels`)
  console.log(`   - Attempt inventory update`)
  console.log(`   - Verify update was successful`)
  
  try {
    const diagnosticResults: any = {
      barcode: barcode,
      isKnownProduct: false,
      shopifyProductId: null,
      directApiSuccess: false,
      variantFound: false,
      inventoryItemId: null,
      currentInventoryLevels: [],
      shopDemoLocationId: null,
      updateAttempted: false,
      updateSuccessful: false,
      finalInventoryLevels: [],
      errors: []
    }
    
    // Step 1: Check if this barcode is in our known products
    const knownProducts: Record<string, string> = {
      '4770175046139': '10700461048139', // cream-cheese-bars-with-coconut
      '4770237043687': '10790739673419', // dessert-based-on-cottage-cheese-strawberry-150-g
    }
    
    console.log(`\n🔍 Step 1: Checking known products...`)
    if (knownProducts[barcode]) {
      diagnosticResults.isKnownProduct = true
      diagnosticResults.shopifyProductId = knownProducts[barcode]
      console.log(`✅ Found in known products: ${diagnosticResults.shopifyProductId}`)
    } else {
      console.log(`⚠️ Not in known products - will search via API`)
    }
    
    // Step 2: Get Shopify locations
    console.log(`\n📍 Step 2: Getting Shopify locations...`)
    const locations = await getShopifyLocations()
    const shopDemoLocation = locations.find(l => l.name.toLowerCase() === 'shop demo')
    
    if (!shopDemoLocation) {
      throw new Error('Shop Demo location not found')
    }
    
    diagnosticResults.shopDemoLocationId = shopDemoLocation.id
    console.log(`✅ Found Shop Demo location: ID ${shopDemoLocation.id}`)
    
    // Step 3: Try to get the product (either known or search)
    console.log(`\n🔍 Step 3: Getting product details...`)
    let variant = null
    
    if (diagnosticResults.isKnownProduct) {
      console.log(`📞 Using known product ID: ${diagnosticResults.shopifyProductId}`)
      try {
        const response = await shopifyApiRequest(`/products/${diagnosticResults.shopifyProductId}.json`)
        diagnosticResults.directApiSuccess = true
        
        if (response.product?.variants) {
          for (const v of response.product.variants) {
            if (v.barcode === barcode) {
              variant = v
              diagnosticResults.variantFound = true
              diagnosticResults.inventoryItemId = v.inventory_item_id
              console.log(`✅ Found variant: ID ${v.id}, Inventory Item ID: ${v.inventory_item_id}`)
              break
            }
          }
        }
      } catch (error) {
        diagnosticResults.errors.push(`Direct API call failed: ${error}`)
        console.log(`❌ Direct API call failed:`, error)
      }
    }
    
    if (!variant) {
      console.log(`🔍 Product not found via direct access, trying search...`)
      variant = await findShopifyVariantByBarcode(barcode)
      if (variant) {
        diagnosticResults.variantFound = true
        diagnosticResults.inventoryItemId = variant.inventory_item_id
        console.log(`✅ Found via search: ID ${variant.id}, Inventory Item ID: ${variant.inventory_item_id}`)
      }
    }
    
    if (!variant) {
      console.log(`❌ Product variant not found anywhere`)
      return {
        success: true,
        found: false,
        updated: false,
        details: {
          ...diagnosticResults,
          conclusion: 'Product variant not found in Shopify'
        }
      }
    }
    
    // Step 4: Get current inventory levels
    console.log(`\n📊 Step 4: Getting current inventory levels...`)
    try {
      const currentLevels = await getInventoryLevels(variant.inventory_item_id)
      diagnosticResults.currentInventoryLevels = currentLevels
      
      const currentLevel = currentLevels.find(level => level.location_id === shopDemoLocation.id)
      const inventoryBefore = currentLevel ? currentLevel.available : 0
      
      console.log(`📊 Current inventory levels:`, currentLevels)
      console.log(`📊 Current inventory at Shop Demo: ${inventoryBefore}`)
      
      // Step 5: Update inventory to 1 (from POS CSV)
      console.log(`\n📝 Step 5: Updating inventory to 1...`)
      diagnosticResults.updateAttempted = true
      
      await updateInventoryLevel(variant.inventory_item_id, shopDemoLocation.id, 1)
      console.log(`✅ Update API call completed`)
      
      // Step 6: Verify the update worked
      console.log(`\n🔍 Step 6: Verifying update...`)
      const finalLevels = await getInventoryLevels(variant.inventory_item_id)
      diagnosticResults.finalInventoryLevels = finalLevels
      
      const finalLevel = finalLevels.find(level => level.location_id === shopDemoLocation.id)
      const inventoryAfter = finalLevel ? finalLevel.available : 0
      
      console.log(`📊 Final inventory levels:`, finalLevels)
      console.log(`📊 Final inventory at Shop Demo: ${inventoryAfter}`)
      
      if (inventoryAfter === 1) {
        diagnosticResults.updateSuccessful = true
        console.log(`🎉 SUCCESS! Inventory updated from ${inventoryBefore} to ${inventoryAfter}`)
        
        return {
          success: true,
          found: true,
          updated: true,
          details: {
            ...diagnosticResults,
            inventoryBefore,
            inventoryAfter,
            conclusion: 'Product successfully found and updated'
          }
        }
      } else {
        diagnosticResults.errors.push(`Update failed: expected 1, got ${inventoryAfter}`)
        console.log(`❌ Update failed: expected 1, got ${inventoryAfter}`)
        
        return {
          success: true,
          found: true,
          updated: false,
          details: {
            ...diagnosticResults,
            inventoryBefore,
            inventoryAfter,
            conclusion: 'Product found but inventory update failed'
          }
        }
      }
      
    } catch (error) {
      diagnosticResults.errors.push(`Inventory operation failed: ${error}`)
      console.log(`❌ Inventory operation failed:`, error)
      
      return {
        success: false,
        found: true,
        updated: false,
        details: diagnosticResults,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
    
  } catch (error) {
    console.error(`❌ Diagnostic failed:`, error)
    return {
      success: false,
      found: false,
      updated: false,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// UTILITY: Generate complete product mapping from CSV data
export function generateProductMappingFromCSV(csvData: string): Record<string, string> {
  const mappings: Record<string, string> = {}
  const lines = csvData.split('\n')
  
  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i].trim()
    if (!line) continue
    
    const columns = line.split('","').map(col => col.replace(/^"|"$/g, ''))
    if (columns.length >= 3) {
      const shopifyId = columns[0] // ID column
      const barcode = columns[2] // Variant Barcode column
      
      if (barcode && barcode !== 'nan' && shopifyId) {
        mappings[barcode] = shopifyId
      }
    }
  }
  
  console.log(`📋 Generated ${Object.keys(mappings).length} product mappings from CSV`)
  return mappings
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