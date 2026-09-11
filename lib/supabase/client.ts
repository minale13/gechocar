import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Use the REAL Supabase project URL — never 'https://your-project-id.supabase.co'
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://itcovomjihrfvanykrtf.supabase.co';

// REQUIRED: Set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to your real "anon public" key:
//   Supabase Dashboard → Project Settings → API → Project API keys → anon public
//
// NOTE: Never throw at module scope here. A module-level throw crashes
// `next build` during static prerendering of EVERY route whose chunk imports
// this module (/_not-found, /login, /profile …) whenever the env var is not
// present in the build environment (e.g. a Vercel build without it configured).
// Instead, warn and defer the failure to request time.
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.warn(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — Supabase requests will fail at runtime until it is configured.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});