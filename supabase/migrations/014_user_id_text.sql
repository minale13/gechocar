-- 014_user_id_text.sql
-- Aligns every user-id column to TEXT so BOTH identity formats are accepted:
--   • numeric Telegram Mini App ids (e.g. "4502572551" or "-4502572551053578")
--   • persistent guest ids (negative numeric strings from localStorage)
-- Previously a drifted live schema could type users.id / payments.user_id /
-- tickets.user_id as uuid (or bigint), which made any non-UUID / out-of-range
-- id fail with:
--     'invalid input syntax for type uuid'
--     'bigint out of range'
-- TEXT accepts every format the client sends. Idempotent — safe to re-run.

-- ── 1) public.users.id ────────────────────────────────────────────────────────
-- Drop the FK dependency first (payments/tickets reference users.id), convert,
-- then re-create the constraints against the text-typed column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users'
      and column_name = 'id' and data_type <> 'text'
  ) then
    -- Remove inbound FKs so the type change is allowed.
    alter table public.payments drop constraint if exists payments_user_id_fkey;
    alter table public.tickets  drop constraint if exists tickets_user_id_fkey;

    -- Any UUID ids (drifted schema) are deterministically mapped to negative
    -- numeric strings so existing rows remain distinguishable and non-null.
    update public.users
       set id = '-' || (abs(hashtext(id::text))::text)
     where id !~ '^-?[0-9]+$';

    alter table public.users alter column id type text;

    -- Same normalization for child tables, so FK joins keep matching.
    update public.payments
       set user_id = '-' || (abs(hashtext(user_id::text))::text)
     where user_id is not null and user_id::text !~ '^-?[0-9]+$';

    update public.tickets
       set user_id = '-' || (abs(hashtext(user_id::text))::text)
     where user_id is not null and user_id::text !~ '^-?[0-9]+$';

    alter table public.payments alter column user_id type text using user_id::text;
    alter table public.tickets  alter column user_id type text using user_id::text;

    -- Restore the referential integrity.
    alter table public.payments
      add constraint payments_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
    alter table public.tickets
      add constraint tickets_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

-- ── 2) Child tables when users.id is already text but children drifted ──────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'user_id' and data_type <> 'text'
  ) then
    alter table public.payments
      alter column user_id type text using user_id::text;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets'
      and column_name = 'user_id' and data_type <> 'text'
  ) then
    alter table public.tickets
      alter column user_id type text using user_id::text;
  end if;
end $$;

-- ── 3) Lookups stay fast with a plain text index ─────────────────────────────
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists tickets_user_id_idx  on public.tickets  (user_id);
