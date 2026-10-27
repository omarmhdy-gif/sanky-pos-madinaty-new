-- Multi-business provisioning and branch isolation.
-- Tenant isolation for the hosted app and the activated Electron cashier.
-- Anonymous access remains limited to the legacy Madinaty branch during rollout.
begin;

-- A single owner email may own more than one business. Do not make it unique;
-- each Auth session can access only the branches mapped to that email.

create table if not exists private.shop_devices (
  device_uuid uuid primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  branch_id text not null references public.branches(id) on delete cascade,
  account_number text not null check (account_number ~ '^[0-9]{4}$'),
  is_active boolean not null default true,
  activated_at timestamptz not null default now()
);
alter table private.shop_devices enable row level security;
revoke all on private.shop_devices from public, anon, authenticated;

create or replace function private.shop_branch_accessible(p_branch_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_account_number text := coalesce(auth.jwt() -> 'user_metadata' ->> 'account_number', '');
begin
  if p_branch_id is null then return false; end if;
  if v_role = 'service_role' then return true; end if;
  -- Keep the legacy Madinaty workstation alive until its cashier app is
  -- upgraded. New business branches are never exposed to anonymous clients.
  if v_role = 'anon' then return p_branch_id = 'branch_madinaty'; end if;
  if v_role <> 'authenticated' or auth.uid() is null then return false; end if;

  return exists (
      select 1
      from private.shop_devices d
      where d.auth_user_id = auth.uid()
        and d.branch_id = p_branch_id
        and d.is_active
    ) or (
      v_email <> ''
      and exists (
      select 1
      from private.shop_accounts a
      where a.branch_id = p_branch_id
        and a.owner_email = v_email
        and (
          a.account_number = v_account_number
          or (p_branch_id = 'branch_madinaty' and v_account_number = '')
        )
        and a.enabled
      )
    );
end;
$$;

revoke all on function private.shop_branch_accessible(text) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.shop_branch_accessible(text) to anon, authenticated;

create or replace function public.register_shop_device(
  p_account_number text,
  p_device_uuid uuid,
  p_auth_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_branch_id text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_account_number !~ '^[0-9]{4}$' or p_device_uuid is null or p_auth_user_id is null then
    raise exception 'invalid device activation input' using errcode = '22023';
  end if;
  select a.branch_id into v_branch_id
  from private.shop_accounts a
  where a.account_number = p_account_number and a.enabled;
  if not found then raise exception 'business account not found' using errcode = 'P0002'; end if;
  insert into private.shop_devices (device_uuid, auth_user_id, branch_id, account_number)
  values (p_device_uuid, p_auth_user_id, v_branch_id, p_account_number);
  return v_branch_id;
end;
$$;

revoke all on function public.register_shop_device(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_shop_device(text, uuid, uuid) to service_role;

create or replace function public.verify_shop_device_session(p_account_number text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
    and auth.uid() is not null
    and exists (
      select 1 from private.shop_devices d
      where d.auth_user_id = auth.uid()
        and d.account_number = p_account_number
        and d.is_active
    );
$$;
revoke all on function public.verify_shop_device_session(text) from public, anon;
grant execute on function public.verify_shop_device_session(text) to authenticated;

create or replace function private.enforce_shop_branch_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_branch_id text;
  v_new_branch_id text;
begin
  if tg_table_name = 'branches' then
    if tg_op <> 'INSERT' then v_old_branch_id := to_jsonb(old) ->> 'id'; end if;
    if tg_op <> 'DELETE' then v_new_branch_id := to_jsonb(new) ->> 'id'; end if;
  else
    if tg_op <> 'INSERT' then v_old_branch_id := to_jsonb(old) ->> 'branch_id'; end if;
    if tg_op <> 'DELETE' then v_new_branch_id := to_jsonb(new) ->> 'branch_id'; end if;
  end if;

  if tg_op <> 'INSERT' and not private.shop_branch_accessible(v_old_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and not private.shop_branch_accessible(v_new_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.provision_platform_business(
  p_platform_shop_id uuid,
  p_account_number text,
  p_shop_name text,
  p_owner_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id text := 'business_' || replace(p_platform_shop_id::text, '-', '');
  v_owner_staff_id text := 'owner_' || replace(p_platform_shop_id::text, '-', '');
  v_email text := lower(btrim(p_owner_email));
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_platform_shop_id is null or p_account_number !~ '^[0-9]{4}$'
     or v_email = '' or nullif(btrim(p_shop_name), '') is null then
    raise exception 'invalid business provisioning input' using errcode = '22023';
  end if;

  if exists (select 1 from private.shop_accounts a where a.branch_id = v_branch_id) then
    if exists (
      select 1 from private.shop_accounts a
      where a.branch_id = v_branch_id
        and a.account_number = p_account_number
        and a.owner_email = v_email
        and a.enabled
    ) then
      return jsonb_build_object('branchId', v_branch_id, 'ownerStaffId', v_owner_staff_id);
    end if;
    raise exception 'business branch is already bound to another account' using errcode = '23505';
  end if;

  insert into public.branches (id, name)
    values (v_branch_id, jsonb_build_object('en', btrim(p_shop_name), 'ar', btrim(p_shop_name)));
  insert into public.shop_settings (
    branch_id, shop_name, currency, currency_symbol, tax_rate, tax_enabled, locale, theme
  ) values (
    v_branch_id, btrim(p_shop_name), 'EGP', 'EGP', 0, false, 'ar', 'dark'
  );
  insert into public.staff (
    id, branch_id, name, pin_hash, role, avatar_color, is_active
  ) values (
    v_owner_staff_id, v_branch_id, btrim(p_shop_name), null, 'owner', '#c4a574', true
  );
  insert into private.shop_accounts (
    branch_id, account_number, owner_email, enabled, owner_staff_id
  ) values (
    v_branch_id, p_account_number, v_email, true, v_owner_staff_id
  );

  return jsonb_build_object('branchId', v_branch_id, 'ownerStaffId', v_owner_staff_id);
end;
$$;

create or replace function public.deprovision_empty_platform_business(p_branch_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table record;
  v_has_rows boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_branch_id is null or p_branch_id !~ '^business_[0-9a-f]{32}$' then
    raise exception 'invalid business branch' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch_id) then return; end if;

  for v_table in
    select c.table_schema, c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'branch_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in ('shop_settings', 'staff')
  loop
    execute format(
      'select exists (select 1 from %I.%I where branch_id = $1)',
      v_table.table_schema, v_table.table_name
    ) into v_has_rows using p_branch_id;
    if v_has_rows then
      raise exception 'business branch is no longer empty; cleanup refused' using errcode = '55000';
    end if;
  end loop;

  delete from private.shop_accounts where branch_id = p_branch_id;
  delete from public.staff where branch_id = p_branch_id;
  delete from public.shop_settings where branch_id = p_branch_id;
  delete from public.branches where id = p_branch_id;
end;
$$;

revoke all on function public.provision_platform_business(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.deprovision_empty_platform_business(text) from public, anon, authenticated;
grant execute on function public.provision_platform_business(uuid, text, text, text) to service_role;
grant execute on function public.deprovision_empty_platform_business(text) to service_role;

-- Restrict every branch-keyed table to the signed-in owner whose email is
-- uniquely mapped to that branch in private.shop_accounts.
do $$
declare
  v_table record;
  v_policy record;
begin
  for v_table in
    select distinct c.table_schema, c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'branch_id'
      and t.table_type = 'BASE TABLE'
  loop
    for v_policy in
      select policyname from pg_policies
      where schemaname = v_table.table_schema and tablename = v_table.table_name
    loop
      execute format('drop policy %I on %I.%I', v_policy.policyname, v_table.table_schema, v_table.table_name);
    end loop;

    execute format('alter table %I.%I enable row level security', v_table.table_schema, v_table.table_name);
    execute format(
      'create policy shop_branch_scope on %I.%I for all to anon, authenticated using (private.shop_branch_accessible(branch_id)) with check (private.shop_branch_accessible(branch_id))',
      v_table.table_schema, v_table.table_name
    );
    execute format('drop trigger if exists enforce_shop_branch_write on %I.%I', v_table.table_schema, v_table.table_name);
    execute format(
      'create trigger enforce_shop_branch_write before insert or update or delete on %I.%I for each row execute function private.enforce_shop_branch_write()',
      v_table.table_schema, v_table.table_name
    );
  end loop;

  for v_policy in select policyname from pg_policies where schemaname = 'public' and tablename = 'branches'
  loop
    execute format('drop policy %I on public.branches', v_policy.policyname);
  end loop;
  alter table public.branches enable row level security;
  create policy shop_branch_scope on public.branches
    for all to anon, authenticated
    using (private.shop_branch_accessible(id))
    with check (private.shop_branch_accessible(id));
  drop trigger if exists enforce_shop_branch_write on public.branches;
  create trigger enforce_shop_branch_write before insert or update or delete on public.branches
    for each row execute function private.enforce_shop_branch_write();
end;
$$;

-- order_lines inherits its tenant exclusively through orders.
do $$
declare v_policy record;
begin
  for v_policy in select policyname from pg_policies where schemaname = 'public' and tablename = 'order_lines'
  loop execute format('drop policy %I on public.order_lines', v_policy.policyname); end loop;
end;
$$;
alter table public.order_lines enable row level security;
create policy shop_branch_scope on public.order_lines
  for all to anon, authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_lines.order_id
        and private.shop_branch_accessible(o.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_lines.order_id
        and private.shop_branch_accessible(o.branch_id)
    )
  );

-- These views must obey the RLS of the underlying tables and never expose PIN hashes.
-- Older production databases may be missing nullable UI metadata from earlier
-- app releases; add the columns here so creating the protected views/functions
-- below remains compatible without modifying existing employee records.
alter table public.staff add column if not exists permissions jsonb;
alter table public.attendance_employees add column if not exists assigned_shift_key text;
alter table public.attendance_employees add column if not exists shift_start text;
alter table public.attendance_employees add column if not exists shift_end text;
alter table public.attendance_employees add column if not exists grace_minutes integer not null default 0;

create or replace view public.staff_public with (security_invoker = true) as
  select id, branch_id, name, role, avatar_color, is_active, permissions from public.staff;
create or replace view public.attendance_employees_public with (security_invoker = true) as
  select id, branch_id, name, is_active, assigned_shift_key, shift_start, shift_end, grace_minutes
  from public.attendance_employees;

revoke all on public.staff, public.attendance_employees from public, anon, authenticated;
grant select (id, branch_id, name, role, avatar_color, is_active, permissions)
  on public.staff to anon, authenticated;
grant select (id, branch_id, name, is_active, assigned_shift_key, shift_start, shift_end, grace_minutes)
  on public.attendance_employees to anon, authenticated;
grant select on public.staff_public, public.attendance_employees_public to anon, authenticated;

-- Sensitive PIN-check/admin functions stay SECURITY DEFINER; constrain their
-- explicit branch input before any staff/PIN lookup. Writes are also guarded
-- by branch triggers above.
create or replace function public.verify_staff_pin(p_staff_id text, p_pin text, p_branch_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_staff public.staff%rowtype;
begin
  if not private.shop_branch_accessible(p_branch_id) then return null; end if;
  select * into v_staff from public.staff
    where id = p_staff_id and branch_id = p_branch_id and is_active = true;
  if not found or v_staff.pin_hash is null then return null; end if;
  if v_staff.pin_hash = extensions.crypt(p_pin, v_staff.pin_hash) then
    return jsonb_build_object(
      'id', v_staff.id, 'branchId', v_staff.branch_id, 'name', v_staff.name,
      'role', v_staff.role, 'avatarColor', v_staff.avatar_color,
      'isActive', v_staff.is_active, 'permissions', v_staff.permissions
    );
  end if;
  return null;
end;
$$;

create or replace function public.authenticate_staff_pin(p_pin text, p_branch_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_staff public.staff%rowtype; v_matches integer;
begin
  if not private.shop_branch_accessible(p_branch_id) or p_pin !~ '^[0-9]{4}$' then return null; end if;
  select count(*) into v_matches from public.staff
    where branch_id = p_branch_id and is_active and pin_hash is not null
      and pin_hash = extensions.crypt(p_pin, pin_hash);
  if v_matches <> 1 then return null; end if;
  select * into v_staff from public.staff
    where branch_id = p_branch_id and is_active and pin_hash = extensions.crypt(p_pin, pin_hash)
    limit 1;
  return jsonb_build_object(
    'id', v_staff.id, 'branchId', v_staff.branch_id, 'name', v_staff.name,
    'role', v_staff.role, 'avatarColor', v_staff.avatar_color,
    'isActive', v_staff.is_active, 'permissions', v_staff.permissions
  );
end;
$$;

create or replace function public.verify_attendance_pin(p_employee_id text, p_pin text, p_branch_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_employee public.attendance_employees%rowtype;
begin
  if not private.shop_branch_accessible(p_branch_id) then return null; end if;
  select * into v_employee from public.attendance_employees
    where id = p_employee_id and branch_id = p_branch_id and is_active;
  if not found or v_employee.pin_hash is null then return null; end if;
  if v_employee.pin_hash = extensions.crypt(p_pin, v_employee.pin_hash) then
    return jsonb_build_object(
      'id', v_employee.id, 'branchId', v_employee.branch_id,
      'name', v_employee.name, 'isActive', v_employee.is_active
    );
  end if;
  return null;
end;
$$;

-- Attendance tables are intentionally writable only through these RPCs, so
-- keep SECURITY DEFINER and enforce the caller's mapped branch explicitly.
create or replace function public.check_in_attendance(
  p_branch_id text,
  p_employee_id text,
  p_employee_name text,
  p_shift_key text,
  p_official_start text,
  p_official_end text,
  p_grace_minutes int default 0
)
returns public.attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := gen_random_uuid()::text;
  v_now timestamptz := now();
  v_official_start_ts timestamptz := (current_date + p_official_start::time);
  v_raw_late_minutes int := round(extract(epoch from (v_now - v_official_start_ts)) / 60)::int;
  v_late_minutes int := greatest(0, v_raw_late_minutes - coalesce(p_grace_minutes, 0));
  v_employee_name text;
  v_row public.attendance;
begin
  if not private.shop_branch_accessible(p_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  select e.name into v_employee_name
  from public.attendance_employees e
  where e.id = p_employee_id and e.branch_id = p_branch_id and e.is_active;
  if not found then
    raise exception 'Employee access denied' using errcode = '42501';
  end if;

  insert into public.attendance (
    id, branch_id, employee_id, employee_name, shift_key,
    official_start, official_end, check_in_at, late_minutes
  ) values (
    v_id, p_branch_id, p_employee_id, v_employee_name, p_shift_key,
    p_official_start, p_official_end, v_now, v_late_minutes
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.check_out_attendance(p_attendance_id text)
returns public.attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_branch_id text;
  v_check_in_at timestamptz;
  v_official_end text;
  v_official_end_ts timestamptz;
  v_worked_minutes int;
  v_overtime_minutes int;
  v_row public.attendance;
begin
  select a.branch_id, a.check_in_at, a.official_end
    into v_branch_id, v_check_in_at, v_official_end
    from public.attendance a
    where a.id = p_attendance_id;

  if not found or not private.shop_branch_accessible(v_branch_id) then
    raise exception 'Attendance record not found' using errcode = '42501';
  end if;

  v_official_end_ts := (current_date + v_official_end::time);
  v_worked_minutes := round(extract(epoch from (v_now - v_check_in_at)) / 60);
  v_overtime_minutes := greatest(0, round(extract(epoch from (v_now - v_official_end_ts)) / 60))::int;

  update public.attendance
    set check_out_at = v_now,
        worked_minutes = v_worked_minutes,
        overtime_minutes = v_overtime_minutes
    where id = p_attendance_id and branch_id = v_branch_id
    returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.hr_create_session(p_branch_id text, p_pin text)
returns text language plpgsql security definer set search_path = pg_catalog, public, extensions, private as $$
declare
  v_staff_id text;
  v_token text;
  v_ip text;
  v_attempt_count integer;
begin
  if not private.shop_branch_accessible(p_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  v_ip := coalesce(
    nullif(split_part(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ',', 1), ''),
    'unknown'
  );
  delete from private.hr_pin_attempts where attempted_at < now() - interval '10 minutes';
  select count(*) into v_attempt_count from private.hr_pin_attempts
    where client_ip = v_ip and attempted_at >= now() - interval '10 minutes';
  if v_attempt_count >= 8 then
    raise exception 'Too many HR PIN attempts. Try again in 10 minutes.' using errcode = '28000';
  end if;
  select id into v_staff_id from public.staff
    where branch_id = p_branch_id and role = 'owner' and is_active
      and pin_hash = extensions.crypt(p_pin, pin_hash) limit 1;
  if v_staff_id is null then
    insert into private.hr_pin_attempts (client_ip) values (v_ip);
    raise exception 'Owner PIN is incorrect.' using errcode = '28000';
  end if;
  delete from private.hr_sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.hr_sessions (token_hash, owner_staff_id, branch_id, expires_at)
    values (extensions.digest(v_token, 'sha256'), v_staff_id, p_branch_id, now() + interval '4 hours');
  delete from private.hr_pin_attempts where client_ip = v_ip;
  return v_token;
end;
$$;

-- Ordinary SECURITY DEFINER business RPCs now run as the authenticated role,
-- which is subject to the same RLS policies as the web owner. Sensitive
-- credential/admin RPCs and token-bound HR RPCs are excluded above.
grant create on schema public to authenticated;
do $$
declare v_function record;
begin
  for v_function in
    select p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname not like 'platform_%'
      and p.proname not in (
        'verify_shop_account', 'authenticate_shop_owner',
        'verify_staff_pin', 'authenticate_staff_pin', 'save_staff', 'delete_staff',
        'verify_attendance_pin', 'save_attendance_employee', 'delete_attendance_employee',
        'check_in_attendance', 'check_out_attendance',
        'hr_create_session', 'hr_verify_session', 'provision_platform_business',
        'deprovision_empty_platform_business'
      )
      and p.proname not like 'hr_%'
      and p.proname not like 'seed_%'
      and p.proname not in ('reset_demo_data', 'import_real_menu')
  loop
    execute format('alter function %I.%I(%s) owner to authenticated', v_function.nspname, v_function.proname, v_function.args);
  end loop;
end;
$$;
revoke create on schema public from authenticated;

do $$
declare v_function record;
begin
  for v_function in
    select p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname in ('reset_demo_data', 'import_real_menu') or p.proname like 'seed_%')
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated', v_function.nspname, v_function.proname, v_function.args);
  end loop;
end;
$$;

commit;
