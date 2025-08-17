import { useState, useEffect } from 'react'
import { Store, Package, BarChart3, ChevronRight, Plus, Search } from 'lucide-react'
import { Store as StoreType } from '../types'
import { getStores, getCurrentInventory } from '../services/database'

interface ShopManagementProps {
  onSelectShop: (shopId: string) => void
}

export default function ShopManagement({ onSelectShop }: ShopManagementProps) {
  const [stores, setStores] = useState<StoreType[]>([])
  const [storeStats, setStoreStats] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')


  useEffect(() => {
    loadStoresData()
  }, [])

  const loadStoresData = async () => {
    try {
      setLoading(true)
      const storesList = await getStores()
      setStores(storesList)
      
      // Load stats for each store
      const stats: Record<string, any> = {}
      await Promise.all(
        storesList.map(async (store) => {
          try {
            const inventory = await getCurrentInventory(store.id)
            
            // Debug logging
            console.log(`🔍 DEBUGGING STORE ${store.name} INVENTORY:`)
            console.log('- Total inventory records:', inventory.length)
            console.log('- First few product_ids:', inventory.slice(0, 5).map(item => item.product_id))
            
            const uniqueProductIds = new Set(inventory.map(item => item.product_id))
            console.log('- Unique product count:', uniqueProductIds.size)
            
            const totalProducts = uniqueProductIds.size
            const totalValue = inventory.reduce((sum, item) => {
              return sum + (item.available_quantity * (item.product?.unit_price || 0))
            }, 0)
            const lowStockCount = inventory.filter(item => 
              item.product?.min_stock_level && 
              item.available_quantity <= item.product.min_stock_level
            ).length
            const outOfStockCount = inventory.filter(item => item.available_quantity === 0).length

            stats[store.id] = {
              totalProducts,
              totalValue,
              lowStockCount,
              outOfStockCount
            }
          } catch (error) {
            console.error(`Error loading stats for store ${store.id}:`, error)
            stats[store.id] = {
              totalProducts: 0,
              totalValue: 0,
              lowStockCount: 0,
              outOfStockCount: 0
            }
          }
        })
      )
      setStoreStats(stats)
    } catch (error) {
      console.error('Error loading stores:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredStores = stores.filter(store =>
    store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (store.address && store.address.toLowerCase().includes(searchTerm.toLowerCase()))
  )



  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading shops...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Shop Management</h1>
                <p className="mt-1 text-sm text-gray-600">
                  Manage inventory and operations for your offline shops
                </p>
              </div>
              <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                <Plus className="h-4 w-4 mr-2" />
                Add New Shop
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search shops..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
            </div>
          </div>

          {/* Shops Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStores.map((store) => {
              const stats = storeStats[store.id] || {
                totalProducts: 0,
                totalValue: 0,
                lowStockCount: 0,
                outOfStockCount: 0
              }

              return (
                <div
                  key={store.id}
                  className="bg-white overflow-hidden shadow rounded-lg cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onSelectShop(store.id)}
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <Store className="h-8 w-8 text-primary-600" />
                        </div>
                        <div className="ml-4 flex-1">
                          <h3 className="text-lg font-medium text-gray-900">{store.name}</h3>
                          <p className="text-sm text-gray-500">{store.address || 'No address'}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <div className="flex items-center justify-center">
                          <Package className="h-4 w-4 text-blue-500 mr-1" />
                          <span className="text-2xl font-bold text-gray-900">{stats.totalProducts}</span>
                        </div>
                        <p className="text-xs text-gray-500">Products</p>
                      </div>
                      
                      <div className="text-center">
                        <div className="flex items-center justify-center">
                          <BarChart3 className="h-4 w-4 text-green-500 mr-1" />
                          <span className="text-2xl font-bold text-gray-900">
                            ${stats.totalValue.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">Value</p>
                      </div>
                    </div>

                    {/* Status indicators and sync button */}
                    <div className="mt-4 flex justify-between items-center text-sm">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          <div className={`w-2 h-2 rounded-full mr-2 ${
                            store.is_active ? 'bg-green-400' : 'bg-red-400'
                          }`}></div>
                          <span className={store.is_active ? 'text-green-600' : 'text-red-600'}>
                            {store.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        
                        {stats.lowStockCount > 0 && (
                          <span className="text-orange-600">
                            {stats.lowStockCount} low stock
                          </span>
                        )}
                        
                        {stats.outOfStockCount > 0 && (
                          <span className="text-red-600">
                            {stats.outOfStockCount} out of stock
                          </span>
                        )}
                      </div>
                      

                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredStores.length === 0 && (
            <div className="text-center py-12">
              <Store className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No shops found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm ? 'Try adjusting your search terms.' : 'Get started by adding your first shop.'}
              </p>
              <div className="mt-6">
                <button className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Shop
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}