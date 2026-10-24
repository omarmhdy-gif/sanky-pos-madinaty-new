-- Bind each email-based shop account to one explicit owner employee.
alter table private.shop_accounts add column owner_staff_id text;
update private.shop_accounts set owner_staff_id = 'staff_omar_001' where branch_id = 'branch_madinaty';
alter table private.shop_accounts alter column owner_staff_id set not null;
alter table private.shop_accounts add constraint shop_accounts_owner_staff_fkey foreign key (owner_staff_id) references public.staff(id) on delete restrict;

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
  join public.staff s on s.id = a.owner_staff_id and s.branch_id = a.branch_id and s.role = 'owner' and s.is_active
  where a.account_number = btrim(p_account_number)
    and a.owner_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and a.enabled
    and auth.uid() is not null
  limit 1;
$$;

revoke all on function public.authenticate_shop_owner(text) from public, anon;
grant execute on function public.authenticate_shop_owner(text) to authenticated;
