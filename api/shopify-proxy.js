// Vercel serverless function to proxy Shopify API requests
// This avoids CORS issues by making requests from the server

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    const { endpoint, method = 'GET', body } = req.body || {}
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint parameter required' })
    }

    // Get credentials from environment variables
    // Try both VITE_ prefixed and non-prefixed versions
    const accessToken = process.env.VITE_SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN
    const storeUrl = process.env.VITE_SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE_URL
    
    if (!accessToken || !storeUrl) {
      return res.status(500).json({ 
        error: 'Shopify credentials not configured in environment variables',
        debug: {
          hasAccessToken: !!accessToken,
          hasStoreUrl: !!storeUrl,
          storeUrlValue: storeUrl ? storeUrl.substring(0, 30) + '...' : null,
          envKeys: Object.keys(process.env).filter(key => key.includes('SHOPIFY'))
        }
      })
    }

    // Extract store domain - handle multiple URL formats
    let storeDomain
    
    // Try different URL patterns
    const storeMatch = storeUrl.match(/\/store\/([^\/]+)/)
    const adminMatch = storeUrl.match(/^https:\/\/admin\.shopify\.com\/store\/([^\/]+)/)
    const directMatch = storeUrl.match(/^https:\/\/([^\/]+)\.myshopify\.com/)
    
    if (storeMatch) {
      storeDomain = `${storeMatch[1]}.myshopify.com`
    } else if (adminMatch) {
      storeDomain = `${adminMatch[1]}.myshopify.com`
    } else if (directMatch) {
      storeDomain = `${directMatch[1]}.myshopify.com`
    } else {
      return res.status(500).json({ 
        error: 'Invalid Shopify store URL format. Expected formats: https://admin.shopify.com/store/yourstore or https://yourstore.myshopify.com',
        receivedUrl: storeUrl 
      })
    }
    const apiUrl = `https://${storeDomain}/admin/api/2024-01${endpoint}`

    // Make request to Shopify
    const response = await fetch(apiUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Shopify API error: ${response.status} ${response.statusText}`,
        details: data
      })
    }

    res.status(200).json(data)
  } catch (error) {
    console.error('Shopify proxy error:', error)
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: error.stack?.split('\n').slice(0, 3) // Limited stack trace for debugging
    })
  }
}