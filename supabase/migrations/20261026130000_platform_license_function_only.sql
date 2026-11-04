-- Replace the previous anonymous project-ref policy. Multiple businesses share
-- one POS Supabase project, so project-ref alone cannot identify a customer.
-- The shop-license-status Edge Function performs account + owner validation
-- and reads these two fields with the central service role.
begin;

drop policy if exists platform_shop_license_read_own_tenant
  on public.platform_shops;

revoke all on public.platform_shops from anon;
revoke select (status, expires_at, tenant_project_ref)
  on public.platform_shops from anon;

commit;
