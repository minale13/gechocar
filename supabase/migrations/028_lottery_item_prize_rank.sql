-- ---------------------------------------------------------------------------
-- 028: Prize rank for raffle items (rank dropdown)
-- The Raffle Item form now collects the prize rank via a dropdown
-- (1ኛ ዕጣ … 5ኛ ዕጣ + መጽናኛ ዕጣ consolation). lottery_items.rank already exists on
-- databases initialized from supabase/schema.sql / migration 001; this
-- migration guarantees the column exists everywhere and documents the mapping.
--
--   rank 1 = 1ኛ ዕጣ      (1st Prize)
--   rank 2 = 2ኛ ዕጣ      (2nd Prize)
--   rank 3 = 3ኛ ዕጣ      (3rd Prize)
--   rank 4 = 4ኛ ዕጣ      (4th Prize)
--   rank 5 = 5ኛ ዕጣ      (5th Prize)
--   rank 6 = መጽናኛ ዕጣ   (Consolation)
-- ---------------------------------------------------------------------------

alter table public.lottery_items
  add column if not exists rank integer not null default 0;

comment on column public.lottery_items.rank is
  'Prize rank: 1-5 = 1st..5th prize, 6 = መጽናኛ (consolation).';