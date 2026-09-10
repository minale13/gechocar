-- ---------------------------------------------------------------------------
-- 008: Add missing payments.transaction_reference column
--
-- supabase/schema.sql defines payments.transaction_reference text, but
-- supabase/migrations/001_init.sql never created it. On databases initialized
-- from the migrations, every checkout insert that includes
-- transaction_reference fails with:
--   "Could not find the 'transaction_reference' column of 'payments' ..."
-- which surfaced to users as "Failed to submit receipt".
--
-- Run this in the Supabase SQL editor (idempotent).
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists transaction_reference text;