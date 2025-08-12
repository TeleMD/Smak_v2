# Cursor.md - Smak v2 Project Context

## 🎯 Project Overview

**Smak v2** is an advanced multi-location inventory management system designed specifically for grocery chains. This is a complete rewrite and enhancement of the original Smak system, built with modern technologies and improved architecture.

### Key Improvements from v1
- **Real-time inventory tracking** with reserved quantities
- **Enhanced database schema** optimized for multi-store operations
- **Modern tech stack** with TypeScript and improved UX
- **Centralized product catalog** as single source of truth
- **Advanced audit trails** for complete inventory movement history
- **Stock receipt management** for supplier deliveries
- **Sales integration** (POS and Shopify)
- **Multi-store dashboard** with real-time updates

## 🏗️ Architecture & Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Routing**: React Router DOM v6
- **State Management**: React Hooks (useState, useEffect)

### Backend & Database
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth with email/password
- **Real-time**: Supabase subscriptions
- **API**: Supabase client with Row Level Security (RLS)
- **User Management**: Admin approval system

### Deployment
- **Frontend**: Vercel
- **Database**: Supabase (separate project from v1)
- **Environment**: Isolated from v1 system
- **Domain**: Separate subdomain/domain from v1

## 📁 Project Structure

```
Smak_v2/
├── frontend/                    # React application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── AuthSection.tsx # User authentication
│   │   │   ├── Header.tsx      # App navigation header
│   │   │   └── CSVUploadModal.tsx # CSV file upload (legacy)
│   │   ├── pages/              # Main application pages
│   │   │   ├── Dashboard.tsx   # Multi-store overview
│   │   │   ├── ShopManagement.tsx # Store management
│   │   │   └── ShopDetail.tsx  # Individual store details
│   │   ├── services/           # Business logic & API calls
│   │   │   └── database.ts     # Supabase database operations
│   │   ├── types/              # TypeScript definitions
│   │   │   └── index.ts        # All type definitions
│   │   ├── utils/              # Utility functions
│   │   │   ├── supabase.ts     # Supabase client config
│   │   │   └── csvUtils.ts     # CSV processing utilities
│   │   ├── App.tsx             # Main application component
│   │   ├── main.tsx            # React entry point
│   │   └── index.css           # Global styles (Tailwind)
│   ├── package.json            # Dependencies & scripts
│   ├── vite.config.ts          # Vite configuration
│   ├── tailwind.config.js      # Tailwind CSS config
│   └── tsconfig.json           # TypeScript configuration
├── supabase/                   # Database schema & migrations
│   ├── config.toml             # Supabase configuration
│   └── migrations/             # Database migration files
├── supabase_schema_v2.sql      # Complete v2 database schema
├── README.md                   # Comprehensive project docs
├── SETUP.md                    # Quick setup guide
├── DEPLOYMENT.md               # Production deployment guide
└── vercel.json                 # Vercel deployment config
```

## 🗄️ Database Schema (Key Tables)

### Core Entities
- **`stores`** - Store locations and configuration
- **`products`** - Centralized product catalog with SKU, barcode, pricing
- **`current_inventory`** - Real-time inventory levels per store
- **`user_profiles`** - User management with approval system

### Operational Tables
- **`stock_receipts`** & **`stock_receipt_items`** - Supplier delivery management
- **`sales_transactions`** & **`sales_transaction_items`** - Sales tracking
- **`inventory_movements`** - Complete audit trail of all changes
- **`sync_jobs`** - Background job management and tracking

### Features
- **Row Level Security (RLS)** enabled on all tables
- **Generated columns** for calculated fields (available_quantity, totals)
- **Comprehensive indexing** for performance
- **Audit triggers** for automatic tracking

## 🎨 UI/UX Patterns

### Design System
- **Primary Colors**: Blue-based color palette
- **Layout**: Responsive design with sidebar navigation
- **Components**: Card-based layout with consistent spacing
- **Icons**: Lucide React icons throughout
- **Loading States**: Consistent loading spinners and skeletons

### Navigation
- **Header Navigation**: Dashboard, Shops, User menu
- **Breadcrumbs**: Clear navigation hierarchy
- **Modal Dialogs**: For forms and detailed views
- **Responsive**: Mobile-first design approach

### Data Presentation
- **Tables**: Sortable columns with pagination
- **Cards**: Summary information with actions
- **Charts**: Dashboard statistics and trends
- **Forms**: Validation with error handling

## 🔐 Security & Authentication

### User Management
- **Email/Password Authentication** via Supabase Auth
- **Admin Approval System** - new users need approval
- **Role-Based Access** - admin vs regular user permissions
- **Session Management** - automatic token refresh

### Data Security
- **Row Level Security (RLS)** on all database tables
- **API Security** - all requests authenticated
- **Input Validation** - client and server-side validation
- **HTTPS Enforcement** in production

## 🚀 Development Guidelines

### Code Standards
- **TypeScript Strict Mode** - all code must be properly typed
- **ESLint Configuration** - consistent code style
- **Component Structure** - functional components with hooks
- **Error Handling** - comprehensive try-catch blocks
- **Performance** - optimize renders with useMemo/useCallback when needed

