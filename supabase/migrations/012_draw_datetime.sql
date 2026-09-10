-- ---------------------------------------------------------------------------
-- 012: Admin dashboard — draw date/time setting
-- Adds the Draw Date/Time picker target column used by Admin → App Settings.
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists draw_datetime timestamptz;
