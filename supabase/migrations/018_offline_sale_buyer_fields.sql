-- ============================================================================
-- 018 — Offline / Manual sale buyer fields
-- ============================================================================
-- The Admin → Ticket Matrix → "Manual Ticket Sales" flow records offline
-- (walk-in) sales by marking specific ticket numbers 'sold'. To keep track of
-- WHO bought them offline, two nullable columns are added to public.tickets:
--
--   buyer_phone — optional contact phone number captured by the admin
--   buyer_note  — optional free-form note (buyer name, cash amount, etc.)
--
-- Both columns are nullable so online checkout rows are unaffected. The
-- client writes them best-effort and falls back to a status-only write when
-- this migration has not been applied yet (same pattern as migration 011's
-- admin_note handling in lib/admin/management.ts).
-- ============================================================================

alter table public.tickets
  add column if not exists buyer_phone text;

alter table public.tickets
  add column if not exists buyer_note text;
