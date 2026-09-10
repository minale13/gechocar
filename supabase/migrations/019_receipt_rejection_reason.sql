-- ============================================================================
-- 019: Receipt Rejection Reason
-- ============================================================================
-- Adds a dedicated payments.rejection_reason column so admins can record WHY a
-- pending receipt was rejected and the Mini App can show the exact reason next
-- to the red "Rejected" badge on the user's Profile / History screen.
--
-- payments.admin_note (migration 011) is kept for backward compatibility — the
-- rejection flow now writes BOTH fields, but reads prefer rejection_reason.
-- ============================================================================

alter table public.payments
  add column if not exists rejection_reason text;

-- The admin receipt approve/reject RLS (migration 016) already grants UPDATE
-- on all columns, so no extra policy is required for this new column.
