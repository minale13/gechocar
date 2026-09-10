-- App settings: SINGLE-ROW table (row id = 1) with dedicated columns —
-- aligned with supabase/migrations/005. The legacy key/value inserts were
-- removed because the live table has no `key`/`value` columns. Idempotent.
insert into public.app_settings (
  id, app_title, logo_url, banner_url, ticket_price, total_tickets, support
)
values (
  1,
  'Admas Lottery',
  '',
  '',
  2500,
  100,
  '{"support_username":"@admas_support","support_contact":"@admas_support","support_phone":""}'::jsonb
)
on conflict (id) do nothing;

insert into public.lotteries (title, vehicle_type, ticket_price, total_tickets, image_url, is_active)
values
  ('1ኛ ዕጣ', 'IVECO', 3000, 3000, 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=900&q=80', true),
  ('2ኛ ዕጣ', 'Isuzu', 3000, 3000, 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=900&q=80', true),
  ('3ኛ ዕጣ', 'Vitz', 3000, 3000, 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80', true)
on conflict do nothing;
