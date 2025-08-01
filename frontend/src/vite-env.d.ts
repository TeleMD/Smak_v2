/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_V2_URL: string
  readonly VITE_SUPABASE_V2_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 