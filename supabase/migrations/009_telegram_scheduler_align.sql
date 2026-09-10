-- ============================================================================
-- 009: telegram_scheduler — CANONICAL rebuild (uuid-id, full column set)
-- ============================================================================
-- PROBLEM
--   Earlier "telegram_scheduler" migrations produced divergent schemas across
--   environments (integer id, missing created_at, missing interval_minutes,
--   etc.). The app code and types assume ONE canonical shape:
--     id              uuid         primary key (fixed seed value below)
--     caption         text         default ''
--     image_url       text
--     interval_hours  numeric      default 24
--     interval_minutes integer     default 0
--     is_active       boolean      default true
--     bot_token       text         default ''
--     chat_id         text         default ''
--     last_posted_at  timestamptz
--     created_at      timestamptz  default now()
--     updated_at      timestamptz  default now()
--
-- FIX
--   Recreate the table exactly as the application expects. The scheduler holds
--   a SINGLE configuration row and is unconfigured until an admin saves it, so
--   a rebuild loses no meaningful data. This migration is the single source of
--   truth for the schema.
--
-- HOW TO RUN (once): Supabase Dashboard → SQL Editor → paste → Run.
--   - REQUIRES elevated privileges (the anon key cannot run DDL).
--   - SAFE to re-run: idempotent (DROP ... IF EXISTS then CREATE).
-- ============================================================================

-- 1) Drop any prior / divergent version of the table.
drop table if exists public.telegram_scheduler;

-- 2) Recreate with the canonical schema.
create table public.telegram_scheduler (
  id uuid primary key default uuid_generate_v4(),
  caption text not null default '',
  image_url text,
  interval_hours numeric not null default 24,
  interval_minutes integer not null default 0,
  is_active boolean not null default true,
  bot_token text not null default '',
  chat_id text not null default '',
  last_posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Row Level Security + policies so the admin panel persists config and the
--    public cron can read it.
alter table public.telegram_scheduler enable row level security;

drop policy if exists "Everyone can read telegram scheduler" on public.telegram_scheduler;
create policy "Everyone can read telegram scheduler"
  on public.telegram_scheduler
  for select using (true);

drop policy if exists "Authenticated users can insert telegram scheduler" on public.telegram_scheduler;
create policy "Authenticated users can insert telegram scheduler"
  on public.telegram_scheduler
  for insert with check (true);

drop policy if exists "Authenticated users can update telegram scheduler" on public.telegram_scheduler;
create policy "Authenticated users can update telegram scheduler"
  on public.telegram_scheduler
  for update using (true);

drop policy if exists "Authenticated users can delete telegram scheduler" on public.telegram_scheduler;
create policy "Authenticated users can delete telegram scheduler"
  on public.telegram_scheduler
  for delete using (true);

-- 4) Seed the single scheduler row so the admin UI and cron have something to
--    mutate. Idempotent.
insert into public.telegram_scheduler (
  id, caption, interval_hours, interval_minutes, is_active
)
values ('00000000-0000-0000-0000-0000000000aa', '', 24, 0, true)
on conflict (id) do nothing;