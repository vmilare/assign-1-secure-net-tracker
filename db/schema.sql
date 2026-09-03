-- ===========================================================================
-- Secure Networking Tracker — schema, constraints, and Row Level Security.
-- Run once in the Neon SQL Editor (or: psql "$DATABASE_URL" -f db/schema.sql).
-- Safe to re-run: every statement is idempotent.
-- ===========================================================================

create extension if not exists pgcrypto;   -- provides gen_random_uuid()

-- --- Table -----------------------------------------------------------------
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),

  -- Ownership. text, NOT NULL, defaulted from the caller's JWT.
  -- Because this defaults to auth.user_id(), clients never send user_id at all;
  -- the database stamps the true owner. A spoofed user_id is therefore
  -- impossible to insert even by calling the public Data API directly.
  user_id    text        not null default auth.user_id(),

  name       text        not null,
  company    text,
  role       text,
  where_met  text,
  notes      text,
  priority   text        not null default 'medium',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Trusted validation. These run inside Postgres, so they hold even when a
  -- request bypasses the Next.js route handlers and hits the Data API directly.
  constraint contacts_name_not_blank  check (length(btrim(name)) > 0),
  constraint contacts_priority_valid  check (priority in ('high', 'medium', 'low'))
);

-- Keep updated_at honest.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- Sorting and filtering hit these columns.
create index if not exists contacts_user_id_created_at_idx
  on public.contacts (user_id, created_at desc);

-- --- Row Level Security ----------------------------------------------------
alter table public.contacts enable row level security;

-- Also apply RLS to the table owner. Without this, a superuser/owner
-- connection silently bypasses every policy below.
alter table public.contacts force row level security;

drop policy if exists contacts_select_own on public.contacts;
drop policy if exists contacts_insert_own on public.contacts;
drop policy if exists contacts_update_own on public.contacts;
drop policy if exists contacts_delete_own on public.contacts;

-- SELECT: you may read only your own rows.
create policy contacts_select_own on public.contacts
  for select to authenticated
  using (auth.user_id() = user_id);

-- INSERT: the row you create must belong to you.
create policy contacts_insert_own on public.contacts
  for insert to authenticated
  with check (auth.user_id() = user_id);

-- UPDATE: USING picks which rows you may target;
--         WITH CHECK re-validates the row AFTER your edit, which is what stops
--         you rewriting user_id to hand a row to (or steal it from) someone else.
create policy contacts_update_own on public.contacts
  for update to authenticated
  using      (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

-- DELETE: you may delete only your own rows.
create policy contacts_delete_own on public.contacts
  for delete to authenticated
  using (auth.user_id() = user_id);

-- --- Grants ----------------------------------------------------------------
-- Table-level permission for signed-in callers. RLS still filters row by row.
-- The anonymous role is granted nothing, so signed-out callers see nothing.
grant select, insert, update, delete on public.contacts to authenticated;
grant usage on schema public to authenticated;
