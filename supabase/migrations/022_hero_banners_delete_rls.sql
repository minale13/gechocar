-- ============================================================================
-- 022: hero_banners RLS — guaranteed anon/authenticated DELETE (+ CRUD)
-- ============================================================================
-- The Admin dashboard (/admin) manages hero banners with the anon-key Supabase
-- client (there is no Supabase Auth session in the dashboard), so EVERY
-- hero_banners policy must explicitly cover the `anon` role. If the DELETE
-- policy from migration 002 was never applied (or was dropped), deletes either
-- fail with RLS 42501 / PGRST301 / 403 — or, worse, silently affect 0 rows.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- Full CRUD grants (Supabase defaults usually cover this, but re-assert so a
-- revoked grant can never block the admin dashboard).
grant select, insert, update, delete on public.hero_banners to anon, authenticated;

-- ── SELECT ──
drop policy if exists "Authenticated users can read active hero banners" on public.hero_banners;
create policy "Anyone can read hero banners"
  on public.hero_banners
  for select
  to anon, authenticated
  using (true);

-- ── INSERT ──
drop policy if exists "Authenticated users can insert hero banners" on public.hero_banners;
create policy "Admin dashboard can insert hero banners"
  on public.hero_banners
  for insert
  to anon, authenticated
  with check (true);

-- ── UPDATE ──
drop policy if exists "Authenticated users can update hero banners" on public.hero_banners;
create policy "Admin dashboard can update hero banners"
  on public.hero_banners
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- ── DELETE (the fix) ──
drop policy if exists "Authenticated users can delete hero banners" on public.hero_banners;
create policy "Admin dashboard can delete hero banners"
  on public.hero_banners
  for delete
  to anon, authenticated
  using (true);

-- Refresh PostgREST's schema cache so the policies are visible immediately
-- (harmless no-op if the helper from migration 020 is not deployed).
notify pgrst, 'reload schema';
