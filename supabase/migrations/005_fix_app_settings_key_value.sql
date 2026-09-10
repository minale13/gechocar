-- ============================================================================
-- 005: app_settings — canonical SINGLE-ROW schema (aligned with production)
-- ============================================================================
-- PRODUCTION CONTRACT (table reset manually in the Supabase dashboard):
--
--     create table public.app_settings (
--       id            bigint primary key,   -- exactly ONE row: id = 1
--       app_title     text,
--       logo_url      text,
--       banner_url    text,
--       ticket_price  numeric,
--       total_tickets numeric,
--       updated_at    timestamptz
--     );
--
-- Every query targets row id = 1:
--     .from("app_settings").select(...).eq("id", 1)
--     .upsert({ id: 1, ... }, { onConflict: "id" })
--
-- HISTORY: earlier revisions described a key/value shape (one row per setting)
-- and, before that, other column sets — both obsolete. This revision aligns
-- the SQL with the live table and adds, idempotently, the auxiliary columns
-- used by other admin features:
--   support             jsonb — Support Manager ({support_username, ...})
--   telegram_bot_token  text  — Telegram Bot Settings
--   telegram_chat_id    text  — Telegram Bot Settings
--
-- HOW TO RUN (once, after the manual reset)
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Ensure the auxiliary columns exist (core columns are managed by the
--    manual reset and are NOT altered here). Idempotent.
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column if not exists updated_at timestamptz default now();

alter table public.app_settings
  add column if not exists support jsonb;

alter table public.app_settings
  add column if not exists telegram_bot_token text;

alter table public.app_settings
  add column if not exists telegram_chat_id text;

-- Ensure the single settings row exists (id = 1). Idempotent.
insert into public.app_settings (id, app_title, logo_url, banner_url, ticket_price, total_tickets)
values (1, 'Admas Lottery', '', '', 2500, 100)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Seed defaults for the auxiliary columns (idempotent merge)
-- ---------------------------------------------------------------------------
update public.app_settings
set support = coalesce(support, '{}'::jsonb) ||
  '{"support_username":"@admas_support","support_contact":"@admas_support","support_phone":""}'::jsonb
where id = 1;

-- ---------------------------------------------------------------------------
-- 3) RLS policies so the admin panel can persist settings from the browser
--    client. Idempotent.
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;

drop policy if exists "Authenticated users can read app settings" on public.app_settings;
create policy "Authenticated users can read app settings"
  on public.app_settings
  for select using (true);

drop policy if exists "Authenticated users can insert app settings" on public.app_settings;
create policy "Authenticated users can insert app settings"
  on public.app_settings
  for insert with check (true);

drop policy if exists "Authenticated users can update app settings" on public.app_settings;
create policy "Authenticated users can update app settings"
  on public.app_settings
  for update using (true);

drop policy if exists "Authenticated users can delete app settings" on public.app_settings;
create policy "Authenticated users can delete app settings"
  on public.app_settings
  for delete using (true);

-- ---------------------------------------------------------------------------
-- 4) get_support_username() reads the support JSONB of row id = 1
-- ---------------------------------------------------------------------------
create or replace function public.get_support_username()
returns text
language sql
stable
as $$
  select coalesce((support->>'support_username')::text, '@admas_support')
  from public.app_settings
  where id = 1
  limit 1;
$$;
