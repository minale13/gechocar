-- ============================================================================
-- 015: Pending Receipts admin fetch fix
-- ============================================================================
-- Admin "Pending Receipts" reads every payment row AND needs the submitter's
-- user details. The dashboard queries:
--
--     select *, users(username, full_name) from payments
--
-- which relies on a PostgREST-detected relationship payments.user_id → users.id.
--
-- Symptom being fixed:
--   getPaymentReceipts() falls back to the plain select (or returns an empty
--   queue) because the FK relationship is missing / invisible to PostgREST.
--
--   • Migration 014 re-typed user_id to TEXT and only re-created the FK inside
--     its "users.id is not text" branch — databases where users.id was already
--     TEXT (schema.sql) but payments.user_id drifted never got the FK rebuilt.
--   • TypeALTERs do not automatically clear the PostgREST schema cache, so an
--     existing FK can remain invisible ("Could not find a relationship
--     between 'payments' and 'users' in the schema cache").
--
-- This migration is idempotent: it ensures the FK constraint exists and then
-- reloads the PostgREST schema cache so embedded user details resolve on the
-- next query (no server restart required).
-- ============================================================================

-- 1) Guarantee the payments.user_id → users.id FK relationship exists.
--    (Skip if the constraint already exists — either by name or as any FK
--    from payments.user_id to users.id.)
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
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
    alter table public.payments
      add constraint payments_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

-- 2) Fast join / filter path (idempotent — 014 also creates it).
create index if not exists payments_user_id_idx on public.payments (user_id);

-- 3) Force PostgREST to re-read the schema so the payments→users embed
--    relationship is immediately available to the admin receipts query.
notify pgrst, 'reload schema';