-- ============================================================================
-- 020: PostgREST schema cache reload helper
-- ============================================================================
-- Fixes "Could not find the table 'public.tickets' in the schema cache".
--
-- PostgREST caches table metadata and needs an explicit
--   NOTIFY pgrst, 'reload schema'
-- to pick up newly created tables / columns immediately. This function lets the
-- client trigger that notification (best-effort) so table queries can recover
-- without a dashboard "Reload schema" click or a project restart.
--
-- The client calls it via supabase.rpc('reload_pgrst_schema') (see
-- lib/supabase/schema-cache.ts) whenever a 'tickets' query reports the
-- schema-cache error, and then retries the query once before falling back to
-- reading reservations from public.payments (the receipts table in this schema).
-- ============================================================================

create or replace function public.reload_pgrst_schema()
returns void
language sql
security definer
set search_path = public
as $$
  select pg_notify('pgrst', 'reload schema');
$$;

grant execute on function public.reload_pgrst_schema() to anon, authenticated, service_role;