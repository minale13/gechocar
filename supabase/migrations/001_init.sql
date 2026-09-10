create extension if not exists "uuid-ossp";

create type public.user_role as enum ('user', 'admin');
create type public.lottery_vehicle_type as enum ('IVECO', 'Isuzu', 'Vitz');
create type public.ticket_status as enum ('available', 'pending', 'sold');
create type public.payment_status as enum ('pending', 'approved', 'rejected');

create table if not exists public.users (
  id bigint primary key,
  username text,
  full_name text,
  phone_number text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

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
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

alter table public.users enable row level security;
alter table public.lotteries enable row level security;
alter table public.tickets enable row level security;
alter table public.payments enable row level security;
alter table public.app_settings enable row level security;

create policy "Select own user profile" on public.users for select using (auth.uid()::text = id::text);
create policy "Insert own user profile" on public.users for insert with check (auth.uid()::text = id::text);
create policy "Read active lotteries" on public.lotteries for select using (true);
create policy "Read tickets for own or public" on public.tickets for select using (true);

create policy "Read settings for all" on public.app_settings for select using (true);

create storage bucket if not exists receipts;

create policy "Allow receipt uploads for authenticated" on storage.objects
for insert with check (bucket_id = 'receipts' and auth.role() = 'authenticated');

create policy "Allow receipt reads for authenticated" on storage.objects
for select using (bucket_id = 'receipts' and auth.role() = 'authenticated');

create policy "Allow receipt updates for authenticated" on storage.objects
for update using (bucket_id = 'receipts' and auth.role() = 'authenticated');

create policy "Allow receipt deletes for authenticated" on storage.objects
for delete using (bucket_id = 'receipts' and auth.role() = 'authenticated');
