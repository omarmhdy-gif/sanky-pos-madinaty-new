-- Persist per-module/action grants for employees who sign in using a PIN.
-- This RPC is authenticated and branch-scoped. Email/password employee
-- accounts continue through manage-employee-login and its service-only save.
create or replace function public.save_staff(
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
as $function$
declare
  v_account_number text;
  v_existing_branch text;
  v_existing_permissions jsonb;
  v_existing_pin boolean := false;
  v_action text;
  v_permissions jsonb;
  v_allowed_permissions text[] := array[
    'dashboard.view', 'pos.view', 'orders.view', 'inventory.view', 'purchases.view',
    'products.view', 'finance.view', 'reports.view', 'attendance.view', 'employees.view',
    'customers.view', 'settings.view', 'recipes.view',
    'pos.sell', 'pos.apply_discount', 'pos.change_price', 'pos.manage_shifts',
    'orders.void', 'orders.refund',
    'inventory.create', 'inventory.edit', 'inventory.delete', 'inventory.receive',
    'inventory.adjust', 'inventory.manufacture', 'inventory.quality',
    'purchases.create', 'purchases.delete',
    'products.create', 'products.edit', 'products.delete', 'products.manage_recipe',
    'finance.create', 'finance.edit', 'finance.delete', 'reports.export',
    'attendance.create', 'attendance.edit', 'attendance.delete', 'attendance.clock_in',
    'attendance.clock_out', 'employees.create', 'employees.edit', 'employees.delete',
    'employees.manage_permissions', 'customers.create', 'customers.edit',
    'settings.edit_general', 'settings.edit_receipt', 'settings.edit_payments',
    'settings.edit_dining', 'settings.edit_loyalty', 'settings.edit_shifts',
    -- Legacy module-only grants remain supported for existing staff records.
    'dashboard', 'pos', 'orders', 'inventory', 'purchases', 'products', 'finance',
    'reports', 'attendance', 'employees', 'customers', 'settings', 'recipes'
  ];
  v_staff public.staff%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authenticated employee session required' using errcode = '42501';
  end if;
  if nullif(btrim(p_id), '') is null or nullif(btrim(p_name), '') is null
     or nullif(btrim(p_branch_id), '') is null or p_role is distinct from 'cashier' then
    raise exception 'invalid PIN employee input' using errcode = '22023';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must contain exactly four digits' using errcode = '22023';
  end if;

  select s.branch_id, s.permissions, (s.pin_hash is not null)
    into v_existing_branch, v_existing_permissions, v_existing_pin
  from public.staff s
  where s.id = p_id;

  if found and v_existing_branch <> p_branch_id then
    raise exception 'employee belongs to another branch' using errcode = '42501';
  end if;
  v_action := case when v_existing_branch is null then 'create' else 'edit' end;
  if v_action = 'edit' and exists (
    select 1 from public.staff s
    where s.id = p_id and s.auth_user_id = auth.uid()
  ) then
    raise exception 'employees cannot change their own permissions' using errcode = '42501';
  end if;
  if p_pin is null and not coalesce(v_existing_pin, false) then
    raise exception 'a PIN is required for PIN employee accounts' using errcode = '22023';
  end if;

  v_permissions := coalesce(
    p_permissions,
    v_existing_permissions,
    '["pos","orders","inventory","attendance"]'::jsonb
  );
  if jsonb_typeof(v_permissions) <> 'array' then
    raise exception 'permissions must be an array' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_permissions) as item(value)
    where jsonb_typeof(item.value) <> 'string'
       or (item.value #>> '{}') <> all (v_allowed_permissions)
  ) then
    raise exception 'permissions contain an unsupported grant' using errcode = '22023';
  end if;

  select a.account_number into v_account_number
  from private.shop_accounts a
  where a.branch_id = p_branch_id and a.enabled
  limit 1;
  if v_account_number is null then
    raise exception 'branch is not assigned to an enabled business account' using errcode = '42501';
  end if;
  if not public.authorize_employee_console_change(
    v_account_number, p_branch_id, v_action, p_id, v_permissions
  ) then
    raise exception 'not authorized to assign these employee permissions' using errcode = '42501';
  end if;

  -- Reuse the existing server-side PIN hashing and staff upsert.
  perform public.save_staff(
    p_id, p_name, p_pin, p_role, p_avatar_color, p_is_active, p_branch_id
  );
  update public.staff s
  set permissions = v_permissions
  where s.id = p_id and s.branch_id = p_branch_id
  returning s.* into v_staff;
  if not found then
    raise exception 'employee could not be saved' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', v_staff.id,
    'branchId', v_staff.branch_id,
    'name', v_staff.name,
    'role', v_staff.role,
    'avatarColor', v_staff.avatar_color,
    'isActive', v_staff.is_active,
    'permissions', v_staff.permissions,
    'hasConsoleLogin', (v_staff.auth_user_id is not null),
    'hasPin', (v_staff.pin_hash is not null)
  );
end;
$function$;

revoke all on function public.save_staff(text, text, text, text, text, boolean, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_staff(text, text, text, text, text, boolean, text, jsonb)
  to authenticated;
