import { CSVRow } from '../types'

export function parseCSVPreview(csvText: string): { data: CSVRow[], isValid: boolean, errorMessage?: string } {
  try {
    const lines = csvText.trim().split('\n')
    
    if (lines.length < 2) {
      return {
        data: [],
        isValid: false,
        errorMessage: 'CSV must have at least a header row and one data row'
      }
    }

    // Auto-detect delimiter by checking which gives more columns
    const firstLine = lines[0]
    const commaCount = (firstLine.match(/,/g) || []).length
    const semicolonCount = (firstLine.match(/;/g) || []).length
    const delimiter = semicolonCount > commaCount ? ';' : ','

    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''))
    
    // Basic validation - just check that we have some columns
    if (headers.length < 2) {
      return {
        data: [],
        isValid: false,
        errorMessage: 'CSV must have at least 2 columns'
      }
    }

    // For preview purposes, we'll show the first two columns
    // The backend will handle the specific column mapping validation
    const col1Index = 0
    const col2Index = 1

    const data: CSVRow[] = []
    const errors: string[] = []

    // Process only first 10 rows for preview
    const previewLines = lines.slice(1, Math.min(11, lines.length))

    for (let i = 0; i < previewLines.length; i++) {
      const row = previewLines[i].split(delimiter).map(cell => cell.trim().replace(/"/g, ''))
      
      if (row.length < 2) {
        errors.push(`Row ${i + 2}: insufficient columns`)
        continue
      }

      // For preview, show first two columns (actual mapping happens in backend)
      const barcode = row[col1Index] || `col1_${i}`
      const quantityStr = row[col2Index] || '0'

      if (!barcode) {
        errors.push(`Row ${i + 2}: missing data in first column`)
        continue
      }

      // For preview, be more lenient with quantity validation
      const quantity = parseInt(quantityStr, 10)
      const displayQuantity = isNaN(quantity) ? 0 : Math.max(0, quantity)

      data.push({ barcode, quantity: displayQuantity })
    }

    if (data.length === 0 && errors.length > 0) {
      return {
        data: [],
        isValid: false,
        errorMessage: `No valid rows found. Errors: ${errors.slice(0, 3).join(', ')}`
      }
    }

    return {
      data,
      isValid: true,
      errorMessage: errors.length > 0 ? `${errors.length} rows had errors` : undefined
    }

  } catch (error) {
    return {
      data: [],
      isValid: false,
      errorMessage: `Error parsing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

export function validateCSVFile(file: File): { isValid: boolean, errorMessage?: string } {
  // Check file type
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return {
      isValid: false,
      errorMessage: 'File must be a CSV file (.csv extension)'
    }
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    return {
      isValid: false,
      errorMessage: 'File size must be less than 10MB'
    }
  }

  // Check file size (min 50 bytes for header + at least one row)
  if (file.size < 50) {
    return {
      isValid: false,
      errorMessage: 'File appears to be too small to contain valid CSV data'
    }
  }

  return { isValid: true }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Additional CSV parsing functions for v2
export function parseProductCSV(csvText: string): { data: any[], errors: string[] } {
  const lines = csvText.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  
  const data: any[] = []
  const errors: string[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''))
    
    if (row.length !== headers.length) {
      errors.push(`Row ${i + 1}: Column count mismatch`)
      continue
    }
    
    const rowData: any = {}
    headers.forEach((header, index) => {
      rowData[header.toLowerCase().replace(/\s+/g, '_')] = row[index]
    })
    
    data.push(rowData)
  }
  
  return { data, errors }
}

export function parseReceiptCSV(csvText: string): { data: any[], errors: string[] } {
  // Similar parsing logic for receipt/delivery CSV files
  return parseProductCSV(csvText)
}

export function parseSalesCSV(csvText: string): { data: any[], errors: string[] } {
  // Similar parsing logic for sales transaction CSV files
  return parseProductCSV(csvText)
}

// Enhanced CSV parsing for the new upload functionality
export function parseCSV(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (event) => {
      try {
        const csvText = event.target?.result as string
        const lines = csvText.trim().split('\n')
        
        if (lines.length < 2) {
          reject(new Error('CSV must have at least a header row and one data row'))
          return
        }

        // Auto-detect delimiter
        const firstLine = lines[0]
        const commaCount = (firstLine.match(/,/g) || []).length
        const semicolonCount = (firstLine.match(/;/g) || []).length
        const delimiter = semicolonCount > commaCount ? ';' : ','

        // Parse headers
        const headers = lines[0].split(delimiter)
          .map(h => h.trim().replace(/^"/, '').replace(/"$/, ''))

        // Parse data rows
        const data: any[] = []
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue // Skip empty lines
          
          const values = line.split(delimiter)
            .map(v => v.trim().replace(/^"/, '').replace(/"$/, ''))
          
          const rowData: any = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index] || ''
          })
          
          data.push(rowData)
        }

        resolve(data)
      } catch (error) {
        reject(error)
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.readAsText(file)
  })
} 