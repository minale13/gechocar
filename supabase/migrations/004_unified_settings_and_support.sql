-- ============================================================================
-- 004: Unified ticket settings (single source of truth) + dynamic support team
-- ============================================================================
-- 1) Ticket Price & Total Tickets are now managed ONLY in app_settings.
--    The lottery_items form no longer collects them; every lottery item
--    inherits the global values at save time (enforced server-side).
--
-- 2) Support Team contact info becomes dynamic: admins edit it from /admin,
--    persisted under the 'support' key in app_settings as JSONB:
--      { "support_username": "@admas_support", "support_contact": "...", "support_phone": "..." }
--    This matches the existing get_support_username() SQL function contract.
--
-- 3) Adds missing INSERT/UPDATE/DELETE RLS policies on app_settings so the
--    admin panel can persist settings from the browser client (previously
--    only a SELECT policy existed, which blocked client-side upserts).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Default global ticket settings (idempotent)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value)
values
  ('app_title', '"Admas Lottery"'),
  ('ticket_price', '2500'),
  ('total_tickets', '10000')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Default support team settings (idempotent — merges into existing row)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value)
values
  ('support', '{"support_username":"@admas_support","support_contact":"@admas_support","support_phone":""}')
on conflict (key) do update set value = public.app_settings.value || excluded.value;

-- ---------------------------------------------------------------------------
-- RLS write policies for app_settings (admin panel persists from the client)
-- ---------------------------------------------------------------------------
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