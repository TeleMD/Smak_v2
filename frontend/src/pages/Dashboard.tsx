import { useState, useEffect } from 'react'
import { 
  Store, Warehouse, Package, AlertTriangle, TrendingUp, 
  Truck, BarChart3, Activity 
} from 'lucide-react'
import { Store as StoreType, DashboardStats, CurrentInventory, StockReceipt, InventoryMovement } from '../types'
import { getDashboardStats, getStores, getCurrentInventory, getStockReceipts, getInventoryMovements } from '../services/database'

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [stores, setStores] = useState<StoreType[]>([])
  const [recentMovements, setRecentMovements] = useState<InventoryMovement[]>([])
  const [pendingReceipts, setPendingReceipts] = useState<StockReceipt[]>([])
  const [lowStockItems, setLowStockItems] = useState<CurrentInventory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      const [
        dashboardStats,
        storesList,
        movements,
        receipts,
        inventory
      ] = await Promise.all([
        getDashboardStats(),
        getStores(),
        getInventoryMovements(undefined, undefined, 10),
        getStockReceipts(),
        getCurrentInventory()
      ])

      setStats(dashboardStats)
      setStores(storesList)
      setRecentMovements(movements)
      setPendingReceipts(receipts.filter(r => r.status === 'pending'))
      setLowStockItems(inventory.filter(i => 
        i.product?.min_stock_level && i.available_quantity <= i.product.min_stock_level
      ))
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-pulse mx-auto text-primary-600" />
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color, 
    change 
  }: { 
    title: string
    value: string | number
    icon: any
    color: string
    change?: string 
  }) => (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Icon className={`h-6 w-6 ${color}`} />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-lg font-semibold text-gray-900">{value}</dd>
              {change && (
                <dd className="text-sm text-gray-600">{change}</dd>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">
              Real-time overview of your multi-location inventory
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <StatCard
              title="Total Stores"
              value={stats?.totalStores || 0}
              icon={Store}
              color="text-blue-600"
            />
            <StatCard
              title="Total Products"
              value={stats?.totalProducts || 0}
              icon={Package}
              color="text-green-600"
            />
            <StatCard
              title="Inventory Value"
              value={`$${(stats?.totalInventoryValue || 0).toLocaleString()}`}
              icon={TrendingUp}
              color="text-purple-600"
            />
            <StatCard
              title="Low Stock Items"
              value={lowStockItems.length}
              icon={AlertTriangle}
              color="text-red-600"
            />
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Inventory Movements */}
            <div className="bg-white shadow rounded-lg">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Recent Movements</h3>
                  <Activity className="h-5 w-5 text-gray-400" />
                </div>
                <div className="space-y-3">
                  {recentMovements.slice(0, 5).map((movement) => (
                    <div key={movement.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {movement.product?.name || 'Unknown Product'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {movement.store?.name || 'Unknown Store'} • {movement.movement_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${
                          movement.quantity_change > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {movement.quantity_change > 0 ? '+' : ''}{movement.quantity_change}
                        </span>
                        <p className="text-xs text-gray-500">
                          {new Date(movement.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {recentMovements.length === 0 && (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">No recent movements</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Low Stock Alerts */}
            <div className="bg-white shadow rounded-lg">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Low Stock Alerts</h3>
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div className="space-y-3">
                  {lowStockItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.product?.name || 'Unknown Product'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.store?.name || 'Unknown Store'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-red-600">
                          {item.available_quantity} left
                        </span>
                        <p className="text-xs text-gray-500">
                          Min: {item.product?.min_stock_level || 0}
                        </p>
                      </div>
                    </div>
                  ))}
                  {lowStockItems.length === 0 && (
                    <div className="text-center py-4">
                      <p className="text-sm text-green-600">All stock levels are healthy!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pending Stock Receipts */}
            <div className="bg-white shadow rounded-lg">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Pending Receipts</h3>
                  <Truck className="h-5 w-5 text-orange-500" />
                </div>
                <div className="space-y-3">
                  {pendingReceipts.slice(0, 5).map((receipt) => (
                    <div key={receipt.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {receipt.supplier_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {receipt.store?.name || 'Unknown Store'} • {receipt.total_items} items
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-orange-600">
                          Pending
                        </span>
                        <p className="text-xs text-gray-500">
                          {new Date(receipt.receipt_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {pendingReceipts.length === 0 && (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">No pending receipts</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Store Overview */}
            <div className="bg-white shadow rounded-lg">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Store Overview</h3>
                  <Warehouse className="h-5 w-5 text-blue-500" />
                </div>
                <div className="space-y-3">
                  {stores.map((store) => (
                    <div key={store.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{store.name}</p>
                        <p className="text-xs text-gray-500">{store.address || 'No address'}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          store.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {store.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {stores.length === 0 && (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">No stores configured</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-8 bg-white shadow rounded-lg">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                  <Package className="h-4 w-4 mr-2" />
                  Add Product
                </button>
                <button className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                  <Store className="h-4 w-4 mr-2" />
                  Add Store
                </button>
                <button className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                  <Truck className="h-4 w-4 mr-2" />
                  New Receipt
                </button>
                <button className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Reports
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 