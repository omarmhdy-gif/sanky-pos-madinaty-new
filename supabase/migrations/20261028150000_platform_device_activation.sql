-- Bind one-time computer activation licenses to a device and enforce the
-- subscriber's device limit in the same transaction that consumes a code.
alter table public.platform_licenses
  add column if not exists device_uuid uuid;

create index if not exists platform_licenses_shop_devices_idx
  on public.platform_licenses (shop_id, device_uuid)
  where consumed_at is not null and device_uuid is not null;

create or replace function public.platform_claim_device_license(
  p_account_number text,
  p_code_digest text,
  p_device_uuid uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_license_id uuid;
  v_license_shop_id uuid;
  v_license_expires timestamptz;
  v_consumed_at timestamptz;
  v_license_device uuid;
  v_shop_account text;
  v_shop_status text;
  v_shop_expires date;
  v_device_limit integer;
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
         s.account_number, s.status, s.expires_at, s.device_limit
    into v_license_id, v_license_shop_id, v_license_expires, v_consumed_at, v_license_device,
         v_shop_account, v_shop_status, v_shop_expires, v_device_limit
  from public.platform_licenses l
  join public.platform_shops s on s.id = l.shop_id
  where l.license_type = 'device'
    and l.code_digest = p_code_digest
    and s.account_number = p_account_number
  for update of l, s;

  if not found then
    raise exception 'invalid activation code or account' using errcode = 'P0002';
  end if;
  if v_shop_status = 'suspended' or (v_shop_expires is not null and v_shop_expires < current_date) then
    raise exception 'subscription inactive' using errcode = '42501';
  end if;
  if v_consumed_at is not null then
    if v_license_device = p_device_uuid then return v_shop_account; end if;
    raise exception 'activation code already used' using errcode = '23505';
  end if;
  if v_license_expires <= now() then
    raise exception 'activation code expired' using errcode = '22023';
  end if;

  select count(distinct l.device_uuid)
    into v_used_devices
  from public.platform_licenses l
  where l.shop_id = v_license_shop_id
    and l.license_type = 'device'
    and l.consumed_at is not null
    and l.device_uuid is not null;

  select exists (
    select 1 from public.platform_licenses l
    where l.shop_id = v_license_shop_id
      and l.license_type = 'device'
      and l.consumed_at is not null
      and l.device_uuid = p_device_uuid
  ) into v_device_already_counted;

  if not v_device_already_counted and v_used_devices >= v_device_limit then
    raise exception 'device limit reached' using errcode = '54000';
  end if;

  update public.platform_licenses
  set consumed_at = now(), device_uuid = p_device_uuid
  where id = v_license_id and consumed_at is null and expires_at > now();
  if not found then
    raise exception 'activation code already used or expired' using errcode = '23505';
  end if;
  return v_shop_account;
end;
$$;

revoke all on function public.platform_claim_device_license(text, text, uuid) from public, anon, authenticated;
grant execute on function public.platform_claim_device_license(text, text, uuid) to service_role;
