-- Central owner console metadata. Shop sales data remains in each shop project.
create table public.platform_admins (
  email text primary key check (email = lower(email)),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.platform_shops (
  id uuid primary key default gen_random_uuid(),
  account_number text not null unique check (account_number ~ '^[0-9]{4}$'),
  name text not null check (length(trim(name)) between 1 and 100),
  owner_email text not null check (owner_email = lower(owner_email)),
  plan text not null default 'starter' check (plan in ('starter', 'growth', 'premium')),
  status text not null default 'trial' check (status in ('active', 'trial', 'suspended')),
  modules text[] not null default array['pos', 'orders', 'reports', 'delivery']::text[],
  monthly_fee numeric(12,2) check (monthly_fee is null or monthly_fee >= 0),
  currency text not null default 'EGP' check (currency ~ '^[A-Z]{3}$'),
  expires_at date,
  branch_limit integer not null default 1 check (branch_limit > 0),
  device_limit integer not null default 1 check (device_limit > 0),
  allow_negative_stock boolean not null default false,
  tenant_project_ref text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.platform_shops(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'EGP' check (currency ~ '^[A-Z]{3}$'),
  paid_on date not null default current_date,
  period_start date,
  period_end date,
  method text not null default 'manual' check (method = 'manual'),
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_start is null or period_end is null or period_end >= period_start)
);

create table public.platform_licenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.platform_shops(id) on delete cascade,
  license_type text not null check (license_type in ('branch', 'device')),
  code_digest text not null unique,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  consumed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.platform_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'failed')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.platform_audit_log (
  id bigint generated always as identity primary key,
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index platform_shops_status_expires_idx on public.platform_shops (status, expires_at);
create index platform_payments_shop_paid_idx on public.platform_payments (shop_id, paid_on desc);
create index platform_licenses_shop_expiry_idx on public.platform_licenses (shop_id, expires_at desc);
create index platform_audit_log_created_idx on public.platform_audit_log (created_at desc);

create or replace function public.platform_admin_is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and a.is_active
  );
$$;

revoke all on function public.platform_admin_is_allowed() from public, anon;
grant execute on function public.platform_admin_is_allowed() to authenticated;

create or replace function public.platform_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger platform_shops_set_updated_at
before update on public.platform_shops
for each row execute function public.platform_set_updated_at();

alter table public.platform_admins enable row level security;
alter table public.platform_shops enable row level security;
alter table public.platform_payments enable row level security;
alter table public.platform_licenses enable row level security;
alter table public.platform_releases enable row level security;
alter table public.platform_audit_log enable row level security;

create policy platform_admins_select on public.platform_admins
  for select to authenticated using (public.platform_admin_is_allowed());
create policy platform_shops_admin_all on public.platform_shops
  for all to authenticated
  using (public.platform_admin_is_allowed())
  with check (public.platform_admin_is_allowed());
create policy platform_payments_admin_all on public.platform_payments
  for all to authenticated
  using (public.platform_admin_is_allowed())
  with check (public.platform_admin_is_allowed());
create policy platform_licenses_admin_all on public.platform_licenses
  for all to authenticated
  using (public.platform_admin_is_allowed())
  with check (public.platform_admin_is_allowed());
create policy platform_releases_admin_all on public.platform_releases
  for all to authenticated
  using (public.platform_admin_is_allowed())
  with check (public.platform_admin_is_allowed());
create policy platform_audit_admin_all on public.platform_audit_log
  for all to authenticated
  using (public.platform_admin_is_allowed())
  with check (public.platform_admin_is_allowed());

revoke all on public.platform_admins, public.platform_shops, public.platform_payments,
  public.platform_licenses, public.platform_releases, public.platform_audit_log from anon;
grant select on public.platform_admins to authenticated;
grant select, insert, update, delete on public.platform_shops, public.platform_payments,
  public.platform_licenses, public.platform_releases, public.platform_audit_log to authenticated;
grant usage, select on sequence public.platform_audit_log_id_seq to authenticated;

insert into public.platform_admins (email) values ('omarmhdy@gmail.com')
on conflict (email) do update set is_active = excluded.is_active;

insert into public.platform_shops (
  account_number, name, owner_email, plan, status, modules, monthly_fee,
  branch_limit, device_limit, notes
) values (
  '0000', 'Sanky POS — Madinaty', 'omarmhdy@gmail.com', 'premium', 'active',
  array['pos', 'orders', 'reports', 'delivery', 'hr', 'inventory', 'loyalty', 'finance']::text[],
  null, 1, 1, 'First platform customer. Shop operations remain in the Sanky shop project.'
)
on conflict (account_number) do nothing;
