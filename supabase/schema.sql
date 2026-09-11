create extension if not exists "uuid-ossp";

create type public.user_role as enum ('user', 'admin');
create type public.lottery_vehicle_type as enum ('IVECO', 'Isuzu', 'Vitz');
create type public.ticket_status as enum ('available', 'pending', 'sold');
create type public.payment_status as enum ('pending', 'approved', 'rejected');

create table if not exists public.users (
  -- TEXT (not bigint): ids are numeric Telegram ids, negative guest ids, or
  -- hashed auth ids — all resolved client-side as canonical numeric strings.
  -- See lib/user-identity.ts and supabase/migrations/014_user_id_text.sql.
  id text primary key,
  username text,
  full_name text,
  phone_number text,
  language_preference text,
  language text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

-- Column for databases created before migration 032.
alter table public.users add column if not exists language_preference text;
alter table public.users add column if not exists language text;

create table if not exists public.lotteries (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  location text,
  vehicle_type public.lottery_vehicle_type not null,
  ticket_price numeric not null default 3000,
  total_tickets integer not null default 3000,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.lottery_items (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  price numeric not null default 0,
  tickets integer not null default 0,
  location text,
  image_url text,
  -- Prize rank from the Admin rank dropdown: 1-5 = 1ኛ..5ኛ ዕጣ prizes,
  -- 6 = መጽናኛ ዕጣ (consolation). See migrations/028.
  rank integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default uuid_generate_v4(),
  lottery_id uuid not null references public.lotteries(id) on delete cascade,
  ticket_number text not null,
  user_id text not null references public.users(id) on delete cascade,
  status public.ticket_status not null default 'available',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null references public.users(id) on delete cascade,
  ticket_ids jsonb not null default '[]'::jsonb,
  amount numeric not null,
  receipt_url text,
  transaction_reference text,
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.hero_banners (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  image_url text not null,
  link_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Payment methods / bank accounts managed from the admin panel.
create table if not exists public.payment_methods (
  id uuid primary key default uuid_generate_v4(),
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- App settings: SINGLE-ROW table (always exactly one row, id = 1) with
-- dedicated columns — managed from /admin → App Settings and read by the
-- Host/Home page. Aligned with supabase/migrations/005.
create table if not exists public.app_settings (
  id bigint primary key,
  app_title text,
  logo_url text,
  banner_url text,
  ticket_price numeric,
  total_tickets numeric,
  support jsonb,
  telegram_bot_token text,
  telegram_chat_id text,
  updated_at timestamptz default now()
);

-- Seed the single settings row so reads always find id = 1. Idempotent.
insert into public.app_settings (id, app_title, logo_url, banner_url, ticket_price, total_tickets)
values (1, 'Admas Lottery', '', '', 2500, 100)
on conflict (id) do nothing;

-- Telegram Auto-Post Scheduler configuration (managed from /admin).
-- Aligned with supabase/migrations/007 & 008.
create table if not exists public.telegram_scheduler (
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

alter table public.users enable row level security;
alter table public.lotteries enable row level security;
alter table public.lottery_items enable row level security;
alter table public.hero_banners enable row level security;
alter table public.tickets enable row level security;
alter table public.payments enable row level security;
alter table public.payment_methods enable row level security;
alter table public.app_settings enable row level security;

-- Telegram/anon users have no Supabase auth session, so auth.uid() is always
-- null — the client supplies the bigint user id directly (Telegram id or guest id).
create policy "Users can view own row" on public.users
for select using (true);

create policy "Users can insert own row" on public.users
for insert with check (true);

create policy "Authenticated users can read active lotteries" on public.lotteries
for select using (true);

create policy "Authenticated users can read active lottery items" on public.lottery_items
for select using (true);

create policy "Authenticated users can insert lottery items" on public.lottery_items
for insert with check (true);

create policy "Authenticated users can update lottery items" on public.lottery_items
for update using (true);

create policy "Authenticated users can delete lottery items" on public.lottery_items
for delete using (true);

create policy "Authenticated users can read active hero banners" on public.hero_banners
for select using (true);

create policy "Authenticated users can insert hero banners" on public.hero_banners
for insert with check (true);

create policy "Authenticated users can update hero banners" on public.hero_banners
for update using (true);

create policy "Authenticated users can delete hero banners" on public.hero_banners
for delete using (true);

create policy "Authenticated users can read tickets" on public.tickets
for select using (auth.uid()::text = user_id::text or true);

-- Telegram/anon users have no auth.uid(), so the ownership check would block
-- every insert. The client resolves user_id itself (Telegram id or guest id).
create policy "Authenticated users can insert payment" on public.payments
for insert with check (true);

create policy "Anyone can read active payment methods" on public.payment_methods
for select using (true);

create policy "Authenticated users can insert payment methods" on public.payment_methods
for insert with check (true);

create policy "Authenticated users can update payment methods" on public.payment_methods
for update using (true);

create policy "Authenticated users can delete payment methods" on public.payment_methods
for delete using (true);

create policy "Authenticated users can read app settings" on public.app_settings
for select using (true);

create policy "Authenticated users can insert app settings" on public.app_settings
for insert with check (true);

create policy "Authenticated users can update app settings" on public.app_settings
for update using (true);

create policy "Authenticated users can delete app settings" on public.app_settings
for delete using (true);

create bucket if not exists receipts with public;
create bucket if not exists "public-assets" with public;
-- Public bucket for the app logo uploaded from Admin → App Settings
-- (admin panel uploads with upsert: true to path "app-logo.<ext>").
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

drop policy if exists "Logos are publicly readable" on storage.objects;
create policy "Logos are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'logos');

drop policy if exists "Logos can be uploaded" on storage.objects;
create policy "Logos can be uploaded"
  on storage.objects
  for insert
  with check (bucket_id = 'logos');

drop policy if exists "Logos can be updated" on storage.objects;
create policy "Logos can be updated"
  on storage.objects
  for update
  using (bucket_id = 'logos');

drop policy if exists "Logos can be deleted" on storage.objects;
create policy "Logos can be deleted"
  on storage.objects
  for delete
  using (bucket_id = 'logos');

create policy "Receipts are readable by authenticated users" on storage.objects
for select using (bucket_id = 'receipts');

create policy "Receipts can be uploaded by authenticated users" on storage.objects
for insert with check (bucket_id = 'receipts');

create policy "Receipts can be updated by authenticated users" on storage.objects
for update using (bucket_id = 'receipts');

create policy "Receipts can be deleted by authenticated users" on storage.objects
for delete using (bucket_id = 'receipts');

create policy "Public assets are readable" on storage.objects
for select using (bucket_id = 'public-assets');

create policy "Public assets can be uploaded" on storage.objects
for insert with check (bucket_id = 'public-assets');

create policy "Public assets can be updated" on storage.objects
for update using (bucket_id = 'public-assets');

create policy "Public assets can be deleted" on storage.objects
for delete using (bucket_id = 'public-assets');

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
-- Telegram registration tables — the /start webhook target.
-- Aligned with supabase/migrations/023 (profiles) & 025 (telegram_users,
-- chat_id broadcast registry) and the broadcast query in lib/admin/management.ts.

-- public.profiles — registration target created by scripts/telegram-bot.mjs
-- (phone share) and mirrored by the /api/telegram/webhook on every /start.
-- Also upserted by POST /api/user/sync for Mini App-only users.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique,
  first_name text,
  last_name text,
  username text,
  phone_number text,
  language_preference text,
  language text,
  -- Personal chat id — broadcast target.  chat_id is the original column
  -- (migration 025); telegram_chat_id is the canonical string-typed id
  -- (migration 027) set by sync / webhook / bot on every registration path.
  -- The broadcast + stats queries OR on both: telegram_chat_id IS NOT NULL
  -- OR telegram_id IS NOT NULL — so every profile with a Telegram identity
  -- is a target.  Use telegram_chat_id if present, fall back to telegram_id.
  chat_id text,
  telegram_chat_id text,
  photo_url text,
  -- Mini App usage tracking (migration 026) — /api/user/sync refreshes
  -- last_opened_at on every Mini App open; powers the admin user analytics.
  last_opened_at timestamptz,
  is_registered boolean not null default false,
  is_blocked boolean not null default false,
  wallet_balance numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_telegram_id_key on public.profiles (telegram_id);
create index if not exists profiles_phone_number_idx on public.profiles (phone_number);
create index if not exists profiles_username_idx    on public.profiles (username);
create index if not exists profiles_chat_id_idx      on public.profiles (chat_id);
create index if not exists profiles_telegram_chat_id_idx on public.profiles (telegram_chat_id);
create index if not exists profiles_last_opened_at_idx on public.profiles (last_opened_at);
create index if not exists profiles_is_registered_idx on public.profiles (is_registered);

-- Columns for databases created before migration 026 / 027.
alter table public.profiles add column if not exists last_opened_at timestamptz;
alter table public.profiles add column if not exists is_registered boolean not null default false;
alter table public.profiles add column if not exists telegram_chat_id text;
alter table public.profiles add column if not exists is_blocked boolean not null default false;
alter table public.profiles add column if not exists wallet_balance numeric not null default 0;
alter table public.profiles add column if not exists language_preference text;
alter table public.profiles add column if not exists language text;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

drop policy if exists "profiles_update_photo" on public.profiles;
create policy "profiles_update_photo"
  on public.profiles for update
  using (true)
  with check (true);

-- Anon writes: photo_url + telegram_chat_id only (columns the Mini App
-- touches directly).  Full profile writes go through the service-role sync
-- endpoint.
revoke update on table public.profiles from anon;
grant update (photo_url, updated_at, telegram_chat_id) on public.profiles to anon;

-- Dedicated webhook registration registry — one row per Telegram user that
-- ever contacted the bot (/start or any direct message), regardless of Mini
-- App onboarding. chat_id and telegram_chat_id are broadcast targets.
create table if not exists public.telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique,
  chat_id text,
  -- String-typed Telegram personal chat id (same as telegram_id::text in a
  -- private chat).  Set by the webhook + bot so the broadcast query can OR
  -- across telegram_chat_id / chat_id / telegram_id uniformly.
  telegram_chat_id text,
  first_name text,
  last_name text,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_users_telegram_id_key on public.telegram_users (telegram_id);
create index if not exists telegram_users_chat_id_idx      on public.telegram_users (chat_id);
create index if not exists telegram_users_telegram_chat_id_idx on public.telegram_users (telegram_chat_id);

alter table public.telegram_users enable row level security;

drop policy if exists "telegram_users_select_all" on public.telegram_users;
create policy "telegram_users_select_all"
  on public.telegram_users for select
  using (true);