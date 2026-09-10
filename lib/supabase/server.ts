import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://itcovomjihrfvanykrtf.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Add it to .env.local from your Supabase project API settings.'
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The server component should not fail on setting cookies during server actions.
        }
      },
    },
  });
}

/**
 * Server-only Supabase client that BYPASSES Row Level Security for admin
 * mutations. Uses the Service Role key when it is configured; otherwise it
 * falls back to the anon-key server client so the app keeps working (in that
 * case the anon-key RLS policies must permit the write — see migration
 * 016_admin_receipt_approval_rls.sql).
 *
 * Only use this for privileged admin operations (e.g. approving/rejecting
 * receipts and syncing ticket rows) — never expose it to the browser.
 */
export function createSupabaseAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://itcovomjihrfvanykrtf.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // IMPORTANT: never send a placeholder / garbage value to the Supabase API
  // gateway. A key that is simply "present" but invalid (e.g. the still-default
  // "your-service-role-key") makes EVERY admin write fail with:
  //     {"message":"Invalid API key"}
  // Treat clearly-invalid placeholder values as unset and fall back to the
  // anon-key server client (which uses the working publishable key).
  const trimmed = (serviceRoleKey ?? "").trim();
  const looksLikePlaceholder =
    trimmed.length < 24 ||
    /your-|placeholder|put-|xxx|replace|change-me|TODO|^["']|["']$/.test(trimmed);
  const isPlausible =
    trimmed.startsWith("eyJ") || // legacy JWT service_role key
    trimmed.startsWith("sb_secret"); // new-format service role secret key
  const validServiceRoleKey = trimmed !== "" && !looksLikePlaceholder && isPlausible;

  if (!validServiceRoleKey) {
    if (serviceRoleKey) {
      console.error(
        "createSupabaseAdminClient: SUPABASE_SERVICE_ROLE_KEY is present but looks invalid / " +
          "placeholder — falling back to the anon-key server client. Paste the real service_role " +
          "key from Supabase → Project Settings → API and restart the dev server, or apply " +
          "migration 016_admin_receipt_approval_rls.sql so anon-key admin writes are permitted."
      );
    } else {
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not set — admin writes fall back to the anon-key " +
          "server client, so RLS policies must explicitly allow the mutation."
      );
    }
    return createSupabaseServerClient();
  }

  return createClient(supabaseUrl, trimmed, {
    auth: {
      // The service role should never rely on browser sessions or token refresh.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function requireAdminAccess(): Promise<{ id: string }> {
  // Honor local admin sessions (cookie set by /login) so API routes perform
  // REAL database writes. Previously this function required a Supabase Auth
  // user, which local-only admin logins never have — causing every
  // server-side mutation (app settings, deletes) to throw "Unauthorized"
  // and silently fall back to mock success responses.
  const cookieStore = cookies();
  if (cookieStore.get("admas-admin-auth")?.value === "admin") {
    return { id: "local-admin-session" };
  }

  const supabase = createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized: sign in to continue.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (profile?.role !== 'admin') {
    throw new Error('Forbidden: admin access required.');
  }

  return user;
}
