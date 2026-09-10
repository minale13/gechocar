-- 026_profiles_activity.sql
-- Mini App usage tracking (Admin Dashboard user analytics).
--
--   • last_opened_at  — refreshed by POST /api/user/sync every time the user
--     opens the Mini App (window.Telegram.WebApp.initDataUnsafe.user). Powers
--     the "Active Mini App Users" metric (last 24h / all-time).
--   • is_registered   — true once the user has interacted with the bot
--     (/start webhook or Mini App open). Drives the "Total Registered Users"
--     metric together with chat_id.
--
-- NOTE: the personal Telegram chat id column is `chat_id` (added by migration
-- 025) — it IS the telegram_chat_id used by the broadcast query.
--
-- Service-role writes only (webhook + /api/user/sync) — no RLS change needed;
-- the existing profiles_select_all policy keeps reads open for the Mini App.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.profiles add column if not exists last_opened_at timestamptz;
alter table public.profiles add column if not exists is_registered boolean not null default false;

-- Fast analytics counts ("active in the last 24h").
create index if not exists profiles_last_opened_at_idx on public.profiles (last_opened_at);
create index if not exists profiles_is_registered_idx on public.profiles (is_registered);
