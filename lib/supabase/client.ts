import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Use the REAL Supabase project URL — never 'https://your-project-id.supabase.co'
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://itcovomjihrfvanykrtf.supabase.co';

// REQUIRED: Set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to your real "anon public" key:
//   Supabase Dashboard → Project Settings → API → Project API keys → anon public
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Add it to .env.local from your Supabase project API settings.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});