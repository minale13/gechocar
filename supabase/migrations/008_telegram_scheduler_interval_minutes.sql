-- ============================================================================
-- 008: Telegram scheduler — Hours/Minutes interval timer
-- ============================================================================
-- The Admin → Telegram Auto-Post Scheduler now exposes BOTH an hours field
-- and a minutes field (e.g. every 2 hours 30 minutes). This migration adds
-- the dedicated `interval_minutes` column alongside the existing
-- `interval_hours` column so both parts persist independently.
--
-- HOW TO RUN (once): Supabase Dashboard → SQL Editor → paste → Run.
-- Idempotent — safe to run multiple times.
-- ============================================================================

alter table public.telegram_scheduler
  add column if not exists interval_minutes integer not null default 0;

-- No backfill needed: existing rows keep their interval_hours value and
-- default to 0 extra minutes.