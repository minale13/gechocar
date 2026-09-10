-- Add transaction_reference column to payments table
-- Allows users to submit a transaction reference number as an alternative to (or in
-- addition to) uploading a receipt image when completing a ticket purchase.

alter table public.payments
  add column if not exists transaction_reference text;

-- Index to speed up lookups by transaction reference (used by admin review)
create index if not exists payments_transaction_reference_idx
  on public.payments (transaction_reference);
