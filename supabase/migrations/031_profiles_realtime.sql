-- ============================================================================
-- 031: Users Directory realtime sync
-- ============================================================================
-- The Admin Users Directory tab (components/admin/users-tab.tsx) subscribes to
-- Postgres changes on public.profiles so newly registered users (bot /start,
-- webhook upsert, Mini App sync) appear in the directory INSTANTLY without a
-- manual refresh.
--
-- Supabase Realtime only broadcasts postgres_changes events for tables added
-- to the `supabase_realtime` publication — this migration does exactly that.
-- Idempotent: safe to run more than once. (Mirrors 021 / 029.)
-- ============================================================================

-- Ensure the publication exists (it is created automatically when Realtime is
-- enabled for the project, but guard against projects where it was removed).
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$$;

-- profiles: registrations / profile updates (INSERT/UPDATE/DELETE events).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end
$$;

-- replica identity FULL so UPDATE/DELETE events broadcast the complete row
-- image (clients receive every column, not just the primary key).
alter table public.profiles replica identity full;