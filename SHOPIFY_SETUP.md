# Shopify Integration Setup

## Environment Variables Required

For the Shopify integration to work, you need to set the following environment variables:

### Frontend (.env file in `/frontend` directory)

```bash
VITE_SHOPIFY_ACCESS_TOKEN=shpat_your_shopify_access_token_here
VITE_SHOPIFY_STORE_URL=https://admin.shopify.com/store/your-store-name
```

### Production Deployment (Vercel)

In your Vercel dashboard, add these environment variables:

1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add:
   - `VITE_SHOPIFY_ACCESS_TOKEN` = `shpat_your_shopify_access_token_here`
   - `VITE_SHOPIFY_STORE_URL` = `https://admin.shopify.com/store/your-store-name`

## Features

- **Store-to-Location Mapping**: Syncs inventory to Shopify locations with matching store names
- **Barcode Matching**: Matches products between systems using barcodes
- **Graceful Handling**: Skips products not found in Shopify without errors
- **Real-time Updates**: Updates available quantities from current_inventory table
- **Audit Trail**: Tracks all sync operations in sync_jobs table

## Usage

1. **Individual Shop Sync**: Go to shop detail page → Click "Sync to Shopify"
2. **Quick Sync**: From shop management grid → Click "Sync" button on any shop card
3. **Results**: View detailed sync results in the modal that appears

## Requirements

- Shopify store must have locations with names matching your store names
- Products must have barcodes in both systems for matching
- Valid Shopify admin access token with inventory permissions