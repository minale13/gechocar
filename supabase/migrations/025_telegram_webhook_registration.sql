-- 025_telegram_webhook_registration.sql
-- /start Webhook registration + broadcast chat-id registry.
--
-- The Telegram Bot webhook (app/api/telegram/webhook) captures chat_id /
-- telegram_id / first_name for EVERY user who sends /start (or any message)
-- to the bot — WITHOUT requiring them to open the Mini App or share a phone.
--
--   • public.profiles gains a `chat_id` column so rows the webhook mirrors
--     (and rows the old long-poll bot created from «ስልክ አጋራ») can be
--     broadcast targets too.
--   • public.telegram_users is the dedicated webhook registration registry:
--     one row per Telegram user, indexed by telegram_id (unique, upsert
--     target) and chat_id (broadcast query). Rows are written with the
--     service-role key (bypasses RLS, like scripts/telegram-bot.mjs).
--
-- The broadcast query (lib/admin/management.ts → getTelegramBroadcastChatIds)
-- now reads chat_id FROM THESE TABLES instead of guessing ids/telegram ids from
-- users/profiles/etc.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- 1) profiles: personal-chat id recorded by the /start webhook.
alter table public.profiles add column if not exists chat_id text;

-- Fast broadcast lookup over non-null chat ids.
create index if not exists profiles_chat_id_idx on public.profiles (chat_id);

-- 2) Dedicated webhook registration registry.
create table if not exists public.telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique,
  chat_id text,
  first_name text,
  last_name text,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Guarantee the UNIQUE constraint the webhook upsert relies on
-- (onConflict: "telegram_id") even if the table pre-dates this migration.
create unique index if not exists telegram_users_telegram_id_key on public.telegram_users (telegram_id);

-- Fast broadcast lookup: "where chat_id IS NOT NULL".
create index if not exists telegram_users_chat_id_idx on public.telegram_users (chat_id);

alter table public.telegram_users enable row level security;

-- Read posture matches profiles/payments/tickets: Telegram Mini App users have
-- no Supabase auth session, so reads are open (select all) while writes stay
-- service-role only (no anon insert/update policy).
drop policy if exists "telegram_users_select_all" on public.telegram_users;
create policy "telegram_users_select_all"
  on public.telegram_users for select
  using (true);