import { supabase } from '@/lib/supabase/client';

/**
 * Detect whether a Supabase query failed because PostgREST's schema cache has
 * not picked up the `public.tickets` table yet (or the table is absent).
 *
 * PostgREST raises this as:
 *   "Could not find the table 'public.tickets' in the schema cache"
 * (or code "PGRST205" / SQLSTATE "42P01" = "relation ... does not exist").
 */
export function isTicketsTableUnavailableError(
  err: { message?: string; code?: string; details?: string } | null | undefined,
): boolean {
  const pieces = [err?.message, err?.details, err?.code].filter(Boolean);
  const msg = pieces.join(' ').toLowerCase();
  return (
    msg.includes('could not find the table') ||
    msg.includes('schema cache') ||
    msg.includes('pgrst205') ||
    msg.includes('42p01') ||
    msg.includes('does not exist') ||
    (msg.includes('relation') && msg.includes('tickets'))
  );
}

/**
 * Best-effort PostgREST schema cache reload.

 * PostgREST caches table metadata until it is explicitly told to refresh —
 * a table/column created via the SQL editor or a migration does NOT always
 * become visible to client queries immediately. Running
 * `NOTIFY pgrst, 'reload schema'` (wrapped by migration 020's
 * `reload_pgrst_schema()` helper) forces PostgREST to rebuild its schema cache.

 * NEVER throws — a failed reload (function not deployed yet, RLS blocked,
 * network hiccup) is logged and ignored so callers degrade gracefully.
 */
export async function reloadPgrstSchema(): Promise<boolean> {
  try {
    // supabase-js v2 types `.rpc()` against Database['public']['Functions'] which
    // is not generated in this project — cast to the untyped shape so the call
    // compiles without forcing us to add a Functions entry to the Database type.
    const rpc = supabase.rpc as unknown as (
      name: string,
) => Promise<{ error: { message?: string } | null }>;
    const result = await rpc('reload_pgrst_schema');
    if (result.error) {
      console.warn('reloadPgrstSchema: reload RPC failed (non-fatal):', result.error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('reloadPgrstSchema: reload threw (non-fatal):', err);
    return false;
  }
}