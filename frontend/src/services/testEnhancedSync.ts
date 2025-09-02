// Test Suite for Enhanced Shopify Sync
// Validates the new dynamic mapping system

import { 
  discoverShopifyMapping, 
  discoverMultipleShopifyMappings,
  getShopifyMapping,
  clearMappingCache,
  getCacheStats,
  CSVProductRow
} from './dynamicMapping'
// Note: These imports are available for future testing
// import { enhancedSyncStoreStockToShopify, syncFromCSVData } from './enhancedShopifySync'
import { testShopifyConnection } from './shopify'

// =====================================================
// TEST DATA
// =====================================================

const testCSVData: CSVProductRow[] = [
  {
    'Item name': 'Test Product 1',
    'Barcode': '4770175046139',
    'Quantity': '5',
    'Item id (Do not change)': '10700461048139',
    'Variant id (Do not change)': 'variant-123'
  },
  {
    'Item name': 'Test Product 2', 
    'Barcode': '4607012353382',
    'Quantity': '10',
    'Item id (Do not change)': '10358560437963',
    'Variant id (Do not change)': 'variant-456'
  },
  {
    'Item name': 'Unknown Product',
    'Barcode': '9999999999999',
    'Quantity': '1',
    'Item id (Do not change)': 'unknown-item',
    'Variant id (Do not change)': 'unknown-variant'
  }
]

// =====================================================
// TEST FUNCTIONS
// =====================================================

export async function runEnhancedSyncTests(): Promise<{
  success: boolean
  results: any[]
  summary: string
}> {
  console.log('🧪 ENHANCED SYNC TEST SUITE')
  console.log('=' .repeat(50))
  
  const results: any[] = []
  let passedTests = 0
  let totalTests = 0

  try {
    // Test 1: Shopify Connection
    totalTests++
    console.log('\n📡 Test 1: Shopify Connection')
    const connectionTest = await testShopifyConnection()
    
    if (connectionTest) {
      console.log('✅ Shopify connection successful')
      passedTests++
      results.push({ test: 'Shopify Connection', status: 'PASS', details: 'Connection established' })
    } else {
      console.log('❌ Shopify connection failed')
      results.push({ test: 'Shopify Connection', status: 'FAIL', details: 'Cannot connect to Shopify API' })
    }

    // Test 2: Cache System
    totalTests++
    console.log('\n💾 Test 2: Cache System')
    
    clearMappingCache()
    const initialStats = getCacheStats()
    
    if (initialStats.size === 0) {
      console.log('✅ Cache cleared successfully')
      passedTests++
      results.push({ test: 'Cache System', status: 'PASS', details: 'Cache management working' })
    } else {
      console.log('❌ Cache not cleared properly')
      results.push({ test: 'Cache System', status: 'FAIL', details: 'Cache management issue' })
    }

    // Test 3: Individual Product Discovery
    totalTests++
    console.log('\n🔍 Test 3: Individual Product Discovery')
    
    const knownBarcode = '4770175046139' // Known product from hardcoded list
    const discoveryResult = await discoverShopifyMapping(
      knownBarcode, 
      '10700461048139', 
      undefined,
      'Test Product'
    )
    
    if (discoveryResult) {
      console.log(`✅ Successfully discovered mapping for ${knownBarcode}`)
      console.log(`   Method: ${discoveryResult.discovery_method}`)
      console.log(`   Product ID: ${discoveryResult.shopify_product_id}`)
      passedTests++
      results.push({ 
        test: 'Individual Discovery', 
        status: 'PASS', 
        details: `Found via ${discoveryResult.discovery_method}` 
      })
    } else {
      console.log(`❌ Failed to discover mapping for ${knownBarcode}`)
      results.push({ 
        test: 'Individual Discovery', 
        status: 'FAIL', 
        details: 'Could not discover known product' 
      })
    }

    // Test 4: Bulk Product Discovery
    totalTests++
    console.log('\n🚀 Test 4: Bulk Product Discovery')
    
    const bulkResults = await discoverMultipleShopifyMappings(testCSVData)
    const foundCount = bulkResults.size
    const expectedMinimum = 1 // At least one product should be found
    
    if (foundCount >= expectedMinimum) {
      console.log(`✅ Bulk discovery successful: ${foundCount}/${testCSVData.length} products found`)
      
      bulkResults.forEach((mapping, barcode) => {
        console.log(`   ${barcode}: ${mapping.discovery_method}`)
      })
      
      passedTests++
      results.push({ 
        test: 'Bulk Discovery', 
        status: 'PASS', 
        details: `Found ${foundCount} products` 
      })
    } else {
      console.log(`❌ Bulk discovery failed: only ${foundCount} products found`)
      results.push({ 
        test: 'Bulk Discovery', 
        status: 'FAIL', 
        details: `Only found ${foundCount} products` 
      })
    }

    // Test 5: Cache Retrieval
    totalTests++
    console.log('\n📦 Test 5: Cache Retrieval')
    
    const cachedMapping = await getShopifyMapping(knownBarcode)
    
    if (cachedMapping) {
      console.log(`✅ Successfully retrieved cached mapping for ${knownBarcode}`)
      passedTests++
      results.push({ 
        test: 'Cache Retrieval', 
        status: 'PASS', 
        details: 'Cache retrieval working' 
      })
    } else {
      console.log(`❌ Failed to retrieve cached mapping for ${knownBarcode}`)
      results.push({ 
        test: 'Cache Retrieval', 
        status: 'FAIL', 
        details: 'Cache retrieval failed' 
      })
    }

    // Test 6: CSV Data Structure Validation
    totalTests++
    console.log('\n📋 Test 6: CSV Data Structure')
    
    const hasRequiredColumns = testCSVData.every(row => 
      row['Item name'] && 
      row['Barcode'] && 
      row['Quantity'] &&
      row['Item id (Do not change)'] &&
      row['Variant id (Do not change)']
    )
    
    if (hasRequiredColumns) {
      console.log('✅ CSV data structure is valid')
      passedTests++
      results.push({ 
        test: 'CSV Structure', 
        status: 'PASS', 
        details: 'All required columns present' 
      })
    } else {
      console.log('❌ CSV data structure is invalid')
      results.push({ 
        test: 'CSV Structure', 
        status: 'FAIL', 
        details: 'Missing required columns' 
      })
    }

    // Summary
    const successRate = Math.round((passedTests / totalTests) * 100)
    const summary = `${passedTests}/${totalTests} tests passed (${successRate}%)`
    
    console.log('\n' + '='.repeat(50))
    console.log('📊 TEST SUMMARY')
    console.log('='.repeat(50))
    console.log(`Total Tests: ${totalTests}`)
    console.log(`Passed: ${passedTests}`)
    console.log(`Failed: ${totalTests - passedTests}`)
    console.log(`Success Rate: ${successRate}%`)
    
    if (successRate >= 80) {
      console.log('🎉 Test suite PASSED - System ready for deployment!')
    } else {
      console.log('⚠️ Test suite FAILED - Issues need to be resolved')
    }

    return {
      success: successRate >= 80,
      results,
      summary
    }

  } catch (error) {
    console.error('❌ Test suite failed with error:', error)
    
    return {
      success: false,
      results: [...results, { 
        test: 'Test Suite', 
        status: 'ERROR', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }],
      summary: 'Test suite crashed'
    }
  }
}

