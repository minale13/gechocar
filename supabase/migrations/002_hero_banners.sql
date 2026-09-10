-- Hero Banner System
-- Add hero_banners table for homepage promotional banners managed from /admin

create table if not exists public.hero_banners (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  image_url text not null,
  link_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.hero_banners enable row level security;

create policy "Authenticated users can read active hero banners" on public.hero_banners
for select using (true);

create policy "Authenticated users can insert hero banners" on public.hero_banners
for insert with check (true);

create policy "Authenticated users can update hero banners" on public.hero_banners
for update using (true);

create policy "Authenticated users can delete hero banners" on public.hero_banners
for delete using (true);