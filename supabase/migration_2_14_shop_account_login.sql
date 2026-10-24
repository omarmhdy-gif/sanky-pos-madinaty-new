-- Add the first shop account mapping for email/password sign-in.
-- This migration is additive and does not alter cashier PIN authentication.
create table if not exists private.shop_accounts (
  branch_id text primary key references public.branches(id) on delete cascade,
  account_number text not null unique check (account_number ~ '^[0-9]{4}$'),
  owner_email text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint shop_accounts_owner_email_normalized check (owner_email = lower(btrim(owner_email)))
);

alter table private.shop_accounts enable row level security;
revoke all on table private.shop_accounts from public, anon, authenticated;

insert into private.shop_accounts (branch_id, account_number, owner_email)
select b.id, '0000', 'omarmhdy@gmail.com'
from public.branches b
where b.id = 'branch_madinaty'
on conflict (branch_id) do update
set account_number = excluded.account_number,
    owner_email = excluded.owner_email,
    enabled = true;

create or replace function public.verify_shop_account(p_account_number text, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.shop_accounts a
    where a.account_number = btrim(p_account_number)
      and a.owner_email = lower(btrim(p_email))
      and a.enabled
  );
$$;

revoke all on function public.verify_shop_account(text, text) from public;
grant execute on function public.verify_shop_account(text, text) to anon, authenticated;

create or replace function public.authenticate_shop_owner(p_account_number text)
returns table (
  id text,
  branch_id text,
  name text,
  role text,
  avatar_color text,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.branch_id, s.name, s.role, s.avatar_color, s.is_active
  from private.shop_accounts a
  join public.staff s on s.branch_id = a.branch_id and s.role = 'owner' and s.is_active
  where a.account_number = btrim(p_account_number)
    and a.owner_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and a.enabled
    and auth.uid() is not null
  order by s.id
  limit 1;
$$;

revoke all on function public.authenticate_shop_owner(text) from public, anon;
grant execute on function public.authenticate_shop_owner(text) to authenticated;
