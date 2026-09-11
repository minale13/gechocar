import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Use the REAL Supabase project URL — never 'https://your-project-id.supabase.co'
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://itcovomjihrfvanykrtf.supabase.co';

// REQUIRED: Set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to your real "anon public" key:
//   Supabase Dashboard → Project Settings → API → Project API keys → anon public
//
// NEVER throw at module scope here, and NEVER pass an empty key to
// createClient(). supabase-js throws `supabaseKey is required.` when the key
// is falsy — a module-level throw crashes the ENTIRE browser bundle
// ("Application error: a client-side exception has occurred") on every page
// whenever the env var is absent from the build environment (e.g. a Vercel
// build without NEXT_PUBLIC_* configured). Instead: warn, fall back to a
// non-empty placeholder (createClient only validates non-emptiness — requests
// will simply fail with an auth error at request time), and let every
// consumer's existing try/catch render its graceful fallback UI.
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-unconfigured';

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — Supabase requests will fail at runtime until it is configured. The app renders with empty data instead of crashing.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});