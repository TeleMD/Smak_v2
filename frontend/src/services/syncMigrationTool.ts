import { 
  initializeEnhancedSync, 
  diagnoseEnhancedSync 
} from './enhancedShopifySync'
import { 
  getShopifyMappingStats, 
  clearAllShopifyMappings 
} from './dynamicShopifyMapping'

// =====================================================
// SYNC MIGRATION TOOL
// =====================================================
// Utility functions to help migrate from hardcoded to dynamic sync

export interface MigrationStatus {
  isReady: boolean
  message: string
  stats: {
    totalProducts: number
    withShopifyIds: number
    withoutShopifyIds: number
    percentageMapped: number
  }
  recommendations: string[]
}

/**
 * Check if the system is ready for enhanced sync
 */
export async function checkMigrationStatus(): Promise<MigrationStatus> {
  console.log(`🔍 Checking migration status...`)
  
  try {
    const stats = await getShopifyMappingStats()
    const recommendations: string[] = []
    
    console.log(`📊 Current system state:`)
    console.log(`   📦 Total products: ${stats.totalProducts}`)
    console.log(`   ✅ With Shopify IDs: ${stats.withShopifyIds}`)
    console.log(`   ❌ Without Shopify IDs: ${stats.withoutShopifyIds}`)
    console.log(`   📈 Percentage mapped: ${stats.percentageMapped}%`)
    
    let isReady = false
    let message = ''
    
    if (stats.totalProducts === 0) {
      message = 'No products found in database. Upload CSV first.'
      recommendations.push('📤 Upload a CSV file to create products in the database')
      recommendations.push('🔄 Then run migration to populate Shopify mappings')
    } else if (stats.percentageMapped === 0) {
      message = 'No Shopify mappings found. Migration needed.'
      recommendations.push('🔄 Run migration to populate Shopify mappings from hardcoded list')
      recommendations.push('🔍 Then run discovery for remaining products')
    } else if (stats.percentageMapped < 50) {
      message = `Only ${stats.percentageMapped}% mapped. Partial migration detected.`
      recommendations.push('🔄 Complete migration to populate remaining mappings')
      recommendations.push('🔍 Run discovery for products not in hardcoded list')
    } else if (stats.percentageMapped < 100) {
      message = `${stats.percentageMapped}% mapped. System mostly ready.`
      recommendations.push('🔍 Run discovery for remaining unmapped products')
      recommendations.push('✅ Enhanced sync should work well for most products')
      isReady = true
    } else {
      message = 'All products have Shopify mappings. System fully ready!'
      recommendations.push('✅ Enhanced sync is ready to use')
      recommendations.push('🚀 No hardcoded mappings needed anymore')
      isReady = true
    }
    
    return {
      isReady,
      message,
      stats,
      recommendations
    }
    
  } catch (error) {
    console.error('❌ Error checking migration status:', error)
    
    return {
      isReady: false,
      message: 'Error checking system status',
      stats: {
        totalProducts: 0,
        withShopifyIds: 0,
        withoutShopifyIds: 0,
        percentageMapped: 0
      },
      recommendations: ['❌ Fix database connection issues']
    }
  }
}

/**
 * Perform complete migration from hardcoded to dynamic system
 */
