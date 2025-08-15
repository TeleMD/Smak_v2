import { useState, useEffect } from 'react'
import { 
  ArrowLeft, Package, Upload, BarChart3, 
  AlertTriangle, Truck, Activity, RefreshCw, Share2
} from 'lucide-react'
import { Store as StoreType, CurrentInventory, StockReceipt, InventoryMovement, ShopifyStockSyncResult } from '../types'
import { 
  getStore, getCurrentInventory, getStockReceipts, 
  getInventoryMovements, syncStoreToShopify
} from '../services/database'
import CSVUploadModal from '../components/CSVUploadModal'

interface ShopDetailProps {
  shopId: string
  onBack: () => void
}

export default function ShopDetail({ shopId, onBack }: ShopDetailProps) {
  const [store, setStore] = useState<StoreType | null>(null)
  const [inventory, setInventory] = useState<CurrentInventory[]>([])
  const [receipts, setReceipts] = useState<StockReceipt[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inventory' | 'receipts' | 'movements'>('inventory')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadType, setUploadType] = useState<'current_stock' | 'supplier_delivery'>('current_stock')
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<ShopifyStockSyncResult | null>(null)
  const [showSyncResult, setShowSyncResult] = useState(false)

  useEffect(() => {
    loadShopData()
  }, [shopId])

  const loadShopData = async () => {
    try {
      setLoading(true)
      const [storeData, inventoryData, receiptsData, movementsData] = await Promise.all([
        getStore(shopId),
        getCurrentInventory(shopId),
        getStockReceipts(shopId),
        getInventoryMovements(shopId, undefined, 20)
      ])

      setStore(storeData)
      setInventory(inventoryData)
      setReceipts(receiptsData)
      setMovements(movementsData)
    } catch (error) {
      console.error('Error loading shop data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUploadComplete = () => {
    setShowUploadModal(false)
    loadShopData() // Reload data after upload
  }

  const openUploadModal = (type: 'current_stock' | 'supplier_delivery') => {
    setUploadType(type)
    setShowUploadModal(true)
  }

  const handleSyncToShopify = async () => {
    if (!store) return
    
    setIsSyncing(true)
    setSyncResult(null)
    
    try {
      console.log('Starting Shopify sync for store:', store.name)
      const result = await syncStoreToShopify(store.id)
      setSyncResult(result)
      setShowSyncResult(true)
      console.log('Sync completed:', result)
    } catch (error) {
      console.error('Sync failed:', error)
      alert(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading shop details...</p>
        </div>
      </div>
    )
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">Shop not found</h3>
          <p className="mt-1 text-sm text-gray-500">The shop you're looking for doesn't exist.</p>
          <div className="mt-6">
            <button
              onClick={onBack}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Shops
            </button>
          </div>
        </div>
      </div>
    )
  }

  const stats = {
    totalProducts: inventory.length,
    totalValue: inventory.reduce((sum, item) => sum + (item.available_quantity * (item.product?.unit_price || 0)), 0),
    lowStockCount: inventory.filter(item => 
      item.product?.min_stock_level && item.available_quantity <= item.product.min_stock_level
    ).length,
    outOfStockCount: inventory.filter(item => item.available_quantity === 0).length
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={onBack}
              className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Shops
            </button>
            
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
                <p className="mt-1 text-sm text-gray-600">{store.address || 'No address'}</p>
                {store.manager_name && (
                  <p className="text-sm text-gray-600">Manager: {store.manager_name}</p>
                )}
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => openUploadModal('current_stock')}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Current Stock
                </button>
                <button
                  onClick={() => openUploadModal('supplier_delivery')}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
                >
                  <Truck className="h-4 w-4 mr-2" />
                  Upload Supplier Delivery
                </button>
                <button
                  onClick={handleSyncToShopify}
                  disabled={isSyncing || inventory.length === 0}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                    isSyncing || inventory.length === 0
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {isSyncing ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Share2 className="h-4 w-4 mr-2" />
                  )}
                  {isSyncing ? 'Syncing...' : '🚀 Direct Sync to Shopify'}
                </button>
                <button
                  onClick={async () => {
                    try {
                      console.log('🔍 DIAGNOSTIC: Testing missing product 4770237043687...')
                      
                      const { testSingleProductUpdate } = await import('../services/shopify')
                      const result = await testSingleProductUpdate('4770237043687')
                      
                      console.log('🔍 Diagnostic result:', result)
                      
                      if (result.success) {
                        if (result.found && result.updated) {
                          alert(`✅ SUCCESS! Product found and updated!\n\nDetails:\n- Found: ${result.found}\n- Updated: ${result.updated}\n- Products searched: ${result.details.totalProductsSearched}`)
                        } else if (result.found && !result.updated) {
                          alert(`⚠️ Product found but update failed:\n${JSON.stringify(result.details, null, 2)}`)
                        } else {
                          alert(`❌ Product NOT found after searching ${result.details.totalProductsSearched || 'unknown'} products`)
                        }
                      } else {
                        alert(`❌ Test failed: ${result.error}`)
                      }
                    } catch (error) {
                      console.error('❌ Test error:', error)
                      alert(`Test failed: ${error}`)
                    }
                  }}
                  className="ml-2 inline-flex items-center px-3 py-2 border border-orange-300 text-sm font-medium rounded-md text-orange-700 bg-orange-50 hover:bg-orange-100"
                >
                  🔍 Test Missing Product 4770237043687
                </button>
                <button
                  onClick={loadShopData}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Package className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Products</dt>
                      <dd className="text-lg font-semibold text-gray-900">{stats.totalProducts}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <BarChart3 className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Inventory Value</dt>
                      <dd className="text-lg font-semibold text-gray-900">${stats.totalValue.toLocaleString()}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-6 w-6 text-orange-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Low Stock</dt>
                      <dd className="text-lg font-semibold text-gray-900">{stats.lowStockCount}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Out of Stock</dt>
                      <dd className="text-lg font-semibold text-gray-900">{stats.outOfStockCount}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white shadow rounded-lg">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex">
                <button
                  onClick={() => setActiveTab('inventory')}
                  className={`py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'inventory'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Package className="h-4 w-4 mr-2 inline" />
                  Inventory ({inventory.length})
                </button>
                <button
                  onClick={() => setActiveTab('receipts')}
                  className={`py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'receipts'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Truck className="h-4 w-4 mr-2 inline" />
                  Stock Receipts ({receipts.length})
                </button>
                <button
                  onClick={() => setActiveTab('movements')}
                  className={`py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'movements'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Activity className="h-4 w-4 mr-2 inline" />
                  Recent Movements ({movements.length})
                </button>
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'inventory' && (
                <InventoryTab inventory={inventory} />
              )}
              {activeTab === 'receipts' && (
                <ReceiptsTab receipts={receipts} />
              )}
              {activeTab === 'movements' && (
                <MovementsTab movements={movements} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Shopify Sync Result Modal */}
      {showSyncResult && syncResult && (
        <ShopifySyncResultModal
          isOpen={showSyncResult}
          onClose={() => setShowSyncResult(false)}
          result={syncResult}
        />
      )}

      {/* CSV Upload Modal */}
      {showUploadModal && (
        <CSVUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          shopId={shopId}
          uploadType={uploadType}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </div>
  )
}

// Tab Components
function InventoryTab({ inventory }: { inventory: CurrentInventory[] }) {
  if (inventory.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No inventory items</h3>
        <p className="mt-1 text-sm text-gray-500">Upload a current stock CSV to get started.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU/Barcode</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {inventory.map((item) => (
            <tr key={item.id}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {item.product?.name || 'Unknown Product'}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{item.product?.sku}</div>
                <div className="text-sm text-gray-500">{item.product?.barcode}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{item.available_quantity}</div>
                {item.reserved_quantity > 0 && (
                  <div className="text-sm text-gray-500">({item.reserved_quantity} reserved)</div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${((item.available_quantity * (item.product?.unit_price || 0))).toFixed(2)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {item.available_quantity === 0 ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Out of Stock
                  </span>
                ) : item.product?.min_stock_level && item.available_quantity <= item.product.min_stock_level ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                    Low Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    In Stock
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReceiptsTab({ receipts }: { receipts: StockReceipt[] }) {
  if (receipts.length === 0) {
    return (
      <div className="text-center py-8">
        <Truck className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No stock receipts</h3>
        <p className="mt-1 text-sm text-gray-500">Upload a supplier delivery CSV to create receipts.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {receipts.map((receipt) => (
        <div key={receipt.id} className="border border-gray-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-lg font-medium text-gray-900">{receipt.supplier_name}</h4>
              <p className="text-sm text-gray-500">
                {new Date(receipt.receipt_date).toLocaleDateString()} • {receipt.total_items} items
              </p>
              {receipt.notes && (
                <p className="text-sm text-gray-600 mt-1">{receipt.notes}</p>
              )}
            </div>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              receipt.status === 'completed' ? 'bg-green-100 text-green-800' :
              receipt.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {receipt.status}
            </span>
          </div>
          {receipt.total_cost > 0 && (
            <div className="mt-2">
              <span className="text-sm font-medium text-gray-900">
                Total Cost: ${receipt.total_cost.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function MovementsTab({ movements }: { movements: InventoryMovement[] }) {
  if (movements.length === 0) {
    return (
      <div className="text-center py-8">
        <Activity className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No recent movements</h3>
        <p className="mt-1 text-sm text-gray-500">Inventory movements will appear here as they happen.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {movements.map((movement) => (
        <div key={movement.id} className="flex items-center justify-between py-3 border-b border-gray-100">
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-3 ${
              movement.quantity_change > 0 ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {movement.product?.name || 'Unknown Product'}
              </p>
              <p className="text-sm text-gray-500">
                {movement.movement_type.replace('_', ' ')} • {new Date(movement.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-sm font-medium ${
              movement.quantity_change > 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {movement.quantity_change > 0 ? '+' : ''}{movement.quantity_change}
            </span>
            <p className="text-xs text-gray-500">
              {movement.previous_quantity} → {movement.new_quantity}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// Shopify Sync Result Modal Component
function ShopifySyncResultModal({ 
  isOpen, 
  onClose, 
  result 
}: { 
  isOpen: boolean
  onClose: () => void
  result: ShopifyStockSyncResult 
}) {
  if (!isOpen) return null

  const successPercentage = result.total_products > 0 
    ? Math.round((result.successful_updates / result.total_products) * 100)
    : 0

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Shopify Sync Results
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Summary */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{result.total_products}</div>
                <div className="text-sm text-gray-600">Total Products</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{result.successful_updates}</div>
                <div className="text-sm text-gray-600">Updated</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{result.failed_updates}</div>
                <div className="text-sm text-gray-600">Failed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{result.skipped_products}</div>
                <div className="text-sm text-gray-600">Skipped</div>
              </div>
            </div>
            
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Success Rate</span>
                <span>{successPercentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ width: `${successPercentage}%` }}
                ></div>
              </div>
            </div>

            {result.shopify_location_name && (
              <div className="mt-4 text-sm text-gray-600">
                <span className="font-medium">Shopify Location:</span> {result.shopify_location_name}
              </div>
            )}

            <div className="mt-2 text-sm text-gray-600">
              <span className="font-medium">Processing Time:</span> {(result.processing_time_ms / 1000).toFixed(1)}s
            </div>
          </div>

          {/* Error Message */}
          {result.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="text-sm text-red-700">
                <strong>Error:</strong> {result.error}
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Barcode
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Message
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {result.results.map((item, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.barcode}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        item.status === 'success' ? 'bg-green-100 text-green-800' :
                        item.status === 'error' ? 'bg-red-100 text-red-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {item.message}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {item.total_before !== undefined && item.total_after !== undefined ? (
                        <span>
                          {item.total_before} → {item.total_after}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Close Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}