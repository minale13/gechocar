-- 027_profiles_telegram_chat_id.sql
-- Adds telegram_chat_id (TEXT) to public.profiles and public.telegram_users.
--
-- WHY: Mini App users (who open the app via initDataUnsafe.user.id) are
-- registered by POST /api/user/sync — but before this migration the broadcast
-- and stats queries filtered ONLY on chat_id IS NOT NULL, which was NULL for
-- many profiles (e.g. those created by the long-poll bot before migration 025,
-- or rows where the sync fallback never ran).  The result:
--   • TOTAL REGISTERED USERS showed 0
--   • Broadcast reached only 1 user (the single profile with a non-null chat_id)
--
-- telegram_chat_id stores the Telegram user id as a canonical numeric STRING.
-- In a private (DM) chat the user's personal chat id equals their account id,
-- so the stringified telegram_id is a valid sendMessage chat_id target.
--
-- The sync API (app/api/user/sync/route.ts), the /start webhook
-- (lib/telegram-webhook.ts), and the long-poll bot (scripts/telegram-bot.mjs)
-- all now populate telegram_chat_id, guaranteeing every Telegram identity
-- becomes a broadcast target and a counted registered user.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ── 1) profiles.telegram_chat_id ──────────────────────────────────────────────

alter table public.profiles add column if not exists telegram_chat_id text;

-- Backfill: prefer chat_id (set by the webhook), fall back to stringified
-- telegram_id, so every existing registered profile immediately becomes a
-- broadcast target and a counted user.
update public.profiles
   set telegram_chat_id = coalesce(chat_id, telegram_id::text)
 where telegram_chat_id is null
   and (chat_id is not null or telegram_id is not null);

-- Keep chat_id in sync from telegram_chat_id for backward compatibility
-- (older code paths and the long-poll bot still read profiles.chat_id).
update public.profiles
   set chat_id = telegram_chat_id
 where chat_id is null
   and telegram_chat_id is not null;

-- Index for fast broadcast + stats lookups (IS NOT NULL / OR scans).
create index if not exists profiles_telegram_chat_id_idx on public.profiles (telegram_chat_id);

-- ── 2) telegram_users.telegram_chat_id ────────────────────────────────────────
-- The webhook registry gains the same column so the broadcast query can use a
-- uniform resolution path across both tables.
alter table public.telegram_users add column if not exists telegram_chat_id text;

update public.telegram_users
   set telegram_chat_id = coalesce(chat_id, telegram_id::text)
 where telegram_chat_id is null
   and (chat_id is not null or telegram_id is not null);

update public.telegram_users
   set chat_id = telegram_chat_id
 where chat_id is null
   and telegram_chat_id is not null;

create index if not exists telegram_users_telegram_chat_id_idx on public.telegram_users (telegram_chat_id);

-- ── 3) Column-level write grants ──────────────────────────────────────────────
-- The Mini App (anon key) cannot insert/update profiles directly (writes go
-- through the service-role-sync endpoint).  The only anon writes are
-- photo_url + telegram_chat_id refresh on existing rows (see lib/mini-app-sync.ts
-- and saveProfilePhoto in lib/profile.ts).  Grant the columns that anon code
-- touches so those updates succeed when a service-role key is NOT configured.
grant update (photo_url, updated_at, telegram_chat_id) on public.profiles to anon;