export async function performFullMigration(): Promise<{
  success: boolean
  message: string
  steps: Array<{
    step: string
    status: 'success' | 'error' | 'skipped'
    message: string
    details?: any
  }>
}> {
  console.log(`🚀 Performing full migration to enhanced sync system...`)
  
  const steps: Array<{
    step: string
    status: 'success' | 'error' | 'skipped'
    message: string
    details?: any
  }> = []
  
  try {
    // Step 1: Check initial status
    console.log(`📊 Step 1: Checking initial status...`)
    const initialStatus = await checkMigrationStatus()
    steps.push({
      step: 'Initial Status Check',
      status: 'success',
      message: `Found ${initialStatus.stats.totalProducts} products, ${initialStatus.stats.percentageMapped}% mapped`,
      details: initialStatus.stats
    })
    
    // Step 2: Initialize enhanced sync (includes migration)
    console.log(`🔄 Step 2: Initializing enhanced sync system...`)
    const initResult = await initializeEnhancedSync()
    
    if (initResult.success) {
      steps.push({
        step: 'Enhanced Sync Initialization',
        status: 'success',
        message: initResult.message,
        details: {
          stats: initResult.stats,
          migration: initResult.migration
        }
      })
    } else {
      steps.push({
        step: 'Enhanced Sync Initialization',
        status: 'error',
        message: initResult.message
      })
      
      return {
        success: false,
        message: 'Migration failed during initialization',
        steps
      }
    }
    
    // Step 3: Run diagnostic test
    console.log(`🔬 Step 3: Running diagnostic test...`)
    const diagnosticResult = await diagnoseEnhancedSync()
    
    if (diagnosticResult.success) {
      steps.push({
        step: 'Diagnostic Test',
        status: 'success',
        message: diagnosticResult.message,
        details: diagnosticResult.mappingResults
      })
    } else {
      steps.push({
        step: 'Diagnostic Test',
        status: 'error',
        message: diagnosticResult.message || 'Diagnostic failed',
        details: diagnosticResult.error
      })
    }
    
    // Step 4: Final status check
    console.log(`📊 Step 4: Final status check...`)
    const finalStatus = await checkMigrationStatus()
    steps.push({
      step: 'Final Status Check',
      status: 'success',
      message: finalStatus.message,
      details: finalStatus.stats
    })
    
    const improvementPercent = finalStatus.stats.percentageMapped - initialStatus.stats.percentageMapped
    
    console.log(`✅ Migration complete!`)
    console.log(`   📈 Improvement: +${improvementPercent}% mapped`)
    console.log(`   📊 Final state: ${finalStatus.stats.percentageMapped}% mapped`)
    
    return {
      success: true,
      message: `Migration successful! Improved mapping coverage by ${improvementPercent}% to ${finalStatus.stats.percentageMapped}%`,
      steps
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    
    steps.push({
      step: 'Migration Error',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
    
    return {
      success: false,
      message: 'Migration failed with error',
      steps
    }
  }
}

/**
 * Test the enhanced sync system with sample data
 */
export async function testEnhancedSync(testBarcodes?: string[]): Promise<{
  success: boolean
  message: string
  results: Array<{
    barcode: string
    found: boolean
    source?: string
    shopifyProductId?: string
    searchTimeMs?: number
  }>
}> {
  const defaultTestBarcodes = [
    '4770175046139', // Should be in hardcoded list
    '4770237043687', // Should be in hardcoded list  
    '4840022010436', // Recently discovered
    '4036117010034', // Recently discovered
    '4607012353382', // Recently discovered
    '9999999999999'  // Should not exist (negative test)
  ]
  
  const barcodes = testBarcodes || defaultTestBarcodes
  
  console.log(`🧪 Testing enhanced sync with ${barcodes.length} barcodes...`)
  
  try {
    const diagnosticResult = await diagnoseEnhancedSync(barcodes)
    
    if (diagnosticResult.success && diagnosticResult.mappingResults) {
      return {
        success: true,
        message: diagnosticResult.message,
        results: diagnosticResult.mappingResults
      }
    } else {
      return {
        success: false,
        message: diagnosticResult.message || 'Test failed',
        results: []
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Test failed',
      results: []
    }
  }
}

/**
 * Emergency reset function (for testing/debugging)
 */
export async function resetShopifyMappings(): Promise<{
  success: boolean
  message: string
  cleared: number
}> {
  console.log(`🧹 Resetting all Shopify mappings (for testing)...`)
  
  try {
    const result = await clearAllShopifyMappings()
    
    if (result.error) {
      return {
        success: false,
        message: result.error,
        cleared: 0
      }
    }
    
    console.log(`✅ Reset complete: cleared ${result.cleared} mappings`)
    
    return {
      success: true,
      message: `Successfully cleared ${result.cleared} Shopify mappings`,
      cleared: result.cleared
    }
    
  } catch (error) {
    console.error('❌ Reset failed:', error)
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Reset failed',
      cleared: 0
    }
  }
}

// =====================================================
// UTILITY FUNCTIONS FOR CONSOLE ACCESS
// =====================================================

// Make these functions available globally for console testing
if (typeof window !== 'undefined') {
  (window as any).checkMigrationStatus = checkMigrationStatus;
  (window as any).performFullMigration = performFullMigration;
  (window as any).testEnhancedSync = testEnhancedSync;
  (window as any).resetShopifyMappings = resetShopifyMappings;
}
