-- Employee email/password accounts for the existing POS business login.
-- This is an additive local migration; do not apply it to production as part
-- of the UI preview.

alter table public.staff add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.staff add column if not exists login_email text;

create unique index if not exists staff_auth_user_id_unique
  on public.staff (auth_user_id) where auth_user_id is not null;
create unique index if not exists staff_login_email_unique
  on public.staff (lower(login_email)) where login_email is not null;

drop view if exists public.staff_public;
create view public.staff_public as
  select id, branch_id, name, role, avatar_color, is_active, permissions,
         (auth_user_id is not null) as has_console_login,
         (pin_hash is not null) as has_pin
  from public.staff;
grant select on public.staff_public to anon, authenticated;

-- Keep the branch RLS helper scoped to devices, the mapped business owner,
-- or an active console employee explicitly bound to this account and branch.
create or replace function private.shop_branch_accessible(p_branch_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_account_number text := coalesce(auth.jwt() -> 'user_metadata' ->> 'account_number', '');
begin
  if p_branch_id is null then return false; end if;
  if v_role = 'service_role' then return true; end if;
  if v_role = 'anon' then return p_branch_id = 'branch_madinaty'; end if;
  if v_role <> 'authenticated' or auth.uid() is null then return false; end if;

  return exists (
      select 1 from private.shop_devices d
      where d.auth_user_id = auth.uid() and d.branch_id = p_branch_id and d.is_active
    ) or exists (
      select 1 from private.shop_accounts a
      where a.branch_id = p_branch_id and a.owner_email = v_email
        and (a.account_number = v_account_number or (p_branch_id = 'branch_madinaty' and v_account_number = ''))
        and a.enabled
    ) or exists (
      select 1
      from public.staff s
      join private.shop_accounts a on a.branch_id = s.branch_id
      where s.auth_user_id = auth.uid() and s.branch_id = p_branch_id and s.is_active
        and a.account_number = v_account_number and a.enabled
    );
end;
$function$;
revoke all on function private.shop_branch_accessible(text) from public;
grant execute on function private.shop_branch_accessible(text) to anon, authenticated;

create or replace function public.verify_shop_branch(p_account_number text, p_branch_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from private.shop_accounts a
    where a.account_number = btrim(p_account_number) and a.branch_id = p_branch_id and a.enabled
      and (
        a.owner_email = lower(coalesce(auth.jwt() ->> 'email', ''))
        or exists (
          select 1 from public.staff s
          where s.auth_user_id = auth.uid() and s.branch_id = a.branch_id and s.is_active
        )
      )
  );
$function$;
revoke all on function public.verify_shop_branch(text, text) from public, anon;
grant execute on function public.verify_shop_branch(text, text) to authenticated;

-- The employee's Auth session, account number and active branch must all match.
create or replace function public.authenticate_console_employee(p_account_number text)
returns table (
  id text,
  branch_id text,
  name text,
  role text,
  avatar_color text,
  is_active boolean,
  permissions jsonb,
  has_console_login boolean,
  has_pin boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.id, s.branch_id, s.name, s.role, s.avatar_color, s.is_active,
         s.permissions, true, (s.pin_hash is not null)
  from public.staff s
  join private.shop_accounts a on a.branch_id = s.branch_id
  where auth.uid() is not null
    and a.account_number = btrim(p_account_number) and a.enabled
    and s.auth_user_id = auth.uid() and s.is_active
    and s.role = 'cashier'
    and (
      s.pin_hash is not null
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(s.permissions, '[]'::jsonb)) p(value)
        where p.value not in ('pos', 'pos.view', 'pos.sell')
      )
    )
  limit 1;
$function$;
revoke all on function public.authenticate_console_employee(text) from public, anon;
grant execute on function public.authenticate_console_employee(text) to authenticated;

