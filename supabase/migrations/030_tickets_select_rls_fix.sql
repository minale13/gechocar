-- ============================================================================
-- 030: tickets SELECT RLS guarantee
-- ============================================================================
-- The Admin Ticket Matrix (components/admin/tickets-tab.tsx) and the Mini App
-- availability grid (components/app/ticket-selection.tsx) read public.tickets
-- with the anon-key browser client. If the live database was initialized
-- before migration 001's permissive SELECT policy — or the policy was
-- tightened/removed — Row Level Security silently returns ZERO rows and the
-- matrix shows every ticket as 'available' even though pending/sold rows
-- exist ("missing ticket data").
--
-- The Admin dashboard now ALSO reads statuses through the service-role
-- endpoint GET /api/admin/ticket-matrix (RLS-proof), but the client-side
-- sources below still require this policy to see active ticket statuses.
--
-- Idempotent — safe to run more than once.
-- ============================================================================

drop policy if exists "Read tickets for own or public" on public.tickets;
create policy "Read tickets for own or public"
  on public.tickets
  for select
  using (true);
