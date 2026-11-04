-- Device names are retained for unused one-time codes so the console can
-- show which workstation each code was prepared for.
alter table public.platform_licenses
  add column if not exists device_name text;

-- Return only the branch/name metadata needed by the POS activation service.
create or replace function public.platform_claim_device_license_v2(
  p_account_number text,
  p_code_digest text,
  p_device_uuid uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_license_id uuid;
  v_license_shop_id uuid;
  v_license_expires timestamptz;
  v_consumed_at timestamptz;
  v_license_device uuid;
  v_shop_account text;
  v_shop_status text;
  v_shop_expires date;
  v_shop_archived_at timestamptz;
  v_device_limit integer;
  v_branch_id text;
  v_device_name text;
  v_used_devices bigint;
  v_device_already_counted boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_account_number !~ '^[0-9]{4}$'
     or p_code_digest !~ '^[0-9a-f]{64}$'
     or p_device_uuid is null then
    raise exception 'invalid activation request' using errcode = '22023';
  end if;

  select l.id, l.shop_id, l.expires_at, l.consumed_at, l.device_uuid,
         s.account_number, s.status, s.expires_at, s.archived_at, s.device_limit,
         l.branch_id, l.device_name
    into v_license_id, v_license_shop_id, v_license_expires, v_consumed_at, v_license_device,
         v_shop_account, v_shop_status, v_shop_expires, v_shop_archived_at, v_device_limit,
         v_branch_id, v_device_name
  from public.platform_licenses l
  join public.platform_shops s on s.id = l.shop_id
  where l.license_type = 'device'
    and l.code_digest = p_code_digest
    and s.account_number = p_account_number
  for update of l, s;

  if not found then raise exception 'invalid activation code or account' using errcode = 'P0002'; end if;
  if v_shop_archived_at is not null or v_shop_status = 'suspended'
     or (v_shop_expires is not null and v_shop_expires < current_date) then
    raise exception 'subscription inactive' using errcode = '42501';
  end if;
  if v_consumed_at is not null then
    if v_license_device = p_device_uuid then
      return jsonb_build_object('accountNumber', v_shop_account, 'branchId', v_branch_id, 'deviceName', v_device_name);
    end if;
    raise exception 'activation code already used' using errcode = '23505';
  end if;
  if v_license_expires <= now() then raise exception 'activation code expired' using errcode = '22023'; end if;
  select count(distinct l.device_uuid) into v_used_devices
  from public.platform_licenses l
  where l.shop_id = v_license_shop_id and l.license_type = 'device'
    and l.consumed_at is not null and l.device_uuid is not null;

  select exists (
    select 1 from public.platform_licenses l
    where l.shop_id = v_license_shop_id and l.license_type = 'device'
      and l.consumed_at is not null and l.device_uuid = p_device_uuid
  ) into v_device_already_counted;

  if not v_device_already_counted and v_used_devices >= v_device_limit then
    raise exception 'device limit reached' using errcode = '54000';
  end if;

  update public.platform_licenses set consumed_at = now(), device_uuid = p_device_uuid
  where id = v_license_id and consumed_at is null and expires_at > now();
  if not found then raise exception 'activation code already used or expired' using errcode = '23505'; end if;
  return jsonb_build_object('accountNumber', v_shop_account, 'branchId', v_branch_id, 'deviceName', v_device_name);
end;
$function$;

revoke all on function public.platform_claim_device_license_v2(text, text, uuid) from public, anon, authenticated;
grant execute on function public.platform_claim_device_license_v2(text, text, uuid) to service_role;

-- Serialize code creation against the business device limit so two owners
-- cannot reserve the same remaining slot concurrently.
create or replace function public.platform_issue_device_license(
  p_account_number text,
  p_branch_id text,
  p_code_digest text,
  p_device_name text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id uuid;
  v_device_limit integer;
  v_status text;
  v_shop_expires date;
  v_archived_at timestamptz;
  v_active_devices bigint;
  v_pending_codes bigint;
  v_license public.platform_licenses%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_account_number !~ '^[0-9]{4}$'
     or nullif(btrim(p_branch_id), '') is null
     or p_code_digest !~ '^[0-9a-f]{64}$'
     or length(btrim(p_device_name)) not between 1 and 80
     or p_expires_at <= now() then
    raise exception 'invalid device license input' using errcode = '22023';
  end if;

  select id, device_limit, status, expires_at, archived_at
    into v_shop_id, v_device_limit, v_status, v_shop_expires, v_archived_at
  from public.platform_shops
  where account_number = p_account_number
  for update;
  if not found then raise exception 'business not found' using errcode = 'P0002'; end if;
  if v_archived_at is not null or v_status = 'suspended'
     or (v_shop_expires is not null and v_shop_expires < current_date) then
    raise exception 'subscription inactive' using errcode = '42501';
  end if;

  select count(*) into v_active_devices from (
    select l.device_uuid
    from public.platform_licenses l
    where l.shop_id = v_shop_id and l.license_type = 'device'
      and l.consumed_at is not null and l.device_uuid is not null
    union
    select d.device_uuid from public.platform_devices d where d.shop_id = v_shop_id
  ) registered;

  select count(*) into v_pending_codes
  from public.platform_licenses l
  where l.shop_id = v_shop_id and l.license_type = 'device'
    and l.consumed_at is null and l.expires_at > now();

  if v_active_devices + v_pending_codes >= v_device_limit then
    raise exception 'device limit reached' using errcode = '54000';
  end if;

  insert into public.platform_licenses (shop_id, license_type, code_digest, branch_id, device_name, expires_at)
  values (v_shop_id, 'device', p_code_digest, p_branch_id, btrim(p_device_name), p_expires_at)
  returning * into v_license;

  return jsonb_build_object(
    'id', v_license.id,
    'branch_id', v_license.branch_id,
    'device_name', v_license.device_name,
    'expires_at', v_license.expires_at,
    'consumed_at', v_license.consumed_at,
    'created_at', v_license.created_at,
    'device_uuid', v_license.device_uuid,
    'activeDeviceCount', v_active_devices,
    'pendingCodeCount', v_pending_codes + 1,
    'deviceLimit', v_device_limit
  );
end;
$function$;

revoke all on function public.platform_issue_device_license(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_issue_device_license(text, text, text, text, timestamptz) to service_role;