-- Employee email is private account data, so expose it only through this
-- scoped RPC for a user allowed to open this branch's employee directory.
create or replace function public.get_employee_console_email(
  p_account_number text,
  p_branch_id text,
  p_staff_id text
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select s.login_email
  from public.staff s
  join private.shop_accounts a on a.branch_id = s.branch_id
  where auth.uid() is not null and s.id = p_staff_id and s.branch_id = p_branch_id
    and s.auth_user_id is not null
    and a.account_number = btrim(p_account_number) and a.enabled
    and (
      a.owner_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      or exists (
        select 1 from public.staff actor
        where actor.auth_user_id = auth.uid() and actor.branch_id = p_branch_id and actor.is_active
          and (
            coalesce(actor.permissions, '[]'::jsonb) @> '["employees.view"]'::jsonb
            or coalesce(actor.permissions, '[]'::jsonb) @> '["employees.edit"]'::jsonb
            or coalesce(actor.permissions, '[]'::jsonb) @> '["employees"]'::jsonb
          )
      )
    )
  limit 1;
$function$;
revoke all on function public.get_employee_console_email(text, text, text) from public, anon;
grant execute on function public.get_employee_console_email(text, text, text) to authenticated;

-- Called by the edge function using the employee manager's JWT. It prevents
-- a forged browser request from writing to another business or granting
-- permissions the acting manager does not have.
create or replace function public.authorize_employee_console_change(
  p_account_number text,
  p_branch_id text,
  p_action text,
  p_staff_id text,
  p_permissions jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor public.staff%rowtype;
  v_target_permissions jsonb := coalesce(p_permissions, '[]'::jsonb);
  v_required text;
  v_item text;
begin
  if auth.uid() is null or p_action is null or p_action not in ('create', 'edit') or jsonb_typeof(v_target_permissions) <> 'array' then return false; end if;
  if not exists (
    select 1 from private.shop_accounts a
    where a.branch_id = p_branch_id and a.account_number = btrim(p_account_number) and a.enabled
  ) then return false; end if;

  if exists (
    select 1
    from private.shop_accounts a
    join public.staff owner_staff on owner_staff.id = a.owner_staff_id
    where a.branch_id = p_branch_id and a.account_number = btrim(p_account_number) and a.enabled
      and a.owner_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and owner_staff.role = 'owner' and owner_staff.is_active
  ) then return true; end if;

  select * into v_actor from public.staff s
  where s.auth_user_id = auth.uid() and s.branch_id = p_branch_id and s.is_active and s.role = 'cashier';
  if not found then return false; end if;

  v_required := case when p_action = 'create' then 'employees.create' else 'employees.edit' end;
  if not (
    coalesce(v_actor.permissions, '[]'::jsonb) @> jsonb_build_array(v_required)
    or coalesce(v_actor.permissions, '[]'::jsonb) @> '["employees"]'::jsonb
  ) then return false; end if;

  if coalesce(v_actor.permissions, '[]'::jsonb) @> '["employees.manage_permissions"]'::jsonb then
    for v_item in select jsonb_array_elements_text(v_target_permissions) loop
      if not (
        coalesce(v_actor.permissions, '[]'::jsonb) @> jsonb_build_array(v_item)
        or coalesce(v_actor.permissions, '[]'::jsonb) @> jsonb_build_array(split_part(v_item, '.', 1))
      ) then return false; end if;
    end loop;
    return true;
  end if;

  if p_action = 'create' then
    return v_target_permissions @> '["pos.view","pos.sell"]'::jsonb
      and jsonb_array_length(v_target_permissions) = 2;
  end if;
  return exists (
    select 1 from public.staff s where s.id = p_staff_id and s.branch_id = p_branch_id
      and (coalesce(s.permissions, '[]'::jsonb) = v_target_permissions
        or v_target_permissions = '["pos.view","pos.sell"]'::jsonb)
  );
end;
$function$;
revoke all on function public.authorize_employee_console_change(text, text, text, text, jsonb) from public, anon;
grant execute on function public.authorize_employee_console_change(text, text, text, text, jsonb) to authenticated;

-- Service-role-only atomic staff-row save. The edge function creates/updates
-- Supabase Auth users and calls this RPC; passwords never enter Postgres.
create or replace function public.save_console_employee(
  p_id text,
  p_branch_id text,
  p_name text,
  p_pin text,
  p_avatar_color text,
  p_is_active boolean,
  p_permissions jsonb,
  p_auth_user_id uuid,
  p_login_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_existing public.staff%rowtype;
  v_is_existing boolean := false;
  v_email text := nullif(lower(btrim(coalesce(p_login_email, ''))), '');
  v_pin_hash text;
  v_has_pin boolean;
  v_has_non_cashier_permission boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_id is null or nullif(btrim(p_name), '') is null or p_auth_user_id is null
     or p_permissions is null or jsonb_typeof(p_permissions) <> 'array'
     or p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid employee account input' using errcode = '22023';
  end if;
  if not exists (
    select 1 from private.shop_accounts a where a.branch_id = p_branch_id and a.enabled
  ) then raise exception 'branch is not assigned to a business account' using errcode = '42501'; end if;

  select * into v_existing from public.staff where id = p_id for update;
  v_is_existing := found;
  if v_is_existing and v_existing.branch_id <> p_branch_id then
    raise exception 'employee belongs to another branch' using errcode = '42501';
  end if;
  v_has_pin := p_pin is not null or (v_is_existing and v_existing.pin_hash is not null);
  select exists (
    select 1 from jsonb_array_elements_text(p_permissions) p(value)
    where p.value not in ('pos', 'pos.view', 'pos.sell')
  ) into v_has_non_cashier_permission;
  if not v_has_pin and not v_has_non_cashier_permission then
    raise exception 'console login requires a non-cashier permission when no PIN is set' using errcode = '22023';
  end if;
  if p_pin is not null then v_pin_hash := crypt(p_pin, gen_salt('bf')); end if;

  if v_is_existing then
    update public.staff set
      name = btrim(p_name),
      pin_hash = coalesce(v_pin_hash, pin_hash),
      role = 'cashier', avatar_color = p_avatar_color, is_active = p_is_active,
      permissions = p_permissions, auth_user_id = p_auth_user_id, login_email = coalesce(v_email, login_email)
    where id = p_id;
  else
    if v_email is null then raise exception 'employee email is required' using errcode = '22023'; end if;
    insert into public.staff (id, branch_id, name, pin_hash, role, avatar_color, is_active, permissions, auth_user_id, login_email)
    values (p_id, p_branch_id, btrim(p_name), v_pin_hash, 'cashier', p_avatar_color, p_is_active, p_permissions, p_auth_user_id, v_email);
  end if;

  select * into v_existing from public.staff where id = p_id;
  return jsonb_build_object(
    'id', v_existing.id, 'branchId', v_existing.branch_id, 'name', v_existing.name,
    'role', v_existing.role, 'avatarColor', v_existing.avatar_color, 'isActive', v_existing.is_active,
    'permissions', v_existing.permissions, 'hasConsoleLogin', (v_existing.auth_user_id is not null),
    'hasPin', (v_existing.pin_hash is not null), 'email', v_existing.login_email
  );
end;
$function$;
revoke all on function public.save_console_employee(text, text, text, text, text, boolean, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.save_console_employee(text, text, text, text, text, boolean, jsonb, uuid, text) to service_role;
