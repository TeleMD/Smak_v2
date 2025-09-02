#!/usr/bin/env node

/**
 * Test Script for Enhanced Shopify Sync
 * 
 * This script helps test the new dynamic mapping system
 * Run this in browser console or via Node.js
 */

console.log('🚀 Enhanced Shopify Sync Test Script');
console.log('=====================================');

// Test functions that can be run in browser console
const testFunctions = {
  
  // Check if system is ready for enhanced sync
  async checkStatus() {
    console.log('📊 Checking migration status...');
    try {
      const { checkMigrationStatus } = await import('./frontend/src/services/syncMigrationTool');
      const status = await checkMigrationStatus();
      
      console.log('✅ Status check complete:');
      console.log(`   📦 Total products: ${status.stats.totalProducts}`);
      console.log(`   ✅ With Shopify IDs: ${status.stats.withShopifyIds}`);
      console.log(`   ❌ Without Shopify IDs: ${status.stats.withoutShopifyIds}`);
      console.log(`   📈 Percentage mapped: ${status.stats.percentageMapped}%`);
      console.log(`   🎯 Ready: ${status.isReady ? 'YES' : 'NO'}`);
      console.log(`   💬 Message: ${status.message}`);
      
      if (status.recommendations.length > 0) {
        console.log('📋 Recommendations:');
        status.recommendations.forEach(rec => console.log(`   ${rec}`));
      }
      
      return status;
    } catch (error) {
      console.error('❌ Status check failed:', error);
      return null;
    }
  },

  // Run full migration process
  async runMigration() {
    console.log('🔄 Running full migration...');
    try {
      const { performFullMigration } = await import('./frontend/src/services/syncMigrationTool');
      const result = await performFullMigration();
      
      console.log('✅ Migration complete:');
      console.log(`   🎯 Success: ${result.success}`);
      console.log(`   💬 Message: ${result.message}`);
      
      console.log('📋 Migration steps:');
      result.steps.forEach((step, index) => {
        const status = step.status === 'success' ? '✅' : step.status === 'error' ? '❌' : '⚠️';
        console.log(`   ${index + 1}. ${status} ${step.step}: ${step.message}`);
      });
      
      return result;
    } catch (error) {
      console.error('❌ Migration failed:', error);
      return null;
    }
  },

  // Test specific barcodes
  async testBarcodes(barcodes = ['4770175046139', '4770237043687', '4840022010436']) {
    console.log(`🧪 Testing ${barcodes.length} barcodes...`);
    try {
      const { testEnhancedSync } = await import('./frontend/src/services/syncMigrationTool');
      const result = await testEnhancedSync(barcodes);
      
      console.log('✅ Test complete:');
      console.log(`   🎯 Success: ${result.success}`);
      console.log(`   💬 Message: ${result.message}`);
      
      console.log('📋 Test results:');
      result.results.forEach(r => {
        const status = r.found ? '✅' : '❌';
        console.log(`   ${status} ${r.barcode}: ${r.found ? `Found via ${r.source} (${r.searchTimeMs}ms)` : 'Not found'}`);
        if (r.shopifyProductId) {
          console.log(`      → Shopify Product ID: ${r.shopifyProductId}`);
        }
      });
      
      return result;
    } catch (error) {
      console.error('❌ Test failed:', error);
      return null;
    }
  },

  // Test with problematic barcodes from CSV
  async testProblematicBarcodes() {
    const problematicBarcodes = [
      '4840022010436', // Pitted cherry jam, 680g
      '4036117010034', // Dumplings with potatoes "Varniki", 450g  
      '4607012353382', // White sunflower seeds, salted, 250g
      '4038745602612', // Natakhtari estragon 0.5L (may not exist)
    ];
    
    console.log('🎯 Testing problematic barcodes from previous failures...');
    return await this.testBarcodes(problematicBarcodes);
  },

  // Full system test
  async fullTest() {
    console.log('🚀 Running full system test...');
    console.log('===============================');
    
    // Step 1: Check status
    console.log('\n📊 Step 1: Checking system status...');
    const status = await this.checkStatus();
    if (!status) return false;
    
    // Step 2: Run migration if needed
    if (!status.isReady || status.stats.percentageMapped < 50) {
      console.log('\n🔄 Step 2: Running migration...');
      const migration = await this.runMigration();
      if (!migration?.success) return false;
    } else {
      console.log('\n✅ Step 2: Migration not needed, system ready');
    }
    
    // Step 3: Test known barcodes
    console.log('\n🧪 Step 3: Testing known barcodes...');
    const knownTest = await this.testBarcodes();
    
    // Step 4: Test problematic barcodes  
    console.log('\n🎯 Step 4: Testing problematic barcodes...');
    const problematicTest = await this.testProblematicBarcodes();
    
    // Step 5: Final status check
    console.log('\n📊 Step 5: Final status check...');
    const finalStatus = await this.checkStatus();
    
    // Summary
    console.log('\n🎉 FULL TEST SUMMARY');
    console.log('=====================');
    console.log(`✅ System ready: ${finalStatus?.isReady ? 'YES' : 'NO'}`);
    console.log(`📈 Mapping coverage: ${finalStatus?.stats.percentageMapped || 0}%`);
    console.log(`🧪 Known barcodes test: ${knownTest?.success ? 'PASSED' : 'FAILED'}`);
    console.log(`🎯 Problematic barcodes test: ${problematicTest?.success ? 'PASSED' : 'FAILED'}`);
    
    const overallSuccess = finalStatus?.isReady && knownTest?.success && problematicTest?.success;
    console.log(`🎯 Overall result: ${overallSuccess ? '✅ SUCCESS' : '❌ NEEDS ATTENTION'}`);
    
    if (overallSuccess) {
      console.log('\n🎉 Enhanced Shopify Sync is ready to use!');
      console.log('   - Upload your CSV file');
      console.log('   - Run Shopify sync');
      console.log('   - Enjoy improved success rates!');
    } else {
      console.log('\n⚠️ System needs attention before use.');
      console.log('   - Check error messages above');
      console.log('   - Fix issues and re-run test');
    }
    
    return overallSuccess;
  }
};

// Instructions for browser console use
console.log('\n📋 USAGE INSTRUCTIONS');
console.log('=====================');
console.log('Copy and paste these commands in your browser console:');
console.log('');
console.log('// Check system status:');
console.log('await checkMigrationStatus()');
console.log('');
console.log('// Run migration:'); 
console.log('await performFullMigration()');
console.log('');
console.log('// Test specific barcodes:');
console.log('await testEnhancedSync(["4770175046139", "4840022010436"])');
console.log('');
console.log('// Full system test:');
console.log('// (Run all the above functions)');
console.log('');

// Make functions available globally if in browser
if (typeof window !== 'undefined') {
  window.testEnhancedSyncSystem = testFunctions;
  console.log('✅ Test functions available as: window.testEnhancedSyncSystem');
  console.log('   Example: await window.testEnhancedSyncSystem.fullTest()');
}

// Export for Node.js use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = testFunctions;
}

console.log('\n🚀 Ready to test Enhanced Shopify Sync!');
