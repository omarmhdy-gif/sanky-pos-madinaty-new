-- Expose only the minimum subscription fields required by the cashier.
-- Row access is limited to the tenant ref supplied with each PostgREST request.
grant select (status, expires_at, tenant_project_ref)
  on public.platform_shops to anon;

drop policy if exists platform_shop_license_read_own_tenant
  on public.platform_shops;

create policy platform_shop_license_read_own_tenant
  on public.platform_shops
  for select
  to anon
  using (
    tenant_project_ref is not null
    and tenant_project_ref = nullif(
      current_setting('request.headers', true)::jsonb ->> 'x-tenant-project-ref',
      ''
    )
  );
