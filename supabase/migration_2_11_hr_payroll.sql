-- HR employee profiles and monthly payroll.
-- Salary data is deliberately inaccessible through direct Data API table access.
-- All reads/writes go through short-lived, owner-PIN-verified RPC sessions.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.hr_sessions (
  token_hash bytea primary key,
  owner_staff_id text not null references public.staff(id) on delete cascade,
  branch_id text not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists private.hr_pin_attempts (
  id bigint generated always as identity primary key,
  client_ip text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists hr_pin_attempts_ip_time_idx on private.hr_pin_attempts (client_ip, attempted_at desc);

create table if not exists public.hr_employee_profiles (
  employee_id text primary key references public.attendance_employees(id) on delete cascade,
  branch_id text not null references public.branches(id) on delete cascade,
  phone text,
  job_title text,
  hire_date date,
  monthly_salary numeric(12,2) not null default 0 check (monthly_salary >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_payroll_entries (
  id text primary key default ('pay_' || replace(gen_random_uuid()::text, '-', '')),
  branch_id text not null references public.branches(id) on delete cascade,
  employee_id text not null references public.attendance_employees(id) on delete restrict,
  payroll_month date not null,
  base_salary numeric(12,2) not null check (base_salary >= 0),
  deductions jsonb not null default '[]'::jsonb check (jsonb_typeof(deductions) = 'array'),
  total_deductions numeric(12,2) not null default 0 check (total_deductions >= 0),
  net_salary numeric(12,2) not null default 0 check (net_salary >= 0),
  note text,
  status text not null default 'draft' check (status in ('draft', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (branch_id, employee_id, payroll_month),
  check (payroll_month = date_trunc('month', payroll_month)::date),
  check (total_deductions <= base_salary)
);
create index if not exists hr_payroll_branch_month_idx on public.hr_payroll_entries (branch_id, payroll_month desc);

alter table private.hr_sessions enable row level security;
alter table private.hr_pin_attempts enable row level security;
alter table public.hr_employee_profiles enable row level security;
alter table public.hr_payroll_entries enable row level security;

revoke all on private.hr_sessions, private.hr_pin_attempts from public, anon, authenticated;
revoke all on public.hr_employee_profiles, public.hr_payroll_entries from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

create or replace function public.hr_create_session(p_branch_id text, p_pin text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_staff_id text;
  v_token text;
  v_ip text;
  v_attempt_count integer;
begin
  v_ip := coalesce(
    nullif(split_part(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ',', 1), ''),
    'unknown'
  );
  delete from private.hr_pin_attempts where attempted_at < now() - interval '10 minutes';
  select count(*) into v_attempt_count
    from private.hr_pin_attempts
    where client_ip = v_ip and attempted_at >= now() - interval '10 minutes';
  if v_attempt_count >= 8 then
    raise exception 'Too many HR PIN attempts. Try again in 10 minutes.' using errcode = '28000';
  end if;

  select id into v_staff_id
    from public.staff
    where branch_id = p_branch_id
      and role = 'owner'
      and is_active
      and pin_hash = extensions.crypt(p_pin, pin_hash)
    limit 1;
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
revoke all on function public.hr_create_session(text, text) from public;
grant execute on function public.hr_create_session(text, text) to anon, authenticated;

create or replace function public.hr_verify_session(p_branch_id text, p_session_token text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare v_staff_id text;
begin
  select s.owner_staff_id into v_staff_id
    from private.hr_sessions s
    join public.staff owner_user on owner_user.id = s.owner_staff_id
    where s.token_hash = extensions.digest(p_session_token, 'sha256')
      and s.branch_id = p_branch_id
      and s.expires_at > now()
      and owner_user.is_active
      and owner_user.role = 'owner';
  if v_staff_id is null then
    raise exception 'HR session expired. Enter the owner PIN again.' using errcode = '28000';
  end if;
  return v_staff_id;
end;
$$;
revoke all on function public.hr_verify_session(text, text) from public, anon, authenticated;

create or replace function public.hr_list_employees(p_branch_id text, p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
begin
  perform public.hr_verify_session(p_branch_id, p_session_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'branchId', e.branch_id, 'name', e.name, 'isActive', e.is_active,
      'phone', p.phone, 'jobTitle', p.job_title, 'hireDate', p.hire_date,
      'monthlySalary', coalesce(p.monthly_salary, 0)
    ) order by e.name)
    from public.attendance_employees e
    left join public.hr_employee_profiles p on p.employee_id = e.id and p.branch_id = e.branch_id
    where e.branch_id = p_branch_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.hr_save_employee(
  p_branch_id text,
  p_session_token text,
  p_employee_id text,
  p_name text,
  p_pin text,
  p_is_active boolean,
  p_phone text,
  p_job_title text,
  p_hire_date date,
  p_monthly_salary numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_employee_id text;
  v_employee_branch text;
  v_pin_hash text;
begin
  perform public.hr_verify_session(p_branch_id, p_session_token);
  if nullif(trim(p_name), '') is null or p_monthly_salary is null or p_monthly_salary < 0 then
    raise exception 'Name and a non-negative monthly salary are required.' using errcode = '22023';
  end if;
  v_employee_id := coalesce(nullif(trim(p_employee_id), ''), 'hr_' || replace(gen_random_uuid()::text, '-', ''));
  select branch_id into v_employee_branch from public.attendance_employees where id = v_employee_id;
  if v_employee_branch is not null and v_employee_branch <> p_branch_id then
    raise exception 'Employee belongs to another branch.' using errcode = '22023';
  end if;
  if v_employee_branch is null and coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'A new employee needs a four-digit attendance PIN.' using errcode = '22023';
  end if;
  if p_pin is not null and p_pin <> '' then
    if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must contain four digits.' using errcode = '22023'; end if;
    v_pin_hash := extensions.crypt(p_pin, extensions.gen_salt('bf'));
  end if;

  if v_employee_branch is null then
    insert into public.attendance_employees (id, name, pin_hash, is_active, branch_id)
      values (v_employee_id, trim(p_name), v_pin_hash, coalesce(p_is_active, true), p_branch_id);
  else
    update public.attendance_employees
      set name = trim(p_name),
          pin_hash = coalesce(v_pin_hash, pin_hash),
          is_active = coalesce(p_is_active, true)
      where id = v_employee_id and branch_id = p_branch_id;
  end if;

  insert into public.hr_employee_profiles (employee_id, branch_id, phone, job_title, hire_date, monthly_salary, updated_at)
    values (v_employee_id, p_branch_id, nullif(trim(p_phone), ''), nullif(trim(p_job_title), ''), p_hire_date, p_monthly_salary, now())
  on conflict (employee_id) do update set
    phone = excluded.phone, job_title = excluded.job_title, hire_date = excluded.hire_date,
    monthly_salary = excluded.monthly_salary, updated_at = now();

  return jsonb_build_object(
    'id', v_employee_id, 'branchId', p_branch_id, 'name', trim(p_name),
    'isActive', coalesce(p_is_active, true), 'phone', nullif(trim(p_phone), ''),
    'jobTitle', nullif(trim(p_job_title), ''), 'hireDate', p_hire_date,
    'monthlySalary', p_monthly_salary
  );
end;
$$;

create or replace function public.hr_generate_payroll(p_branch_id text, p_session_token text, p_payroll_month date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare v_month date := date_trunc('month', p_payroll_month)::date;
begin
  perform public.hr_verify_session(p_branch_id, p_session_token);
  insert into public.hr_payroll_entries (branch_id, employee_id, payroll_month, base_salary, net_salary)
    select p_branch_id, e.id, v_month, p.monthly_salary, p.monthly_salary
    from public.attendance_employees e
    join public.hr_employee_profiles p on p.employee_id = e.id and p.branch_id = e.branch_id
    where e.branch_id = p_branch_id and e.is_active and p.monthly_salary > 0
    on conflict (branch_id, employee_id, payroll_month) do nothing;
  return public.hr_list_payroll(p_branch_id, p_session_token, v_month);
end;
$$;

create or replace function public.hr_list_payroll(p_branch_id text, p_session_token text, p_payroll_month date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare v_month date := date_trunc('month', p_payroll_month)::date;
begin
  perform public.hr_verify_session(p_branch_id, p_session_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'branchId', r.branch_id, 'employeeId', r.employee_id,
      'employeeName', e.name, 'payrollMonth', r.payroll_month,
      'baseSalary', r.base_salary, 'deductions', r.deductions,
      'totalDeductions', r.total_deductions, 'netSalary', r.net_salary,
      'note', r.note, 'status', r.status, 'createdAt', r.created_at, 'paidAt', r.paid_at
    ) order by e.name)
    from public.hr_payroll_entries r
    join public.attendance_employees e on e.id = r.employee_id and e.branch_id = r.branch_id
    where r.branch_id = p_branch_id and r.payroll_month = v_month
  ), '[]'::jsonb);
end;
$$;

create or replace function public.hr_save_payroll_deductions(
  p_branch_id text,
  p_session_token text,
  p_payroll_id text,
  p_deductions jsonb,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_base numeric(12,2);
  v_total numeric(12,2);
begin
  perform public.hr_verify_session(p_branch_id, p_session_token);
  if jsonb_typeof(p_deductions) <> 'array' then raise exception 'Deductions must be a list.' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_deductions) d
    where nullif(trim(d->>'description'), '') is null or coalesce((d->>'amount')::numeric, 0) <= 0
  ) then raise exception 'Every deduction needs a description and an amount greater than zero.' using errcode = '22023'; end if;
  select coalesce(sum((d->>'amount')::numeric), 0) into v_total from jsonb_array_elements(p_deductions) d;
  select base_salary into v_base from public.hr_payroll_entries
    where id = p_payroll_id and branch_id = p_branch_id and status = 'draft' for update;
  if v_base is null then raise exception 'Draft payroll entry not found.' using errcode = '22023'; end if;
  if v_total > v_base then raise exception 'Deductions cannot exceed the base salary.' using errcode = '22023'; end if;
  update public.hr_payroll_entries
    set deductions = p_deductions, total_deductions = v_total, net_salary = v_base - v_total, note = nullif(trim(p_note), '')
    where id = p_payroll_id and branch_id = p_branch_id;
  return public.hr_list_payroll(p_branch_id, p_session_token, (select payroll_month from public.hr_payroll_entries where id = p_payroll_id));
end;
$$;

create or replace function public.hr_mark_payroll_paid(p_branch_id text, p_session_token text, p_payroll_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare v_month date;
begin
  perform public.hr_verify_session(p_branch_id, p_session_token);
  update public.hr_payroll_entries set status = 'paid', paid_at = now()
    where id = p_payroll_id and branch_id = p_branch_id and status = 'draft'
    returning payroll_month into v_month;
  if v_month is null then raise exception 'Draft payroll entry not found.' using errcode = '22023'; end if;
  return public.hr_list_payroll(p_branch_id, p_session_token, v_month);
end;
$$;

revoke all on function public.hr_list_employees(text, text) from public;
revoke all on function public.hr_save_employee(text, text, text, text, text, boolean, text, text, date, numeric) from public;
revoke all on function public.hr_generate_payroll(text, text, date) from public;
revoke all on function public.hr_list_payroll(text, text, date) from public;
revoke all on function public.hr_save_payroll_deductions(text, text, text, jsonb, text) from public;
revoke all on function public.hr_mark_payroll_paid(text, text, text) from public;
grant execute on function public.hr_list_employees(text, text) to anon, authenticated;
grant execute on function public.hr_save_employee(text, text, text, text, text, boolean, text, text, date, numeric) to anon, authenticated;
grant execute on function public.hr_generate_payroll(text, text, date) to anon, authenticated;
grant execute on function public.hr_list_payroll(text, text, date) to anon, authenticated;
grant execute on function public.hr_save_payroll_deductions(text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.hr_mark_payroll_paid(text, text, text) to anon, authenticated;
