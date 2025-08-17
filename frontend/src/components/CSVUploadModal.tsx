import { useState, useRef } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle, Loader, Download } from 'lucide-react'
import { parseCSV } from '../utils/csvUtils'
import { uploadCurrentStock, uploadSupplierDelivery, exportNewProducts } from '../services/database'
import { Supplier } from '../types'
import SupplierSelector from './SupplierSelector'

interface CSVUploadModalProps {
  isOpen: boolean
  onClose: () => void
  shopId: string
  uploadType: 'current_stock' | 'supplier_delivery'
  onUploadComplete: () => void
}



export default function CSVUploadModal({ 
  isOpen, 
  onClose, 
  shopId, 
  uploadType, 
  onUploadComplete 
}: CSVUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [isExportingNewProducts, setIsExportingNewProducts] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    setUploadResult(null)
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    try {
      const csvData = await parseCSV(file)
      
      let result
      if (uploadType === 'current_stock') {
        result = await uploadCurrentStock(shopId, csvData)
      } else {
        if (!selectedSupplier) {
          throw new Error('Please select a supplier for delivery uploads')
        }
        result = await uploadSupplierDelivery(shopId, csvData, selectedSupplier.name, selectedSupplier.id)
      }

      setUploadResult(result)
      onUploadComplete()
    } catch (error) {
      setUploadResult({
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      })
    } finally {
      setUploading(false)
    }
  }

  const resetModal = () => {
    setFile(null)
    setUploadResult(null)
    setSelectedSupplier(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleExportNewProducts = async () => {
    try {
      setIsExportingNewProducts(true)
      const newProducts = await exportNewProducts(selectedSupplier?.id)
      
      if (newProducts.length === 0) {
        alert('No new products to export.')
        return
      }

      // Create CSV content
      const csvHeader = 'Barcode,Product Name,Supplier,Detected At\n'
      const csvRows = newProducts.map(p => 
        `"${p.barcode}","${p.name}","${p.supplier_name}","${p.detected_at}"`
      ).join('\n')
      const csvContent = csvHeader + csvRows

      // Download CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `new-products-${selectedSupplier?.name || 'all'}-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      alert(`Exported ${newProducts.length} new products to CSV file.`)
    } catch (error) {
      console.error('Error exporting new products:', error)
      alert('Failed to export new products. Please try again.')
    } finally {
      setIsExportingNewProducts(false)
    }
  }

  const handleClose = () => {
    resetModal()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Upload {uploadType === 'current_stock' ? 'Current Stock' : 'Supplier Delivery'} CSV
              </h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {!uploadResult ? (
              <>
                {/* Upload Type Description */}
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">
                    {uploadType === 'current_stock' ? 'Current Stock Upload' : 'Supplier Delivery Upload'}
                  </h4>
                  <p className="text-sm text-blue-700">
                    {uploadType === 'current_stock' 
                      ? 'Update current inventory levels for this shop. Products will be matched by barcode/SKU.'
                      : 'Process a new supplier delivery. This will create a stock receipt and update inventory levels.'
                    }
                  </p>
                  <div className="mt-2 text-xs text-blue-600">
                    <strong>Required columns:</strong> Barcode/SKU, Quantity
                    {uploadType === 'supplier_delivery' && ', Unit Cost (optional)'}
                  </div>
                </div>

                {/* Supplier Selection for Delivery */}
                {uploadType === 'supplier_delivery' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Supplier *
                    </label>
                    <SupplierSelector
                      selectedSupplierId={selectedSupplier?.id}
                      onSupplierSelect={setSelectedSupplier}
                      allowCreate={true}
                      className="w-full"
                    />
                    {selectedSupplier && (
                      <p className="mt-1 text-xs text-gray-500">
                        Using column mappings: {selectedSupplier.barcode_columns.join(', ')} for barcodes
                      </p>
                    )}
                  </div>
                )}

                {/* File Upload */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select CSV File
                  </label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-gray-400 transition-colors">
                    <div className="space-y-1 text-center">
                      <FileText className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-600">
                        <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500">
                          <span>Upload a file</span>
                          <input
                            ref={fileInputRef}
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            accept=".csv"
                            className="sr-only"
                            onChange={(e) => {
                              const selectedFile = e.target.files?.[0]
                              if (selectedFile) handleFileSelect(selectedFile)
                            }}
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">CSV files only</p>
                    </div>
                  </div>
                </div>

                {/* Selected File Display */}
                {file && (
                  <div className="mb-6">
                    <div className="flex items-center p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                      <span className="text-sm text-green-700">Selected File: {file.name}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Upload Results */
              <div className="mb-6">
                {uploadResult.success ? (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center mb-3">
                      <CheckCircle className="h-6 w-6 text-green-500 mr-2" />
                      <h4 className="text-lg font-medium text-green-800">Upload Successful!</h4>
                    </div>
                    {uploadResult.summary && (
                      <div className="text-sm text-green-700 space-y-1">
                        <p>• Total products processed: {uploadResult.summary.totalProducts}</p>
                        <p>• Successful updates: {uploadResult.summary.successfulUpdates}</p>
                        {uploadResult.summary.newProducts > 0 && (
                          <p>• New products created: {uploadResult.summary.newProducts}</p>
                        )}
                        {uploadResult.summary.errors > 0 && (
                          <p>• Errors: {uploadResult.summary.errors}</p>
                        )}
                      </div>
                    )}
                    
                    {/* Export New Products Button */}
                    {uploadType === 'supplier_delivery' && uploadResult.summary?.newProducts > 0 && (
                      <div className="mt-4 pt-4 border-t border-green-200">
                        <button
                          onClick={handleExportNewProducts}
                          disabled={isExportingNewProducts}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-green-800 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isExportingNewProducts ? (
                            <>
                              <Loader className="h-4 w-4 mr-2 animate-spin" />
                              Exporting...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Export New Products to CSV
                            </>
                          )}
                        </button>
                        <p className="mt-2 text-xs text-green-600">
                          Download a CSV file containing all newly added products for review
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 rounded-lg">
                    <div className="flex items-center mb-2">
                      <AlertCircle className="h-6 w-6 text-red-500 mr-2" />
                      <h4 className="text-lg font-medium text-red-800">Upload Failed</h4>
                    </div>
                    <p className="text-sm text-red-700">{uploadResult.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            {uploadResult ? (
              <button
                onClick={handleClose}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading || (uploadType === 'supplier_delivery' && !selectedSupplier)}
                  className="w-full inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <Loader className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload CSV
                    </>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}