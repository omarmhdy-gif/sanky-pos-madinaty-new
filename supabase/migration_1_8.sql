-- ============================================================================
-- Migration 1.8 — Attendance deduction settings, Last-Purchase-Price costing,
-- Delete Purchase
-- ADDITIVE-SAFE TO RUN: adds new columns/functions only, does not drop or
-- truncate any existing data or table. Safe to re-run. Run this whole file
-- once in the Supabase SQL Editor (select all, run).
-- ============================================================================

-- ---- 1. Per-employee deduction settings on attendance_employees ------------
-- Nullable/defaulted so existing employees are completely untouched until
-- the owner explicitly configures them from Employees. When null, the app
-- falls back to the shift's own default official times with 0 grace period
-- (today's exact behavior) — this is a pure additive capability, not a
-- change to any existing employee's stored data.
alter table attendance_employees add column if not exists assigned_shift_key text;
alter table attendance_employees add column if not exists shift_start text;
alter table attendance_employees add column if not exists shift_end text;
alter table attendance_employees add column if not exists grace_minutes int not null default 0;

drop function if exists save_attendance_employee(text, text, text, boolean, text);

create or replace function save_attendance_employee(
  p_id text,
  p_name text,
  p_pin text,
  p_is_active boolean,
  p_branch_id text,
  p_assigned_shift_key text default null,
  p_shift_start text default null,
  p_shift_end text default null,
  p_grace_minutes int default 0
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

  insert into attendance_employees (id, name, pin_hash, is_active, branch_id, assigned_shift_key, shift_start, shift_end, grace_minutes)
  values (p_id, p_name, v_pin_hash, p_is_active, p_branch_id, p_assigned_shift_key, p_shift_start, p_shift_end, coalesce(p_grace_minutes, 0))
  on conflict (id) do update set
    name = excluded.name,
    pin_hash = coalesce(v_pin_hash, attendance_employees.pin_hash),
    is_active = excluded.is_active,
    assigned_shift_key = excluded.assigned_shift_key,
    shift_start = excluded.shift_start,
    shift_end = excluded.shift_end,
    grace_minutes = excluded.grace_minutes
  returning branch_id into v_branch_id;

  return jsonb_build_object(
    'id', p_id,
    'branchId', v_branch_id,
    'name', p_name,
    'isActive', p_is_active,
    'assignedShiftKey', p_assigned_shift_key,
    'shiftStart', p_shift_start,
    'shiftEnd', p_shift_end,
    'graceMinutes', coalesce(p_grace_minutes, 0)
  );
end;
$$;

grant execute on function save_attendance_employee(text, text, text, boolean, text, text, text, text, int) to anon, authenticated;

-- The public view needs the new columns too (still no pin_hash exposed).
drop view if exists attendance_employees_public;
create view attendance_employees_public as
  select id, branch_id, name, is_active, assigned_shift_key, shift_start, shift_end, grace_minutes from attendance_employees;

grant select on attendance_employees_public to anon, authenticated;

-- ---- 2. Grace period support on check-in lateness math ---------------------
-- late_minutes now only starts accumulating once the grace period has
-- elapsed past official_start, instead of counting from minute one.
drop function if exists check_in_attendance(text, text, text, text, text, text);

create or replace function check_in_attendance(
  p_branch_id text,
  p_employee_id text,
  p_employee_name text,
  p_shift_key text,
  p_official_start text,
  p_official_end text,
  p_grace_minutes int default 0
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
  v_raw_late_minutes int := round(extract(epoch from (v_now - v_official_start_ts)) / 60)::int;
  v_late_minutes int := greatest(0, v_raw_late_minutes - coalesce(p_grace_minutes, 0));
  v_row attendance;
begin
  insert into attendance (id, branch_id, employee_id, employee_name, shift_key, official_start, official_end, check_in_at, late_minutes)
  values (v_id, p_branch_id, p_employee_id, p_employee_name, p_shift_key, p_official_start, p_official_end, v_now, v_late_minutes)
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function check_in_attendance(text, text, text, text, text, text, int) to anon, authenticated;

-- ---- 3. Costing: stop maintaining average_cost -----------------------------
-- The app now values inventory using last_purchase_cost only. The
-- average_cost column is left in place (dropping it is unnecessary DDL risk
-- for zero benefit) but receive_purchase no longer computes or updates it —
-- existing stored values are simply frozen/unused from here on, nothing is
-- deleted or reset.
drop function if exists receive_purchase(text, text, numeric, numeric, text, text, text);

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
  v_movement_id text := gen_random_uuid()::text;
  v_purchase_id text := gen_random_uuid()::text;
  v_created_at timestamptz := now();
  v_total_cost numeric := p_qty * p_unit_cost;
  v_new_qty numeric;
begin
  update inventory_items
    set quantity = quantity + p_qty,
        last_purchase_cost = p_unit_cost
    where id = p_inventory_item_id and branch_id = p_branch_id
    returning quantity into v_new_qty;

  if not found then
    raise exception 'Inventory item % not found in branch %', p_inventory_item_id, p_branch_id;
  end if;

  insert into stock_movements (id, branch_id, inventory_item_id, quantity_delta, reason, employee_id, employee_name, created_at)
  values (v_movement_id, p_branch_id, p_inventory_item_id, p_qty, 'manual_receive', p_employee_id, p_employee_name, v_created_at);

  insert into purchases (id, branch_id, inventory_item_id, quantity, unit_cost, total_cost, supplier, employee_id, employee_name, created_at)
  values (v_purchase_id, p_branch_id, p_inventory_item_id, p_qty, p_unit_cost, v_total_cost, p_supplier, p_employee_id, p_employee_name, v_created_at);

  return jsonb_build_object(
    'inventoryItem', jsonb_build_object(
      'id', p_inventory_item_id,
      'quantity', v_new_qty,
      'lastPurchaseCost', p_unit_cost
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

-- ---- 4. Delete Purchase (owner-only, enforced in the UI since Finance is an
-- owner-only route) — ONLY removes the purchase row (Finance totals are
-- summed live from `purchases`, so deleting the row alone corrects those
-- totals). Deliberately does NOT touch inventory_items at all — quantities
-- and last_purchase_cost must stay exactly as they are, per explicit
-- request; a purchase record is corrected/removed as a bookkeeping action
-- only, independent of whatever the shop has physically done with that
-- stock since. ------------------------------
create or replace function delete_purchase(p_purchase_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase purchases%rowtype;
begin
  select * into v_purchase from purchases where id = p_purchase_id;
  if not found then
    raise exception 'Purchase % not found', p_purchase_id;
  end if;

  delete from purchases where id = p_purchase_id;

  return jsonb_build_object('deletedPurchaseId', p_purchase_id);
end;
$$;

grant execute on function delete_purchase(text) to anon, authenticated;
