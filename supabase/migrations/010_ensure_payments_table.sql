-- ---------------------------------------------------------------------------
-- 010: Ensure the public.payments table exists (+ reload PostgREST schema cache)
--
-- Symptom in the browser:
--   "Could not find the table 'public.payments' in the schema cache"
--   (PostgREST error code PGRST205)
--
-- Cause: the live database was created from an older/partial set of SQL files,
-- so the public.payments table (or one of its columns) is missing, or the
-- PostgREST schema cache has not picked up newly created tables.
--
-- This migration is fully idempotent: it creates the table if missing, adds
-- any column that is missing, opens RLS for guest/Telegram inserts, and asks
-- PostgREST to reload its schema cache so the table becomes visible
-- immediately — no dashboard restart needed.
--
-- Run this in the Supabase SQL editor (idempotent).
-- ---------------------------------------------------------------------------

-- 1) Make sure the payment_status enum exists before the table references it.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

-- 2) Create the table if it does not exist (mirrors supabase/schema.sql).
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

-- 3) Make sure every column the checkout inserts actually exists.
alter table public.payments add column if not exists user_id text;
alter table public.payments add column if not exists ticket_ids jsonb not null default '[]'::jsonb;
alter table public.payments add column if not exists amount numeric;
alter table public.payments add column if not exists receipt_url text;
alter table public.payments add column if not exists transaction_reference text;

-- status is an enum column; only add it if it is missing.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'status'
  ) then
    alter table public.payments
      add column status public.payment_status not null default 'pending';
  end if;
end $$;

-- 4) RLS: allow the browser (anon / Telegram guest users) to insert payments.
alter table public.payments enable row level security;

drop policy if exists "Authenticated users can insert payment" on public.payments;
create policy "Authenticated users can insert payment" on public.payments
  for insert with check (true);

drop policy if exists "Insert payment as owner" on public.payments;
create policy "Insert payment as owner" on public.payments
  for insert with check (true);

drop policy if exists "Payments are readable" on public.payments;
create policy "Payments are readable" on public.payments
  for select using (true);

drop policy if exists "Payments can be updated" on public.payments;
create policy "Payments can be updated" on public.payments
  for update using (true);

-- 4) Reload the PostgREST schema cache so 'payments' is immediately visible
--    (clears the "Could not find the table ... in the schema cache" error).
notify pgrst, 'reload schema';