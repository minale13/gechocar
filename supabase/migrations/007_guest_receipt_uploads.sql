-- ---------------------------------------------------------------------------
-- 007: Allow guest / anonymous receipt uploads to the `receipts` storage bucket
--
-- The checkout flow (components/app/checkout-modal.tsx) uploads receipt photos
-- from the browser using the anon key. None of the submitting users (Telegram
-- Mini App users, guest users, or plain browsers) have a Supabase auth
-- session, so auth.role() is always 'anon' and the previous
-- auth.role() = 'authenticated' policies rejected every upload with:
--   "new row violates row-level security policy"
--
-- This migration makes the `receipts` bucket public and writable/readable by
-- anonymous clients, so the upload succeeds and the payment row can reference
-- the returned public URL.
--
-- Run this in the Supabase SQL editor (idempotent).
-- ---------------------------------------------------------------------------

-- Make sure the bucket exists and is public (readable without auth).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = true;

-- Policy names from supabase/migrations/001_init.sql
drop policy if exists "Allow receipt uploads for authenticated" on storage.objects;
create policy "Allow receipt uploads for authenticated" on storage.objects
  for insert with check (bucket_id = 'receipts');

drop policy if exists "Allow receipt reads for authenticated" on storage.objects;
create policy "Allow receipt reads for authenticated" on storage.objects
  for select using (bucket_id = 'receipts');

drop policy if exists "Allow receipt updates for authenticated" on storage.objects;
create policy "Allow receipt updates for authenticated" on storage.objects
  for update using (bucket_id = 'receipts');

drop policy if exists "Allow receipt deletes for authenticated" on storage.objects;
create policy "Allow receipt deletes for authenticated" on storage.objects
  for delete using (bucket_id = 'receipts');

-- Policy names from supabase/schema.sql
drop policy if exists "Receipts can be uploaded by authenticated users" on storage.objects;
create policy "Receipts can be uploaded by authenticated users" on storage.objects
  for insert with check (bucket_id = 'receipts');

drop policy if exists "Receipts are readable by authenticated users" on storage.objects;
create policy "Receipts are readable by authenticated users" on storage.objects
  for select using (bucket_id = 'receipts');

drop policy if exists "Receipts can be updated by authenticated users" on storage.objects;
create policy "Receipts can be updated by authenticated users" on storage.objects
  for update using (bucket_id = 'receipts');

drop policy if exists "Receipts can be deleted by authenticated users" on storage.objects;
create policy "Receipts can be deleted by authenticated users" on storage.objects
  for delete using (bucket_id = 'receipts');