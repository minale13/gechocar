-- ---------------------------------------------------------------------------
-- 013: Lottery item draw date/time
-- Adds the per-lottery Draw Date/Time column used by Admin → Lottery
-- Management ("ዕጣ ማስገቢያ") so each draw can launch with its own schedule.
-- ---------------------------------------------------------------------------

alter table public.lottery_items
  add column if not exists draw_datetime timestamptz;
