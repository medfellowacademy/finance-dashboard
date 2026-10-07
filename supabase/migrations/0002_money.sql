-- Medfellow Finance – Phases 2-5: money in/out, fee plans, GST invoices, budgets, reconciliation.
-- Run AFTER 0001_foundation.sql.

-- ───────────── enums ─────────────
do $$ begin
  create type public.payment_mode as enum ('upi', 'bank', 'cash', 'card', 'gateway', 'cheque');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.txn_status as enum ('received', 'requested', 'approved', 'paid', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

-- ───────────── extra helpers ─────────────
create or replace function public.can_see_all()  -- owner, finance, viewer/CA
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('owner', 'finance', 'viewer'), false)
$$;

create or replace function public.can_write()  -- everyone except viewer
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('owner', 'finance', 'dept_head', 'dept_user'), false)
$$;

create or replace function public.is_sales()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.departments d
    where d.id = public.current_department() and d.name = 'Sales'
  )
$$;

-- ───────────── company settings (single row) ─────────────
create table if not exists public.company_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Medfellow Academy',
  gstin text,
  state text,
  address text,
  sac_code text not null default '999293',      -- confirm with your CA
  default_gst_rate numeric(5,2) not null default 18, -- confirm with your CA
  invoice_prefix text not null default 'MFA',
  bank_details text
);
insert into public.company_settings (id) values (1) on conflict do nothing;

-- ───────────── parties (students, vendors, employees) ─────────────
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('student', 'vendor', 'employee', 'other')),
  phone text,
  email text,
  state text,
  gstin text,
  notes text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists parties_kind_idx on public.parties (kind, name);

-- ───────────── courses & fee plans ─────────────
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true
);

