# Smak v2 - Advanced Multi-Location Inventory Management System

Smak v2 is an enhanced version of the inventory management system designed specifically for grocery chains with multiple locations. This version introduces real-time inventory tracking, stock receipts, sales integration, and comprehensive audit trails.

## 🆕 What's New in v2

### Enhanced Features
- **Real-time Inventory Tracking**: Live inventory levels with reserved quantities
- **Stock Receipts Management**: Handle supplier deliveries with detailed line items
- **Sales Integration**: Track both offline (POS) and online (Shopify) sales
- **Audit Trail**: Complete history of all inventory movements
- **Multi-Store Dashboard**: Centralized overview of all locations
- **Advanced Alerts**: Low stock, overstock, and pending delivery notifications

### Technical Improvements
- **Centralized Product Catalog**: Single source of truth for all products
- **Enhanced Database Schema**: Optimized for real-time operations
- **Better Performance**: Optimized queries and indexing
- **Modern UI**: Responsive design with improved UX
- **Type Safety**: Full TypeScript implementation

## 🏗️ Architecture

### Database Schema
- `stores` - Store locations and configuration
- `products` - Centralized product catalog
- `current_inventory` - Real-time inventory levels per store
- `stock_receipts` & `stock_receipt_items` - Supplier delivery management
- `sales_transactions` & `sales_transaction_items` - Sales tracking
- `inventory_movements` - Complete audit trail
- `sync_jobs` - Background job management

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth
- **Deployment**: Vercel (frontend) + Supabase (backend)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account (separate project for v2)
- Vercel account (optional, for deployment)

### 1. Environment Setup

Create a new Supabase project for v2:
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project (separate from v1)
3. Note down your project URL and anon key

### 2. Database Setup

```bash
# Execute the v2 schema in your Supabase SQL editor
cat supabase_schema_v2.sql | supabase db reset --db-url "your-v2-database-url"
```

Or manually run the schema file in the Supabase SQL editor.

### 3. Frontend Installation

```bash
cd smak-v2/frontend
npm install
```

### 4. Environment Configuration

Create `.env.local`:

```env
VITE_SUPABASE_V2_URL=your-v2-supabase-url
VITE_SUPABASE_V2_ANON_KEY=your-v2-anon-key
```

### 5. Run Development Server

```bash
npm run dev
```

The v2 application will be available at `http://localhost:5174` (different port from v1).

## 📁 Project Structure

```
smak-v2/
├── frontend/
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── AuthSection.tsx # Authentication (adapted from v1)
│   │   │   └── Header.tsx      # App header (adapted from v1)
│   │   ├── pages/
│   │   │   └── Dashboard.tsx   # Enhanced multi-store dashboard
│   │   ├── services/
│   │   │   └── database.ts     # Database operations
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript definitions
│   │   ├── utils/
│   │   │   ├── supabase.ts     # Supabase client (v2)
│   │   │   └── csvUtils.ts     # CSV utilities (from v1)
│   │   ├── App.tsx             # Main application
│   │   └── main.tsx            # React entry point
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── supabase/
│   ├── functions/              # Edge Functions (TBD)
│   └── migrations/             # Database migrations (TBD)
├── supabase_schema_v2.sql      # Complete v2 database schema
└── README.md
```

## 🔧 Configuration

### Supabase Settings

1. **Row Level Security**: The schema includes RLS policies for data protection
2. **Authentication**: Email/password with admin approval system
3. **API Settings**: Configure CORS for your frontend domain

### Environment Variables

- `VITE_SUPABASE_V2_URL`: Your v2 Supabase project URL
- `VITE_SUPABASE_V2_ANON_KEY`: Your v2 Supabase anon key

## 📊 Key Features

### Dashboard
- Real-time overview of all stores and inventory
- Low stock alerts and pending deliveries
- Recent inventory movements
- Quick action buttons

### Inventory Management
- Store-specific inventory views
- Real-time quantity tracking
- Reserved quantity management
- Bulk inventory adjustments

### Stock Receipts
- Create and manage supplier deliveries
- Line-item tracking with costs and batch numbers
- Automatic inventory updates upon processing

### Sales Integration
- Import POS sales data
- Shopify order integration
- Automatic inventory deduction
- Sales analytics and reporting

### Audit Trail
- Complete history of inventory movements
- User tracking and timestamps
- Movement type categorization
- Reference linking to source transactions

## 🔄 Migration from v1

### Data Migration (Planned)
1. Export data from v1 system
2. Transform to v2 schema format
3. Import into v2 database
4. Verify data integrity

### Parallel Operation
- Both v1 and v2 can run simultaneously
- Different ports and databases
- Gradual migration approach
- Fallback to v1 if needed

## 🚨 Important Notes

### Security
- **Separate Database**: v2 uses a completely separate Supabase project
- **User Approval**: Admin approval required for new users
- **RLS Policies**: Row-level security enabled on all tables
- **Data Isolation**: No cross-contamination with v1 data

### Performance
- **Optimized Queries**: Indexed for common operations
- **Batch Processing**: Efficient bulk operations
- **Real-time Updates**: Minimal latency for inventory changes
- **Background Jobs**: Heavy operations run asynchronously

### Backward Compatibility
- **API Compatibility**: v1 Edge Functions preserved for reference
- **Type Compatibility**: v1 types included for migration
- **Component Reuse**: UI components adapted from v1

## 🛠️ Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Adding New Features

1. **Database Changes**: Update schema in `supabase_schema_v2.sql`
2. **Types**: Add TypeScript definitions in `src/types/index.ts`
3. **Services**: Add database operations in `src/services/database.ts`
4. **Components**: Create React components in `src/components/`
5. **Pages**: Add new pages in `src/pages/`

### Code Style
- TypeScript strict mode enabled
- ESLint for code quality
- Tailwind CSS for styling
- Component-based architecture

## 📈 Roadmap

### Phase 1: Core Infrastructure ✅
- Enhanced database schema
- Basic UI components
- Authentication system
- Real-time dashboard

### Phase 2: Inventory Management (In Progress)
- Store management interface
- Product catalog management
- Inventory adjustment tools
- Stock receipt processing

### Phase 3: Sales Integration
- POS sales import
- Shopify integration
- Sales analytics
- Automated stock updates

### Phase 4: Advanced Features
- Reporting and analytics
- Mobile app support
- Advanced notifications
- API integrations

### Phase 5: Migration Tools
- Data export/import utilities
- Migration verification
- Rollback capabilities
- Documentation updates

## 🤝 Contributing

1. Ensure v1 system remains operational
2. Follow TypeScript best practices
3. Add tests for new features
4. Update documentation
5. Verify database migrations

## 📞 Support

For questions or issues:
1. Check this README first
2. Review the database schema documentation
3. Test in development environment
4. Contact the development team

## ⚠️ Critical Reminders

- **DO NOT MODIFY V1**: Keep the existing v1 system untouched
- **SEPARATE DEPLOYMENT**: Use different domains/ports for v1 and v2
- **DATABASE ISOLATION**: v2 uses a completely separate database
- **GRADUAL MIGRATION**: Plan the transition carefully
- **BACKUP STRATEGY**: Always backup v1 data before migration

---

**Smak v2** - Built for the future of multi-location inventory management. 