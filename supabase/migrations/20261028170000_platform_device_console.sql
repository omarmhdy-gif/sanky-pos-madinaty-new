-- Central console device inventory and recoverable business removal.
alter table public.platform_shops
  add column if not exists archived_at timestamptz;

create table if not exists public.platform_devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.platform_shops(id) on delete cascade,
  device_uuid uuid not null,
  device_name text not null default 'Cashier device',
  activated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, device_uuid),
  check (length(trim(device_name)) between 1 and 80)
);

create index if not exists platform_devices_shop_sync_idx
  on public.platform_devices (shop_id, last_sync_at desc nulls last);

create or replace function public.platform_devices_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists platform_devices_set_updated_at on public.platform_devices;
create trigger platform_devices_set_updated_at
before update on public.platform_devices
for each row execute function public.platform_devices_set_updated_at();

alter table public.platform_devices enable row level security;
drop policy if exists platform_devices_admin_select on public.platform_devices;
create policy platform_devices_admin_select on public.platform_devices
  for select to authenticated
  using (public.platform_admin_is_allowed());
revoke all on public.platform_devices from anon, authenticated;
grant select on public.platform_devices to authenticated;
grant all on public.platform_devices to service_role;

-- Archived businesses cannot consume a device activation code.
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
  v_shop_archived_at timestamptz;
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
         s.account_number, s.status, s.expires_at, s.archived_at, s.device_limit
    into v_license_id, v_license_shop_id, v_license_expires, v_consumed_at, v_license_device,
         v_shop_account, v_shop_status, v_shop_expires, v_shop_archived_at, v_device_limit
  from public.platform_licenses l
  join public.platform_shops s on s.id = l.shop_id
  where l.license_type = 'device'
    and l.code_digest = p_code_digest
    and s.account_number = p_account_number
  for update of l, s;

  if not found then
    raise exception 'invalid activation code or account' using errcode = 'P0002';
  end if;
  if v_shop_archived_at is not null or v_shop_status = 'suspended'
     or (v_shop_expires is not null and v_shop_expires < current_date) then
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
