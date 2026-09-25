-- ============================================================================
-- Migration 2.3 — Granular User Permissions + Branch-specific External
-- Payment Name
-- ADDITIVE-SAFE TO RUN: adds nullable/defaulted columns and replaces
-- save_staff/verify_staff_pin/staff_public in place (same call signatures
-- except save_staff, which gains one new trailing parameter). Does not
-- touch any existing row's data. Safe to re-run.
--
-- 1) Permissions: staff.permissions (jsonb array of permission keys,
--    nullable). NULL means "not configured yet" — the app falls back to
--    that user's existing role-based access (owner: everything, cashier:
--    exactly what NAV_ITEMS granted cashiers before this migration), so
--    every existing staff row keeps behaving exactly as it does today until
--    an owner explicitly sets permissions for that person via Employees ->
--    edit staff. Owner role always has every permission regardless of this
--    column's value (enforced in lib/permissions.ts, not here).
--
-- 2) External Payment Name: shop_settings.external_payment_name (jsonb
--    {en,ar}) + external_payment_icon (text) — configurable per branch,
--    defaulted to the exact current hardcoded values ("Talabat" / "Bike")
--    so every existing branch's receipts/reports/dashboard keep showing
--    "Talabat" until an owner changes it in Settings. The underlying stored
--    value on orders.payment->>'method' stays the literal string 'talabat'
--    forever (business logic/queries are unaffected) — only the on-screen
--    label and icon become configurable.
-- ============================================================================

alter table staff add column if not exists permissions jsonb;

alter table shop_settings add column if not exists external_payment_name jsonb
  default '{"en":"Talabat","ar":"طلبات"}'::jsonb;
alter table shop_settings add column if not exists external_payment_icon text
  default 'Bike';

-- Backfill any row where the column exists but is null (e.g. re-running
-- this migration after a manual partial apply) — harmless no-op otherwise.
update shop_settings set external_payment_name = '{"en":"Talabat","ar":"طلبات"}'::jsonb
  where external_payment_name is null;
update shop_settings set external_payment_icon = 'Bike'
  where external_payment_icon is null;

-- ----------------------------------------------------------------------------
-- staff_public — replaced in place to also expose permissions (still never
-- exposes pin_hash).
-- ----------------------------------------------------------------------------
drop view if exists staff_public;
create view staff_public as
  select id, branch_id, name, role, avatar_color, is_active, permissions from staff;

grant select on staff_public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- save_staff — replaced in place with one new trailing parameter,
-- p_permissions jsonb (nullable — pass null to leave/set "not configured").
-- Identical otherwise.
-- ----------------------------------------------------------------------------
drop function if exists save_staff(text, text, text, text, text, boolean, text);

create or replace function save_staff(
  p_id text,
  p_name text,
  p_pin text,
  p_role text,
  p_avatar_color text,
  p_is_active boolean,
  p_branch_id text,
  p_permissions jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin_hash text;
  v_branch_id text;
  v_permissions jsonb;
begin
  if p_pin is not null and length(p_pin) > 0 then
    v_pin_hash := crypt(p_pin, gen_salt('bf'));
  end if;

  insert into staff (id, name, pin_hash, role, avatar_color, is_active, branch_id, permissions)
  values (p_id, p_name, v_pin_hash, p_role, p_avatar_color, p_is_active, p_branch_id, p_permissions)
  on conflict (id) do update set
    name = excluded.name,
    pin_hash = coalesce(v_pin_hash, staff.pin_hash),
    role = excluded.role,
    avatar_color = excluded.avatar_color,
    is_active = excluded.is_active,
    permissions = excluded.permissions
  returning branch_id, permissions into v_branch_id, v_permissions;

  return jsonb_build_object(
    'id', p_id,
    'branchId', v_branch_id,
    'name', p_name,
    'role', p_role,
    'avatarColor', p_avatar_color,
    'isActive', p_is_active,
    'permissions', v_permissions
  );
end;
$$;

grant execute on function save_staff(text, text, text, text, text, boolean, text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- verify_staff_pin — replaced in place (same signature) to also return
-- permissions, so a fresh login carries them immediately.
-- ----------------------------------------------------------------------------
create or replace function verify_staff_pin(p_staff_id text, p_pin text, p_branch_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff staff%rowtype;
begin
  select * into v_staff from staff where id = p_staff_id and branch_id = p_branch_id and is_active = true;
  if not found or v_staff.pin_hash is null then
    return null;
  end if;
  if v_staff.pin_hash = crypt(p_pin, v_staff.pin_hash) then
    return jsonb_build_object(
      'id', v_staff.id,
      'branchId', v_staff.branch_id,
      'name', v_staff.name,
      'role', v_staff.role,
      'avatarColor', v_staff.avatar_color,
      'isActive', v_staff.is_active,
      'permissions', v_staff.permissions
    );
  end if;
  return null;
end;
$$;

grant execute on function verify_staff_pin(text, text, text) to anon, authenticated;
