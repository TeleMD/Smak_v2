# 🚀 Smak v2 Quick Setup Guide

Follow these steps to get Smak v2 running on your local machine.

## Prerequisites

- Node.js 18+ and npm
- Supabase account (create a NEW project for v2)
- Git

## 1. Clone Repository

```bash
git clone https://github.com/TeleMD/Smak_v2.git
cd Smak_v2
```

## 2. Set up Supabase v2 Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. **Create a NEW project** (do NOT use the existing v1 project)
3. Go to Settings → API
4. Copy your project URL and anon key
5. Go to SQL Editor
6. Copy and run the entire `supabase_schema_v2.sql` file

## 3. Configure Environment

```bash
cd frontend
cp .env.example .env.local
```

Edit `.env.local` with your Supabase v2 credentials:
```env
VITE_SUPABASE_V2_URL=https://your-v2-project.supabase.co
VITE_SUPABASE_V2_ANON_KEY=your-v2-anon-key
```

## 4. Install Dependencies & Run

```bash
npm install
npm run dev
```

✅ **Smak v2 will be available at http://localhost:5174**

## 5. Create First Admin User

1. Open http://localhost:5174
2. Click "Create account"
3. Register with your email
4. Go to Supabase → Table Editor → user_profiles
5. Find your user and change:
   - `approval_status` → `'approved'`
   - `is_admin` → `true`
6. Refresh the application

## 🔒 Safety Notes

- ✅ v2 runs on port **5174** (v1 uses 5173)
- ✅ v2 uses a **separate Supabase project**
- ✅ **Zero impact** on existing v1 system
- ✅ Both systems can run **simultaneously**

## 🚨 Critical Reminders

- **NEVER** use the v1 Supabase project for v2
- **ALWAYS** use separate database instances
- **TEST** thoroughly before any production migration
- **BACKUP** v1 data before migration planning

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production  
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

## Support

- 📖 See full documentation in [README.md](./README.md)
- 🗄️ Database schema in [supabase_schema_v2.sql](./supabase_schema_v2.sql)
- 🐛 Report issues on GitHub

Happy coding! 🎉 