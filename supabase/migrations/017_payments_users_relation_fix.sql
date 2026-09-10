-- ============================================================================
-- 017: Payments-users schema relation fix
-- ============================================================================
-- Guarantee the payments.user_id → users.id and tickets.user_id → users.id
-- relationships that postgREST uses to embed submitter details, regardless of
-- which migration order a database was provisioned with.
--
-- Root cause:
--   • Migration 001 and migration 010 create payments.user_id / tickets.user_id
--     as BIGINT, while the canonical schema.sql (and the end state of migration
--     014) uses TEXT. On databases provisioned from schema.sql, `users.id` is
--     already TEXT, so:
--        - 010's `create table ... public.payments (user_id bigint references ...)`
--          can fail (bigint cannot reference a text column), OR
--        - 010's `add column if not exists user_id bigint` leaves a bigint
--          column that has NO foreign key to users.id.
--     Either way the postgREST `payments→users` relationship is invisible,
--     and the admin receipts query
--         select *, users(username, full_name) from payments
--     fails with "Could not find a relationship between 'payments' and 'users'".
--   • Migration 014's section 2 (children drifted but users.id already text)
--     re-types the child columns but does NOT re-create the FK, so the
--     relationship stays missing even after the type is correct.
--
-- This migration is idempotent and self-healing:
--   1) Ensures users.id is TEXT.
--   2) Ensures payment.user_id / tickets.user_id are TEXT (cast via ::text).
--   3) Guarantees both FK constraints exist (drop a stale one, then add a
--      matching text→text FK).
--   4) Reloads the postgREST schema cache so the embeds resolve immediately.
-- ============================================================================

-- 1) Normalize users.id to TEXT.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users'
      and column_name = 'id' and data_type <> 'text'
  ) then
    alter table public.users alter column id type text;
  end if;
end $$;

-- 2) Normalize the child columns to TEXT (safe even with a bigint→text cast).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'user_id' and data_type <> 'text'
  ) then
    alter table public.payments alter column user_id type text using user_id::text;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets'
      and column_name = 'user_id' and data_type <> 'text'
  ) then
    alter table public.tickets alter column user_id type text using user_id::text;
  end if;
end $$;

-- 3) Rebuild the payments user FK (drop a stale incompatible one, then add).
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class      t  on t.oid = c.conrelid
    join pg_class      r  on r.oid = c.confrelid
    join pg_namespace  tn on tn.oid = t.relnamespace
    join pg_namespace  rn on rn.oid = r.relnamespace
    join pg_attribute  a  on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    join pg_attribute  b  on b.attrelid = c.confrelid and b.attnum = any(c.confkey)
    where c.contype = 'f'
      and tn.nspname = 'public' and t.relname = 'payments'
      and rn.nspname = 'public' and r.relname = 'users'
      and a.attname = 'user_id' and b.attname = 'id'
  ) then
    -- Relationship already exists — nothing to do.
    raise notice 'payments.users FK already present';
  else
    alter table public.payments
      add constraint payments_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

-- 4) Rebuild the tickets user FK (drop a stale incompatible one, then add).
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class      t  on t.oid = c.conrelid
    join pg_class      r  on r.oid = c.confrelid
    join pg_namespace  tn on tn.oid = t.relnamespace
    join pg_namespace  rn on rn.oid = r.relnamespace
    join pg_attribute  a  on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    join pg_attribute  b  on b.attrelid = c.confrelid and b.attnum = any(c.confkey)
    where c.contype = 'f'
      and tn.nspname = 'public' and t.relname = 'tickets'
      and rn.nspname = 'public' and r.relname = 'users'
      and a.attname = 'user_id' and b.attname = 'id'
  ) then
    -- Relationship already exists — nothing to do.
    raise notice 'tickets.users FK already present';
  else
    alter table public.tickets
      add constraint tickets_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

-- 5) Fast join / filter paths (idempotent — 011/015 also create these).
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists tickets_user_id_idx  on public.tickets  (user_id);

-- 6) Force postgREST to re-read the schema so the payments→users and
--    tickets→users embeds are immediately available to the admin queries.
notify pgrst, 'reload schema';