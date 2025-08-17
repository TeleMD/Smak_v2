import { useState, useEffect } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { Supplier } from '../types'
import { getSuppliers, createSupplier } from '../services/database'

interface SupplierSelectorProps {
  selectedSupplierId?: string
  onSupplierSelect: (supplier: Supplier | null) => void
  allowCreate?: boolean
  className?: string
}

export default function SupplierSelector({ 
  selectedSupplierId, 
  onSupplierSelect, 
  allowCreate = true,
  className = ""
}: SupplierSelectorProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId)

  useEffect(() => {
    loadSuppliers()
  }, [])

  const loadSuppliers = async () => {
    try {
      setLoading(true)
      const data = await getSuppliers()
      setSuppliers(data)
    } catch (error) {
      console.error('Error loading suppliers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) return

    try {
      const newSupplier = await createSupplier({
        name: newSupplierName.trim(),
        code: newSupplierName.trim().toUpperCase().replace(/\s+/g, '_'),
        barcode_columns: ['barcode', 'sku', 'code', 'EANNummer'],
        name_columns: ['name', 'product_name', 'title', 'Bezeichnung1'],
        quantity_columns: ['quantity', 'qty', 'stock', 'Menge'],
        price_columns: ['price', 'unit_price', 'cost', 'Einzelpreis'],
        category_columns: ['category', 'type', 'group'],
        is_active: true
      })

      setSuppliers(prev => [...prev, newSupplier])
      onSupplierSelect(newSupplier)
      setNewSupplierName('')
      setIsCreating(false)
      setIsOpen(false)
    } catch (error) {
      console.error('Error creating supplier:', error)
      alert('Failed to create supplier. Please try again.')
    }
  }

  const handleSupplierSelect = (supplier: Supplier | null) => {
    onSupplierSelect(supplier)
    setIsOpen(false)
  }

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-10 bg-gray-200 rounded-md"></div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {/* Supplier Selection Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-full bg-white border border-gray-300 rounded-md pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
      >
        <span className="block truncate">
          {selectedSupplier ? selectedSupplier.name : 'Select a supplier...'}
        </span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <ChevronDown className="h-5 w-5 text-gray-400" />
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {/* Clear Selection Option */}
          <div
            onClick={() => handleSupplierSelect(null)}
            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100"
          >
            <span className="block truncate text-gray-500 italic">No supplier selected</span>
          </div>

          {/* Existing Suppliers */}
          {suppliers.map((supplier) => (
            <div
              key={supplier.id}
              onClick={() => handleSupplierSelect(supplier)}
              className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 ${
                selectedSupplierId === supplier.id ? 'bg-primary-50 text-primary-600' : ''
              }`}
            >
              <div>
                <span className="block truncate font-medium">{supplier.name}</span>
                {supplier.code && (
                  <span className="block truncate text-sm text-gray-500">{supplier.code}</span>
                )}
              </div>
            </div>
          ))}

          {/* Create New Supplier Option */}
          {allowCreate && (
            <>
              <div className="border-t border-gray-200 my-1"></div>
              {!isCreating ? (
                <div
                  onClick={() => setIsCreating(true)}
                  className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 text-primary-600"
                >
                  <div className="flex items-center">
                    <Plus className="h-4 w-4 mr-2" />
                    <span className="block truncate">Create new supplier</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 border-t border-gray-200">
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Supplier name"
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateSupplier()
                        } else if (e.key === 'Escape') {
                          setIsCreating(false)
                          setNewSupplierName('')
                        }
                      }}
                      className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                      autoFocus
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={handleCreateSupplier}
                        disabled={!newSupplierName.trim()}
                        className="flex-1 bg-primary-600 text-white px-3 py-1 rounded text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setIsCreating(false)
                          setNewSupplierName('')
                        }}
                        className="flex-1 bg-gray-200 text-gray-800 px-3 py-1 rounded text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Overlay to close dropdown when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setIsOpen(false)
            setIsCreating(false)
            setNewSupplierName('')
          }}
        />
      )}
    </div>
  )
}
