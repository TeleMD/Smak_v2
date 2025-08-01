import { createClient } from '@supabase/supabase-js'

// Supabase configuration for Smak v2
// This uses the new separate Supabase project for v2
const supabaseUrl = import.meta.env.VITE_SUPABASE_V2_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_V2_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase v2 environment variables')
  console.error('Please set VITE_SUPABASE_V2_URL and VITE_SUPABASE_V2_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default supabase 