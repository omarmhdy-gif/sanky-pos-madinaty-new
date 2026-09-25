-- ============================================================================
-- Milestone 1.5 / 2.0 — Production Mode + Attendance/Recipe revisions
-- ADDITIVE-SAFE TO RUN: adds new columns/tables/functions only. Does not
-- drop or truncate any existing data. Safe to re-run (uses if-not-exists /
-- or-replace / defensive column renames throughout). Run this whole file
-- once in the Supabase SQL Editor (select all, run).
-- ============================================================================

-- ---- 1. Barcode on products (Devices > Barcode Scanner) --------------------
alter table products add column if not exists barcode text;

-- ---- 1b. "Match Recipe With Other Branch" sync flag on products ------------
alter table products add column if not exists recipe_synced boolean not null default false;

-- ---- 2. Supplier on purchases (Finance > Receive Stock) --------------------
alter table purchases add column if not exists supplier text;

drop function if exists receive_purchase(text, text, numeric, numeric, text, text);

create or replace function receive_purchase(
  p_branch_id text,
  p_inventory_item_id text,
  p_qty numeric,
  p_unit_cost numeric,
  p_employee_id text,
  p_employee_name text,
  p_supplier text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_qty numeric;
  v_new_avg numeric;
  v_movement_id text := gen_random_uuid()::text;
  v_purchase_id text := gen_random_uuid()::text;
  v_created_at timestamptz := now();
  v_total_cost numeric := p_qty * p_unit_cost;
begin
  select quantity, average_cost into v_old_qty, v_old_avg
    from inventory_items where id = p_inventory_item_id and branch_id = p_branch_id;

  if not found then
    raise exception 'Inventory item % not found in branch %', p_inventory_item_id, p_branch_id;
  end if;

  if v_old_avg is null or v_old_qty <= 0 then
    v_new_avg := p_unit_cost;
  else
    v_new_avg := (v_old_avg * v_old_qty + p_unit_cost * p_qty) / (v_old_qty + p_qty);
  end if;

  update inventory_items
    set quantity = quantity + p_qty,
        last_purchase_cost = p_unit_cost,
        average_cost = v_new_avg
    where id = p_inventory_item_id
    returning quantity into v_new_qty;

  insert into stock_movements (id, branch_id, inventory_item_id, quantity_delta, reason, employee_id, employee_name, created_at)
  values (v_movement_id, p_branch_id, p_inventory_item_id, p_qty, 'manual_receive', p_employee_id, p_employee_name, v_created_at);

  insert into purchases (id, branch_id, inventory_item_id, quantity, unit_cost, total_cost, supplier, employee_id, employee_name, created_at)
  values (v_purchase_id, p_branch_id, p_inventory_item_id, p_qty, p_unit_cost, v_total_cost, p_supplier, p_employee_id, p_employee_name, v_created_at);

  return jsonb_build_object(
    'inventoryItem', jsonb_build_object(
      'id', p_inventory_item_id,
      'quantity', v_new_qty,
      'lastPurchaseCost', p_unit_cost,
      'averageCost', v_new_avg
    ),
    'movement', jsonb_build_object(
      'id', v_movement_id,
      'branchId', p_branch_id,
      'inventoryItemId', p_inventory_item_id,
      'quantityDelta', p_qty,
      'reason', 'manual_receive',
      'employeeId', p_employee_id,
      'employeeName', p_employee_name,
      'createdAt', to_char(v_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'purchase', jsonb_build_object(
      'id', v_purchase_id,
      'branchId', p_branch_id,
      'inventoryItemId', p_inventory_item_id,
      'quantity', p_qty,
      'unitCost', p_unit_cost,
      'totalCost', v_total_cost,
      'supplier', p_supplier,
      'employeeId', p_employee_id,
      'employeeName', p_employee_name,
      'createdAt', to_char(v_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
end;
$$;

grant execute on function receive_purchase(text, text, numeric, numeric, text, text, text) to anon, authenticated;

-- ---- 3. Shift templates on shop_settings (Attendance) -----------------------
alter table shop_settings add column if not exists shift_templates jsonb;

update shop_settings
set shift_templates = '[
  {"key":"morning","name":{"en":"Morning","ar":"صباحي"},"officialStart":"08:00","officialEnd":"16:00","windowStart":"07:30","windowEnd":"10:00"},
  {"key":"between","name":{"en":"Between","ar":"مسائي"},"officialStart":"16:00","officialEnd":"00:00","windowStart":"15:30","windowEnd":"18:00"},
  {"key":"night","name":{"en":"Night","ar":"ليلي"},"officialStart":"00:00","officialEnd":"08:00","windowStart":"23:30","windowEnd":"02:00"}
]'::jsonb
where shift_templates is null;

-- ---- 4. Attendance Employees — a roster entirely separate from `staff` -----
-- (login accounts). Only a name + PIN; the PIN has no login/role meaning,
-- it only unlocks the in-app Attendance page's check-in/check-out flow.
-- Same lockdown pattern as staff/staff_public: no anon policy on the raw
-- table, reachable only via the public view + the SECURITY DEFINER RPCs
-- below.
create table if not exists attendance_employees (
  id text primary key,
  branch_id text not null references branches(id),
  pin_hash text,
  name text not null,
  is_active boolean not null default true
);

alter table attendance_employees enable row level security;
-- Deliberately no policy on the raw table — same lockdown as `staff`: only
-- reachable via the public view (no pin_hash) and the SECURITY DEFINER
-- functions below.

drop view if exists attendance_employees_public;
create view attendance_employees_public as
  select id, branch_id, name, is_active from attendance_employees;

grant select on attendance_employees_public to anon, authenticated;

create or replace function verify_attendance_pin(p_employee_id text, p_pin text, p_branch_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_emp attendance_employees%rowtype;
begin
  select * into v_emp from attendance_employees
    where id = p_employee_id and branch_id = p_branch_id and is_active = true;
  if not found or v_emp.pin_hash is null then
    return null;
  end if;
  if v_emp.pin_hash = crypt(p_pin, v_emp.pin_hash) then
    return jsonb_build_object(
      'id', v_emp.id,
      'branchId', v_emp.branch_id,
      'name', v_emp.name,
      'isActive', v_emp.is_active
    );
  end if;
  return null;
end;
$$;

grant execute on function verify_attendance_pin(text, text, text) to anon, authenticated;

create or replace function save_attendance_employee(
  p_id text,
  p_name text,
  p_pin text,
  p_is_active boolean,
  p_branch_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin_hash text;
  v_branch_id text;
begin
  if p_pin is not null and length(p_pin) > 0 then
    v_pin_hash := crypt(p_pin, gen_salt('bf'));
  end if;

  insert into attendance_employees (id, name, pin_hash, is_active, branch_id)
  values (p_id, p_name, v_pin_hash, p_is_active, p_branch_id)
  on conflict (id) do update set
    name = excluded.name,
    pin_hash = coalesce(v_pin_hash, attendance_employees.pin_hash),
    is_active = excluded.is_active
  returning branch_id into v_branch_id;

  return jsonb_build_object(
    'id', p_id,
    'branchId', v_branch_id,
    'name', p_name,
    'isActive', p_is_active
  );
end;
$$;

grant execute on function save_attendance_employee(text, text, text, boolean, text) to anon, authenticated;

create or replace function delete_attendance_employee(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from attendance_employees where id = p_id;
end;
$$;

grant execute on function delete_attendance_employee(text) to anon, authenticated;

-- ---- 5. Attendance table (employee clock-in/out — distinct from `shifts`, --
-- which is the cash-till opening/closing-cash reconciliation, and distinct
-- from `staff`, which is login accounts) -------------------------------------
create table if not exists attendance (
  id text primary key,
  branch_id text not null references branches(id),
  employee_id text not null,
  employee_name text not null,
  shift_key text not null,
  official_start text not null,
  official_end text not null,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  late_minutes int not null default 0,
  worked_minutes int,
  overtime_minutes int
);

-- Defensive: if an earlier draft of this migration already created the table
-- with the old staff_id/staff_name columns, rename them instead of failing.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'attendance' and column_name = 'staff_id') then
    alter table attendance rename column staff_id to employee_id;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'attendance' and column_name = 'staff_name') then
    alter table attendance rename column staff_name to employee_name;
  end if;
end $$;

alter table attendance enable row level security;

drop policy if exists "anon full access" on attendance;
create policy "anon full access" on attendance for all using (true) with check (true);

-- Postgres won't let create-or-replace rename a parameter (only the body) —
-- an earlier draft of this migration used p_staff_id/p_staff_name, so drop
-- it first if that version exists.
drop function if exists check_in_attendance(text, text, text, text, text, text);

create or replace function check_in_attendance(
  p_branch_id text,
  p_employee_id text,
  p_employee_name text,
  p_shift_key text,
  p_official_start text,
  p_official_end text
)
returns attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := gen_random_uuid()::text;
  v_now timestamptz := now();
  v_official_start_ts timestamptz := (current_date + p_official_start::time);
  v_late_minutes int := greatest(0, round(extract(epoch from (v_now - v_official_start_ts)) / 60))::int;
  v_row attendance;
begin
  insert into attendance (id, branch_id, employee_id, employee_name, shift_key, official_start, official_end, check_in_at, late_minutes)
  values (v_id, p_branch_id, p_employee_id, p_employee_name, p_shift_key, p_official_start, p_official_end, v_now, v_late_minutes)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function check_out_attendance(p_attendance_id text)
returns attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_check_in_at timestamptz;
  v_official_end text;
  v_official_end_ts timestamptz;
  v_worked_minutes int;
  v_overtime_minutes int;
  v_row attendance;
begin
  select check_in_at, official_end into v_check_in_at, v_official_end
    from attendance where id = p_attendance_id;

  if not found then
    raise exception 'Attendance record % not found', p_attendance_id;
  end if;

  v_official_end_ts := (current_date + v_official_end::time);
  v_worked_minutes := round(extract(epoch from (v_now - v_check_in_at)) / 60);
  v_overtime_minutes := greatest(0, round(extract(epoch from (v_now - v_official_end_ts)) / 60))::int;

  update attendance
    set check_out_at = v_now,
        worked_minutes = v_worked_minutes,
        overtime_minutes = v_overtime_minutes
    where id = p_attendance_id
    returning * into v_row;

  return v_row;
end;
$$;

grant execute on function check_in_attendance(text, text, text, text, text, text) to anon, authenticated;
grant execute on function check_out_attendance(text) to anon, authenticated;
