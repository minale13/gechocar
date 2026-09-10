-- ============================================================================
-- 029: Admin Dashboard realtime sync
-- ============================================================================
-- The Admin dashboard (/admin) subscribes to Postgres changes on the three
-- active tables — public.payments, public.telegram_scheduler and
-- public.lottery_items — via components/admin/realtime-sync.tsx, so receipt
-- submissions, scheduler auto-posts (last_posted_at "Last Posted" stamp) and
-- raffle item saves/deletes appear INSTANTLY without a manual browser refresh.
--
-- Supabase Realtime only broadcasts postgres_changes events for tables added
-- to the `supabase_realtime` publication — this migration does exactly that.
-- Idempotent: safe to run more than once. (Mirrors 021_realtime_hero_banners.)
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

-- payments: receipt submissions + admin approve/reject (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end
$$;

-- telegram_scheduler: the cron/bot service stamps last_posted_at after every
-- delivered auto-post (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'telegram_scheduler'
  ) then
    alter publication supabase_realtime add table public.telegram_scheduler;
  end if;
end
$$;

-- lottery_items: raffle item saves/deletes from any admin session (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lottery_items'
  ) then
    alter publication supabase_realtime add table public.lottery_items;
  end if;
end
$$;

-- replica identity FULL so UPDATE/DELETE events broadcast the complete row
-- image (clients receive every column, not just the primary key).
alter table public.payments replica identity full;
alter table public.telegram_scheduler replica identity full;
alter table public.lottery_items replica identity full;
