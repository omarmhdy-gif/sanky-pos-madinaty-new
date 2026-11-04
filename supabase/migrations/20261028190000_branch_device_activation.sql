-- A shop account may own multiple branches. Device activation codes are
-- issued for one branch and checked again when the cashier binds its session.
do $migration$
declare
  v_account_attnum smallint;
  v_constraint record;
begin
  select attnum into v_account_attnum
  from pg_attribute
  where attrelid = 'private.shop_accounts'::regclass
    and attname = 'account_number'
    and not attisdropped;

  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'private.shop_accounts'::regclass
      and contype = 'u'
      and conkey = array[v_account_attnum]::smallint[]
  loop
    execute format('alter table private.shop_accounts drop constraint %I', v_constraint.conname);
  end loop;
end;
$migration$;

create index if not exists shop_accounts_account_number_idx
  on private.shop_accounts (account_number);

create or replace function public.verify_shop_branch(
  p_account_number text,
  p_branch_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from private.shop_accounts a
      where a.account_number = btrim(p_account_number)
        and a.branch_id = p_branch_id
        and a.owner_email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and a.enabled
    );
$function$;

revoke all on function public.verify_shop_branch(text, text) from public, anon;
grant execute on function public.verify_shop_branch(text, text) to authenticated;

create or replace function public.register_shop_device(
  p_account_number text,
  p_device_uuid uuid,
  p_auth_user_id uuid,
  p_branch_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_branch_id text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_account_number !~ '^[0-9]{4}$' or p_device_uuid is null or p_auth_user_id is null or nullif(btrim(p_branch_id), '') is null then
    raise exception 'invalid device activation input' using errcode = '22023';
  end if;

  select a.branch_id into v_branch_id
  from private.shop_accounts a
  where a.account_number = p_account_number
    and a.branch_id = p_branch_id
    and a.enabled;
  if not found then raise exception 'branch is not assigned to this business account' using errcode = '42501'; end if;

  insert into private.shop_devices (device_uuid, auth_user_id, branch_id, account_number)
  values (p_device_uuid, p_auth_user_id, v_branch_id, p_account_number)
  on conflict (device_uuid) do update
    set auth_user_id = excluded.auth_user_id,
        is_active = true
    where private.shop_devices.account_number = excluded.account_number
      and private.shop_devices.branch_id = excluded.branch_id
      and private.shop_devices.is_active;

  if not found then raise exception 'device is already assigned to another branch' using errcode = '23505'; end if;
  return v_branch_id;
end;
$function$;

create or replace function public.register_shop_device(
  p_account_number text,
  p_device_uuid uuid,
  p_auth_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_branch_id text;
  v_branch_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select count(*), min(a.branch_id) into v_branch_count, v_branch_id
  from private.shop_accounts a
  where a.account_number = p_account_number and a.enabled;
  if v_branch_count = 0 then raise exception 'business account not found' using errcode = 'P0002'; end if;
  if v_branch_count > 1 then raise exception 'branch is required for this business account' using errcode = '22023'; end if;
  return public.register_shop_device(p_account_number, p_device_uuid, p_auth_user_id, v_branch_id);
end;
$function$;

revoke all on function public.register_shop_device(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.register_shop_device(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_shop_device(text, uuid, uuid, text) to service_role;
grant execute on function public.register_shop_device(text, uuid, uuid) to service_role;
