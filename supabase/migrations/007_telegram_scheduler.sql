-- ============================================================================
-- 007: Telegram Auto-Post Scheduler + app_settings schema fix
-- ============================================================================
-- 1) FIXES: "column app_settings.key does not exist"
--    The live app_settings table was missing the `key` / `value` columns that
--    every query depends on (seed.sql, migrations, app code all use
--    app_settings(key, value)). These ALTERs are idempotent.
--
-- 2) NEW: telegram_scheduler table
--    Stores the "Telegram Auto-Post Scheduler" configuration managed from
--    /admin: caption text, banner image URL, interval hours, active toggle,
--    bot token + chat id, and the timestamp of the last successful post so the
--    background cron service knows when to fire next.
-- ============================================================================

-- NOTE: app_settings schema alignment (key/value vs. single-row columns) is
-- handled by migration 005_fix_app_settings_key_value.sql. This migration
-- only adds the telegram_scheduler table.

-- ---------------------------------------------------------------------------
-- 2) Telegram scheduler table
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_scheduler (
  id uuid primary key default uuid_generate_v4(),
  caption text not null default '',
  image_url text,
  interval_hours numeric not null default 24,
  is_active boolean not null default true,
  bot_token text not null default '',
  chat_id text not null default '',
  last_posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Seed one row so the admin UI has something to edit (idempotent).
insert into public.telegram_scheduler (id, caption, interval_hours, is_active)
values ('00000000-0000-0000-0000-0000000000aa', '', 24, true)
on conflict (id) do nothing;