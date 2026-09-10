-- ---------------------------------------------------------------------------
-- 011: Receipt Approval & Rejection workflow support
--
-- 1) payments.admin_note — optional note written by the admin when rejecting
--    a receipt. Surfaced to the user in the Mini App "Pending" tab.
-- 2) tickets.lottery_id becomes optional: the checkout flow is global
--    (ticket price / total tickets come from app_settings), so reserved
--    tickets are created without a lottery reference.
-- 3) RLS: payments must be readable (Mini App "Pending" tab queries the
--    user's submissions) and tickets must be insertable/updatable so the
--    checkout can reserve numbers and the admin approval can flip them to
--    sold / release them back to available.
-- ---------------------------------------------------------------------------

-- Optional admin note attached when a receipt is rejected.
alter table public.payments
  add column if not exists admin_note text;

-- Reserved tickets are not tied to a specific lottery row.
alter table public.tickets
  alter column lottery_id drop not null;

-- Fast lookups by ticket number (approve/reject scoping) and by user
-- (the Mini App pending tab + ticket availability grid).
create index if not exists tickets_ticket_number_idx
  on public.tickets (ticket_number);

create index if not exists payments_user_id_created_at_idx
  on public.payments (user_id, created_at desc);

-- Read access to payment submissions (the Mini App pending tab lists the
-- user's own receipts). Anonymous Telegram users have no auth.uid(), so —
-- like the insert policy below — the check is permissive on purpose.
drop policy if exists "Users can read payment submissions" on public.payments;
create policy "Users can read payment submissions"
  on public.payments
  for select using (true);

-- Ticket reservation at checkout (insert) and approve/reject transitions
-- (update) must be allowed for the same anonymous users.
drop policy if exists "Users can reserve tickets" on public.tickets;
create policy "Users can reserve tickets"
  on public.tickets
  for insert with check (true);

drop policy if exists "Users can update tickets" on public.tickets;
create policy "Users can update tickets"
  on public.tickets
  for update using (true);
