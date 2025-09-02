import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Load enhanced sync migration tools globally for console access
import { 
  checkMigrationStatus, 
  performFullMigration, 
  testEnhancedSync 
} from './services/syncMigrationTool'

// Make functions available globally for browser console
if (typeof window !== 'undefined') {
  (window as any).checkMigrationStatus = checkMigrationStatus;
  (window as any).performFullMigration = performFullMigration;
  (window as any).testEnhancedSync = testEnhancedSync;
  
  console.log('🚀 Enhanced Shopify Sync migration tools loaded');
  console.log('Available functions: checkMigrationStatus, performFullMigration, testEnhancedSync');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
) 