### Database Operations
- **Use services/database.ts** for all Supabase operations
- **Error Handling** - always handle Supabase errors gracefully
- **Type Safety** - use TypeScript interfaces for all data
- **Transactions** - use database transactions for complex operations

### State Management
- **Local State** - useState for component state
- **Props Drilling** - acceptable for small app size
- **Loading States** - always show loading indicators
- **Error States** - display user-friendly error messages

### File Organization
- **Components** - reusable UI components in `/components`
- **Pages** - route-level components in `/pages`
- **Types** - centralized in `/types/index.ts`
- **Utils** - helper functions in `/utils`
- **Services** - API calls and business logic in `/services`

## 🔄 Key Workflows

### Inventory Management Flow
1. **Create/Import Products** - centralized product catalog
2. **Stock Receipts** - receive supplier deliveries
3. **Inventory Tracking** - real-time quantity updates
4. **Sales Processing** - automatic inventory deduction
5. **Audit Trail** - complete movement history

### User Onboarding Flow
1. **User Registration** - email/password signup
2. **Admin Approval** - pending status until approved
3. **Dashboard Access** - approved users see main interface
4. **Role Assignment** - admin vs regular user permissions

### Multi-Store Operations
1. **Store Management** - create and configure stores
2. **Store Selection** - switch between store views
3. **Store-Specific Inventory** - isolated inventory per store
4. **Cross-Store Reports** - dashboard with all stores

## 🚨 Critical Constraints & Rules

### System Isolation
- **NEVER modify v1 system** - complete isolation required
- **Separate Database** - v2 uses completely separate Supabase project
- **Different Ports** - v2 runs on port 5174 (v1 uses 5173)
- **Independent Deployment** - separate Vercel projects

### Data Integrity
- **Referential Integrity** - maintain foreign key relationships
- **Audit Trail** - all inventory changes must be logged
- **User Approval** - new users require admin approval
- **Data Validation** - validate all inputs client and server-side

### Performance Considerations
- **Lazy Loading** - load data only when needed
- **Pagination** - for large data sets
- **Caching** - cache frequently accessed data
- **Optimistic Updates** - for better UX

## 🛠️ Common Development Tasks

### Adding New Features
1. **Update Types** - add TypeScript interfaces in `/types/index.ts`
2. **Database Changes** - update schema and run migrations
3. **Service Layer** - add database operations in `/services/database.ts`
4. **UI Components** - create reusable components
5. **Pages/Routes** - add new pages as needed

### Working with Database
```typescript
// Example database operation
import { supabase } from '../utils/supabase'
import { Store } from '../types'

export const getStores = async (): Promise<Store[]> => {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('Error fetching stores:', error)
    throw error
  }

  return data || []
}
```

### Creating Components
```typescript
// Example component structure
import { useState, useEffect } from 'react'
import { Store } from '../types'

interface StoreCardProps {
  store: Store
  onSelect: (storeId: string) => void
}

export default function StoreCard({ store, onSelect }: StoreCardProps) {
  // Component logic
  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Component JSX */}
    </div>
  )
}
```

## 🧪 Testing & Quality

### Testing Strategy
- **Manual Testing** - thorough UI testing for all features
- **Error Scenarios** - test all error conditions
- **Cross-Browser** - test in different browsers
- **Responsive** - test on different screen sizes

### Quality Checklist
- [ ] TypeScript errors resolved
- [ ] ESLint warnings addressed
- [ ] Loading states implemented
- [ ] Error handling in place
- [ ] Responsive design verified
- [ ] Database operations tested

## 📚 Key Resources

### Documentation
- [README.md](./README.md) - Complete project documentation
- [SETUP.md](./SETUP.md) - Quick setup guide
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment
- [supabase_schema_v2.sql](./supabase_schema_v2.sql) - Database schema

### External Resources
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Vite Documentation](https://vitejs.dev/)

## 🎯 Current Status & Roadmap

### Implemented Features ✅
- Enhanced database schema with RLS
- User authentication with approval system
- Multi-store dashboard with real-time stats
- Store management interface
- Basic inventory tracking
- Product catalog management

### In Progress 🚧
- Store management interface improvements
- Inventory adjustment tools
- Stock receipt processing
- Enhanced UI components

### Planned Features 📋
- Sales integration (POS/Shopify)
- Advanced reporting and analytics
- Mobile app support
- API integrations
- Data migration tools from v1

## 💡 AI Assistant Context

### When helping with this project:
1. **Understand the dual system** - v1 and v2 run independently
2. **Respect constraints** - never modify v1, maintain isolation
3. **Follow patterns** - use existing code patterns and structure
4. **Type safety** - always use TypeScript properly
5. **Database first** - consider database schema in all changes
6. **User experience** - prioritize responsive, accessible UI
7. **Error handling** - implement proper error handling
8. **Performance** - consider loading states and optimization

### Common requests might involve:
- Adding new database tables/columns
- Creating new UI components/pages
- Implementing business logic
- Fixing TypeScript errors
- Optimizing database queries
- Enhancing user interface
- Adding new features
- Debugging issues

---

**Last Updated**: January 2025
**Version**: 2.0.0
**Maintainer**: Smak Development Team