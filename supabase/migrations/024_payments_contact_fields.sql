-- ---------------------------------------------------------------------------
-- 024: payments contact fields (Mini App → Supabase purchase attribution)
--
-- The Mini App checkout (components/app/checkout-modal.tsx) attaches the
-- buyer's bot-registered identity to every ticket purchase transaction:
--
--   telegram_id  — the buyer's Telegram user id (TEXT, canonical numeric —
--                  same value as profiles.telegram_id / tickets.user_id).
--   phone_number — the buyer's registered phone (from public.profiles,
--                  captured by the bot's «ስልክ አጋራ» reply-keyboard button).
--
-- tickets.buyer_phone already exists (migration 018) — the checkout also
-- stamps it on the reserved ticket rows. Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

alter table public.payments add column if not exists telegram_id text;
alter table public.payments add column if not exists phone_number text;

-- Speed up admin lookups by phone / telegram id.
create index if not exists payments_phone_number_idx on public.payments (phone_number);
create index if not exists payments_telegram_id_idx on public.payments (telegram_id);

-- Make the new columns immediately visible to PostgREST (anon-key inserts).
notify pgrst, 'reload schema';
