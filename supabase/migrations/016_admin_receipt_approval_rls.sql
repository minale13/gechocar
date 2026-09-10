-- ============================================================================
-- 016: Admin receipt approval / rejection — guaranteed RLS update policies
-- ============================================================================
-- Symptom being fixed:
--   Clicking "Approve" / "Reject" on a receipt silently failed — the payment
--   row stayed 'pending'. When SUPABASE_SERVICE_ROLE_KEY is NOT configured the
--   server performs the write with the anon key, so the mutation is subject
--   to Row Level Security. The live database may lack an UPDATE policy on
--   public.payments (schema.sql defines an INSERT policy but no UPDATE policy;
--   migration 010's "Payments can be updated" policy may not have been applied,
--   and migration 011 only added a SELECT policy for read access).
--
-- This migration guarantees, idempotently, that:
--   1) An anon/authenticated client can UPDATE the status + admin_note on
--      public.payments (used by the admin receipt approve/reject flow).
--   2) An anon/authenticated client can UPDATE (and INSERT) rows in
--      public.tickets so approving/rejecting can flip pending → sold or
--      pending → available without a relational RLS error.
--
-- Safe to re-run any number of times.
-- ============================================================================

-- 1) public.payments — allow status/admin_note updates.
drop policy if exists "Payments can be updated" on public.payments;
create policy "Payments can be updated" on public.payments
  for update using (true);

-- 2) public.tickets — approve marks numbers sold / reject releases them back.
drop policy if exists "Users can update tickets" on public.tickets;
create policy "Users can update tickets" on public.tickets
  for update using (true);

drop policy if exists "Users can reserve tickets" on public.tickets;
create policy "Users can reserve tickets" on public.tickets
  for insert with check (true);

-- 3) Make the new policies visible to PostgREST immediately.
notify pgrst, 'reload schema';