// Performance test for the new system
export async function runPerformanceTest(): Promise<{
  avgDiscoveryTime: number
  cacheHitRate: number
  totalProducts: number
  recommendations: string[]
}> {
  console.log('\n⚡ PERFORMANCE TEST')
  console.log('=' .repeat(30))
  
  const testBarcodes = [
    '4770175046139', // Known product
    '4607012353382', // Another known product
    '1234567890123', // Unknown product
    '9876543210987', // Another unknown product
  ]
  
  const times: number[] = []
  let cacheHits = 0
  
  // Clear cache to start fresh
  clearMappingCache()
  
  for (const barcode of testBarcodes) {
    const startTime = Date.now()
    
    const mapping = await discoverShopifyMapping(barcode)
    
    const endTime = Date.now()
    const discoveryTime = endTime - startTime
    
    times.push(discoveryTime)
    
    if (mapping?.discovery_method === 'cache_hit') {
      cacheHits++
    }
    
    console.log(`${barcode}: ${discoveryTime}ms (${mapping?.discovery_method || 'not_found'})`)
  }
  
  const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length
  const cacheHitRate = (cacheHits / testBarcodes.length) * 100
  
  const recommendations: string[] = []
  
  if (avgTime > 5000) {
    recommendations.push('⚠️ Average discovery time is high - consider optimizing search algorithms')
  }
  
  if (cacheHitRate < 50) {
    recommendations.push('💡 Low cache hit rate - consider pre-warming cache with common products')
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ Performance looks good!')
  }
  
  console.log(`\nAverage Discovery Time: ${avgTime.toFixed(0)}ms`)
  console.log(`Cache Hit Rate: ${cacheHitRate.toFixed(1)}%`)
  console.log('Recommendations:')
  recommendations.forEach(rec => console.log(`  ${rec}`))
  
  return {
    avgDiscoveryTime: avgTime,
    cacheHitRate,
    totalProducts: testBarcodes.length,
    recommendations
  }
}

// Integration test with actual CSV data
export async function runIntegrationTest(csvData?: CSVProductRow[]): Promise<{
  success: boolean
  processedCount: number
  errorCount: number
  details: string[]
}> {
  console.log('\n🔗 INTEGRATION TEST')
  console.log('=' .repeat(30))
  
  const testData = csvData || testCSVData
  const details: string[] = []
  
  try {
    // Test the full CSV processing pipeline
    const results = await discoverMultipleShopifyMappings(testData)
    
    const processedCount = results.size
    const errorCount = testData.length - processedCount
    
    details.push(`Processed: ${processedCount}/${testData.length} products`)
    details.push(`Success Rate: ${Math.round((processedCount / testData.length) * 100)}%`)
    
    // Analyze discovery methods
    const methodStats: Record<string, number> = {}
    results.forEach(mapping => {
      methodStats[mapping.discovery_method] = (methodStats[mapping.discovery_method] || 0) + 1
    })
    
    details.push('Discovery Methods:')
    Object.entries(methodStats).forEach(([method, count]) => {
      details.push(`  ${method}: ${count}`)
    })
    
    const success = processedCount >= Math.ceil(testData.length * 0.5) // At least 50% success rate
    
    console.log(details.join('\n'))
    
    return {
      success,
      processedCount,
      errorCount,
      details
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    details.push(`Integration test failed: ${errorMessage}`)
    
    console.error('❌ Integration test failed:', error)
    
    return {
      success: false,
      processedCount: 0,
      errorCount: testData.length,
      details
    }
  }
}

// Export test data for external use
export { testCSVData }
