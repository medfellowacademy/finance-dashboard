-- Medfellow Finance – Phase 1: foundation
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- All money values are stored in paise (integer) to avoid rounding errors.


-- ───────────── enums ─────────────
do $$ begin
  create type public.app_role as enum ('owner', 'finance', 'dept_head', 'dept_user', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.txn_kind as enum ('in', 'out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_type as enum ('bank', 'upi', 'cash', 'gateway');
exception when duplicate_object then null; end $$;

-- ───────────── tables ─────────────
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- payments above this amount (paise) need Owner approval; null = no limit set
  approval_limit_paise bigint check (approval_limit_paise is null or approval_limit_paise >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.app_role not null default 'viewer',
  department_id uuid references public.departments (id) on delete set null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.txn_kind not null,
  department_id uuid references public.departments (id) on delete set null, -- null = usable by all
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, kind)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type public.account_type not null,
  opening_balance_paise bigint not null default 0,
  reference text, -- e.g. last 4 digits / UPI id
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);

-- ───────────── helper functions (security definer so RLS can use them) ─────────────
create or replace function public.current_role_name()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.current_department()
returns uuid language sql stable security definer set search_path = public as $$
  select department_id from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_staff()  -- owner or finance
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('owner', 'finance'), false)
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'owner', false)
$$;

-- ───────────── new sign-ups get a profile; the very first user becomes the active Owner ─────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    case when first_user then 'owner'::public.app_role else 'viewer'::public.app_role end,
    first_user
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── audit trigger ─────────────
create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, user_id)
  values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['departments', 'profiles', 'categories', 'accounts'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.log_audit()', t);
  end loop;
end $$;

-- ───────────── row level security ─────────────
alter table public.departments enable row level security;
alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.accounts    enable row level security;
alter table public.audit_log   enable row level security;

-- departments: every active user reads; owner writes
drop policy if exists departments_read  on public.departments;
drop policy if exists departments_write on public.departments;
create policy departments_read  on public.departments for select to authenticated
  using (public.current_role_name() is not null);
create policy departments_write on public.departments for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- categories: every active user reads; owner/finance write
drop policy if exists categories_read  on public.categories;
drop policy if exists categories_write on public.categories;
create policy categories_read  on public.categories for select to authenticated
  using (public.current_role_name() is not null);
create policy categories_write on public.categories for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- accounts: owner/finance only (balances are sensitive); owner/finance write
drop policy if exists accounts_read  on public.accounts;
drop policy if exists accounts_write on public.accounts;
create policy accounts_read  on public.accounts for select to authenticated
  using (public.is_staff());
create policy accounts_write on public.accounts for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- profiles: read your own; owner/finance read all; owner updates anyone
drop policy if exists profiles_read_own    on public.profiles;
drop policy if exists profiles_read_staff  on public.profiles;
drop policy if exists profiles_owner_write on public.profiles;
create policy profiles_read_own   on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_read_staff on public.profiles for select to authenticated
  using (public.is_staff());
create policy profiles_owner_write on public.profiles for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- audit log: owner reads; nobody writes directly (trigger is security definer)
drop policy if exists audit_owner_read on public.audit_log;
create policy audit_owner_read on public.audit_log for select to authenticated
  using (public.is_owner());

-- ───────────── seed data ─────────────
insert into public.departments (name) values
  ('Sales'), ('IT'), ('HR'), ('Finance'), ('Operations')
on conflict (name) do nothing;

insert into public.categories (name, kind) values
  ('Student fee', 'in'),
  ('Sponsorship', 'in'),
  ('Refund received', 'in'),
  ('Interest', 'in'),
  ('Other income', 'in'),
  ('Salary', 'out'),
  ('Faculty / trainer payout', 'out'),
  ('Marketing / ads', 'out'),
  ('Software & subscriptions', 'out'),
  ('Rent', 'out'),
  ('Internet & utilities', 'out'),
  ('Vendor bill', 'out'),
  ('Travel', 'out'),
  ('Legal & CA fees', 'out'),
  ('GST / tax payment', 'out'),
  ('Miscellaneous', 'out')
on conflict (name, kind) do nothing;

insert into public.accounts (name, type) values
  ('Cash box', 'cash')
on conflict (name) do nothing;