create table if not exists public.fee_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.parties (id) on delete restrict,
  course_id uuid references public.courses (id) on delete set null,
  department_id uuid references public.departments (id),
  total_paise bigint not null check (total_paise > 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  gst_rate numeric(5,2) not null default 18,
  gst_inclusive boolean not null default true,
  notes text,
  status text not null default 'active' check (status in ('active', 'closed', 'cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (discount_paise <= total_paise)
);
create index if not exists fee_plans_student_idx on public.fee_plans (student_id);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  fee_plan_id uuid not null references public.fee_plans (id) on delete cascade,
  seq int not null,
  due_date date not null,
  amount_paise bigint not null check (amount_paise > 0)
);
create index if not exists installments_plan_idx on public.installments (fee_plan_id, seq);

-- ───────────── transactions (the ledger) ─────────────
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  kind public.txn_kind not null,
  txn_date date not null default current_date,
  amount_paise bigint not null check (amount_paise > 0),
  account_id uuid references public.accounts (id),
  department_id uuid not null references public.departments (id),
  category_id uuid references public.categories (id),
  party_id uuid references public.parties (id),
  fee_plan_id uuid references public.fee_plans (id),
  mode public.payment_mode,
  reference text,
  notes text,
  status public.txn_status not null,
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  reconciled boolean not null default false,
  reconciled_at timestamptz,
  deleted_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists txn_date_idx on public.transactions (txn_date desc);
create index if not exists txn_dept_idx on public.transactions (department_id, kind);
create index if not exists txn_party_idx on public.transactions (party_id);
create index if not exists txn_plan_idx on public.transactions (fee_plan_id);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  path text not null,
  file_name text not null,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ───────────── GST invoices ─────────────
create table if not exists public.invoice_counters (
  fy text primary key,
  last_no int not null default 0
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  invoice_date date not null default current_date,
  transaction_id uuid unique references public.transactions (id),
  party_id uuid references public.parties (id),
  fee_plan_id uuid references public.fee_plans (id),
  description text not null,
  taxable_paise bigint not null,
  gst_rate numeric(5,2) not null,
  cgst_paise bigint not null default 0,
  sgst_paise bigint not null default 0,
  igst_paise bigint not null default 0,
  total_paise bigint not null,
  place_of_supply text,
  sac_code text,
  company_gstin text,
  customer_gstin text,
  status text not null default 'issued' check (status in ('issued', 'cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.next_invoice_no()
returns text language plpgsql security definer set search_path = public as $$
declare
  fy_start int := case when extract(month from current_date) >= 4
                       then extract(year from current_date)::int
                       else extract(year from current_date)::int - 1 end;
  v_fy text := fy_start || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0');
  v_n int;
  v_prefix text;
begin
  insert into public.invoice_counters as c (fy, last_no) values (v_fy, 1)
  on conflict on constraint invoice_counters_pkey do update set last_no = c.last_no + 1
  returning c.last_no into v_n;
  select invoice_prefix into v_prefix from public.company_settings where id = 1;
  return v_prefix || '/' || v_fy || '/' || lpad(v_n::text, 4, '0');
end $$;

-- ───────────── budgets ─────────────
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_paise bigint not null check (amount_paise >= 0),
  unique (department_id, month)
);

-- ───────────── ledger rules (before insert) ─────────────
create or replace function public.txn_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lim bigint;
  me public.app_role := public.current_role_name();
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  new.requested_by := coalesce(new.requested_by, auth.uid());

  if new.kind = 'in' then
    new.status := 'received';
    if new.account_id is null and new.mode = 'cash' then
      select id into new.account_id from public.accounts
      where type = 'cash' and is_active order by created_at limit 1;
    end if;
    return new;
  end if;

  -- money out
  if public.is_staff() and new.status = 'paid' and new.account_id is not null then
    new.paid_at := coalesce(new.paid_at, now());
    new.approved_at := coalesce(new.approved_at, now());
    return new;
  end if;

  new.account_id := case when public.is_staff() then new.account_id else null end;
  select approval_limit_paise into lim from public.departments where id = new.department_id;
  if me = 'owner' or lim is null or new.amount_paise <= lim then
    new.status := 'approved';
    new.approved_at := now();
    new.approved_by := case when me = 'owner' then auth.uid() else null end; -- null = auto-approved
  else
    new.status := 'requested';
  end if;
  return new;
end $$;

drop trigger if exists txn_before_insert on public.transactions;
create trigger txn_before_insert before insert on public.transactions
  for each row execute function public.txn_before_insert();

-- ───────────── workflow functions ─────────────
create or replace function public.approve_payment(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the Owner can approve payments'; end if;
  update public.transactions
     set status = case when p_approve then 'approved'::public.txn_status else 'rejected'::public.txn_status end,
         approved_by = auth.uid(), approved_at = now()
   where id = p_id and kind = 'out' and status = 'requested' and deleted_at is null;
  if not found then raise exception 'Payment is not waiting for approval'; end if;
end $$;

create or replace function public.mark_paid(p_id uuid, p_account uuid, p_date date, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only Finance or Owner can mark payments as paid'; end if;
  update public.transactions
     set status = 'paid', account_id = p_account, txn_date = p_date,
         reference = coalesce(nullif(p_ref, ''), reference), paid_at = now()
   where id = p_id and kind = 'out' and status = 'approved' and deleted_at is null;
  if not found then raise exception 'Payment must be approved before it is paid'; end if;
end $$;

create or replace function public.cancel_payment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.transactions set status = 'cancelled'
   where id = p_id and kind = 'out' and status in ('requested', 'approved') and deleted_at is null
     and (public.is_staff() or created_by = auth.uid());
  if not found then raise exception 'Cannot cancel this payment'; end if;
end $$;

create or replace function public.assign_account(p_id uuid, p_account uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only Finance or Owner can assign accounts'; end if;
  update public.transactions set account_id = p_account where id = p_id and deleted_at is null;
end $$;

create or replace function public.set_reconciled(p_ids uuid[], p_val boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only Finance or Owner can reconcile'; end if;
  update public.transactions
     set reconciled = p_val, reconciled_at = case when p_val then now() end
   where id = any (p_ids) and deleted_at is null;
end $$;

create or replace function public.delete_transaction(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only Finance or Owner can delete entries'; end if;
  update public.transactions set deleted_at = now() where id = p_id and deleted_at is null;
end $$;

-- ───────────── audit triggers on new tables ─────────────
do $$ declare t text; begin
  foreach t in array array['parties', 'courses', 'fee_plans', 'installments', 'transactions',
                           'invoices', 'budgets', 'company_settings'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.log_audit()', t);
  end loop;
end $$;

-- fee plan defaults
create or replace function public.fee_plan_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.department_id := coalesce(new.department_id, public.current_department(),
                                (select id from public.departments where name = 'Sales'));
  return new;
end $$;
drop trigger if exists fee_plan_before_insert on public.fee_plans;
create trigger fee_plan_before_insert before insert on public.fee_plans
  for each row execute function public.fee_plan_before_insert();

-- ───────────── row level security ─────────────
alter table public.company_settings enable row level security;
alter table public.parties          enable row level security;
alter table public.courses          enable row level security;
alter table public.fee_plans        enable row level security;
alter table public.installments     enable row level security;
alter table public.transactions     enable row level security;
alter table public.attachments      enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.budgets          enable row level security;

-- company settings
drop policy if exists company_read  on public.company_settings;
drop policy if exists company_write on public.company_settings;
create policy company_read  on public.company_settings for select to authenticated
  using (public.current_role_name() is not null);
create policy company_write on public.company_settings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- parties: students only for staff / viewer / Sales; vendors & others for everyone active
drop policy if exists parties_read   on public.parties;
drop policy if exists parties_insert on public.parties;
drop policy if exists parties_update on public.parties;
create policy parties_read on public.parties for select to authenticated using (
  public.current_role_name() is not null
  and (kind <> 'student' or public.can_see_all() or public.is_sales())
);
create policy parties_insert on public.parties for insert to authenticated with check (
  public.can_write() and (kind <> 'student' or public.is_staff() or public.is_sales())
);
create policy parties_update on public.parties for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- courses
drop policy if exists courses_read  on public.courses;
drop policy if exists courses_write on public.courses;
create policy courses_read  on public.courses for select to authenticated
  using (public.current_role_name() is not null);
create policy courses_write on public.courses for all to authenticated
  using (public.can_write()) with check (public.can_write());

-- fee plans: staff/viewer all; department head = department; user = own
drop policy if exists plans_read   on public.fee_plans;
drop policy if exists plans_insert on public.fee_plans;
drop policy if exists plans_update on public.fee_plans;
create policy plans_read on public.fee_plans for select to authenticated using (
  public.can_see_all()
  or (department_id = public.current_department()
      and (public.current_role_name() = 'dept_head' or created_by = auth.uid()))
);
create policy plans_insert on public.fee_plans for insert to authenticated with check (
  public.is_staff() or (public.is_sales() and public.can_write())
);
create policy plans_update on public.fee_plans for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists inst_read   on public.installments;
drop policy if exists inst_insert on public.installments;
drop policy if exists inst_write  on public.installments;
create policy inst_read on public.installments for select to authenticated
  using (exists (select 1 from public.fee_plans p where p.id = fee_plan_id));
create policy inst_insert on public.installments for insert to authenticated
  with check (exists (select 1 from public.fee_plans p where p.id = fee_plan_id) and public.can_write());
create policy inst_write on public.installments for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- transactions
drop policy if exists txn_read   on public.transactions;
drop policy if exists txn_insert on public.transactions;
drop policy if exists txn_update on public.transactions;
create policy txn_read on public.transactions for select to authenticated using (
  deleted_at is null and (
    public.can_see_all()
    or (department_id = public.current_department()
        and (public.current_role_name() = 'dept_head' or created_by = auth.uid()))
  )
);
create policy txn_insert on public.transactions for insert to authenticated with check (
  public.is_staff()
  or (public.can_write()
      and department_id = public.current_department()
      and (kind = 'out' or public.is_sales()))
);
create policy txn_update on public.transactions for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- attachments
drop policy if exists att_read   on public.attachments;
drop policy if exists att_insert on public.attachments;
drop policy if exists att_delete on public.attachments;
create policy att_read on public.attachments for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id));
create policy att_insert on public.attachments for insert to authenticated
  with check (public.can_write() and exists (select 1 from public.transactions t where t.id = transaction_id));
create policy att_delete on public.attachments for delete to authenticated using (public.is_staff());

-- invoices
drop policy if exists inv_read   on public.invoices;
drop policy if exists inv_insert on public.invoices;
drop policy if exists inv_update on public.invoices;
create policy inv_read on public.invoices for select to authenticated using (
  public.can_see_all()
  or (transaction_id is not null and exists (select 1 from public.transactions t where t.id = transaction_id))
);
create policy inv_insert on public.invoices for insert to authenticated with check (
  public.is_staff()
  or (public.can_write() and transaction_id is not null
      and exists (select 1 from public.transactions t where t.id = transaction_id))
);
create policy inv_update on public.invoices for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- counters are only touched through next_invoice_no() (security definer)
drop policy if exists counters_none on public.invoice_counters;
create policy counters_none on public.invoice_counters for select to authenticated using (public.is_staff());

-- budgets
drop policy if exists budgets_read  on public.budgets;
drop policy if exists budgets_write on public.budgets;
create policy budgets_read on public.budgets for select to authenticated using (
  public.can_see_all()
  or (department_id = public.current_department() and public.current_role_name() = 'dept_head')
);
create policy budgets_write on public.budgets for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ───────────── receipt file storage (private bucket) ─────────────
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists receipts_insert on storage.objects;
drop policy if exists receipts_select on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_write());
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.current_role_name() is not null);

-- ───────────── dashboard helpers (security invoker: row level security still applies) ─────────────
create or replace function public.account_balances()
returns table (account_id uuid, balance_paise bigint)
language sql stable security invoker set search_path = public as $$
  select a.id,
         a.opening_balance_paise + coalesce(sum(
           case when t.kind = 'in' then t.amount_paise else -t.amount_paise end
         ), 0)::bigint
    from public.accounts a
    left join public.transactions t
      on t.account_id = a.id and t.status in ('received', 'paid') and t.deleted_at is null
   group by a.id, a.opening_balance_paise
$$;

create or replace function public.monthly_totals(p_from date)
returns table (month date, kind public.txn_kind, total_paise bigint)
language sql stable security invoker set search_path = public as $$
  select date_trunc('month', txn_date)::date, kind, sum(amount_paise)::bigint
    from public.transactions
   where status in ('received', 'paid') and deleted_at is null and txn_date >= p_from
   group by 1, 2
$$;

create or replace function public.department_spend(p_from date, p_to date)
returns table (department_id uuid, kind public.txn_kind, total_paise bigint)
language sql stable security invoker set search_path = public as $$
  select department_id, kind, sum(amount_paise)::bigint
    from public.transactions
   where status in ('received', 'paid') and deleted_at is null and txn_date between p_from and p_to
   group by 1, 2
$$;
