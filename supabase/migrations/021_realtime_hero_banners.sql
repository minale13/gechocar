-- ============================================================================
-- 021: Hero Banner realtime sync
-- ============================================================================
-- The landing page (/) subscribes to Postgres changes on public.hero_banners
-- (components/app/hero-banner-sync.tsx) so banners deleted or saved in the
-- Admin dashboard disappear/appear on open landing pages INSTANTLY via
-- router.refresh().
--
-- Supabase Realtime only broadcasts postgres_changes events for tables added
-- to the `supabase_realtime` publication — this migration does exactly that.
-- Idempotent: safe to run more than once.
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

-- Add hero_banners for INSERT / UPDATE / DELETE change events (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hero_banners'
  ) then
    alter publication supabase_realtime add table public.hero_banners;
  end if;
end
$$;
