-- Central license records identify the shop branch assigned at code creation.
alter table public.platform_licenses
  add column if not exists branch_id text;

alter table public.platform_devices
  add column if not exists branch_id text;

create index if not exists platform_licenses_shop_branch_created_idx
  on public.platform_licenses (shop_id, branch_id, created_at desc)
  where license_type = 'device';

create index if not exists platform_devices_shop_branch_sync_idx
  on public.platform_devices (shop_id, branch_id, last_sync_at desc nulls last);
