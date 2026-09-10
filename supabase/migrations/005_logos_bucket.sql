-- ============================================================================
-- 005: Public "logos" storage bucket for the Admin → App Settings logo upload
-- ============================================================================
-- The admin panel uploads the app logo to Supabase Storage bucket "logos"
-- (with upsert: true) and then persists the public URL in app_settings.
-- This bucket was never created by schema.sql (only "receipts" and
-- "public-assets" existed), so every logo upload failed with
-- "Bucket not found" / "Failed to save logo".
--
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- Create the public bucket (upsert keeps it public if it already exists).
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

-- Anyone may read logo objects (public URLs are used across the app).
drop policy if exists "Logos are publicly readable" on storage.objects;
create policy "Logos are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'logos');

-- Authenticated/anon clients may upload (admin panel uses upsert: true,
-- which performs an insert-or-update on the same object path).
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