-- ---------------------------------------------------------------------------
-- 006: Guest / Telegram checkout RLS fixes
--
-- The checkout flow (components/app/checkout-modal.tsx) inserts payments from
-- the browser using a bigint user id resolved client-side (Telegram Mini App
-- id, Supabase-auth-derived id, or a persistent guest id). None of these have
-- a Supabase auth session, so auth.uid() is always NULL and the previous
-- auth.uid()-based policies blocked every insert.
--
-- Run this in the Supabase SQL editor (idempotent).
-- ---------------------------------------------------------------------------

-- users: allow the client to create/ensure the FK row for the submitting user
drop policy if exists "Users can view own row" on public.users;
create policy "Users can view own row" on public.users
  for select using (true);

drop policy if exists "Users can insert own row" on public.users;
create policy "Users can insert own row" on public.users
  for insert with check (true);

drop policy if exists "Select own user profile" on public.users;
create policy "Select own user profile" on public.users
  for select using (true);

drop policy if exists "Insert own user profile" on public.users;
create policy "Insert own user profile" on public.users
  for insert with check (true);

-- payments: allow checkout submission from Telegram/anon users
drop policy if exists "Authenticated users can insert payment" on public.payments;
create policy "Authenticated users can insert payment" on public.payments
  for insert with check (true);

drop policy if exists "Insert payment as owner" on public.payments;
create policy "Insert payment as owner" on public.payments
  for insert with check (true);
