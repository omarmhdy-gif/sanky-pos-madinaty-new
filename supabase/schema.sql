-- ============================================================================
-- Sanky POS — Supabase schema (Milestone 1.2: + shifts, purchases, costing)
-- Run this in the Supabase SQL Editor, then run seed.sql.
-- This is a full reset (drops and recreates every table) — safe for demo data,
-- NOT safe to run against a database with real transactions you want to keep.
-- If you already have a 1.1 database with real data, use migration_1_2.sql
-- instead (additive, no data loss).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Clean slate
-- ----------------------------------------------------------------------------
drop table if exists purchases cascade;
drop table if exists stock_movements cascade;
drop table if exists order_lines cascade;
drop table if exists orders cascade;
drop table if exists shifts cascade;
drop table if exists expenses cascade;
drop table if exists inventory_items cascade;
drop table if exists products cascade;
drop table if exists modifier_groups cascade;
drop table if exists categories cascade;
drop view if exists staff_public;
drop table if exists staff cascade;
drop table if exists shop_settings cascade;
drop table if exists branches cascade;

drop function if exists verify_staff_pin(text, text);
drop function if exists verify_staff_pin(text, text, text);
drop function if exists save_staff(text, text, text, text, text, boolean);
drop function if exists save_staff(text, text, text, text, text, boolean, text);
drop function if exists delete_staff(text);
drop function if exists create_order(jsonb, jsonb);
drop function if exists record_stock_movement(text, text, numeric, text, text, text);
drop function if exists start_shift(text, text, text, numeric);
drop function if exists close_shift(text, numeric);
drop function if exists receive_purchase(text, text, numeric, numeric, text, text);
drop function if exists seed_catalog();
drop function if exists seed_catalog(text);
drop function if exists reset_demo_data();

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table branches (
  id text primary key,
  name jsonb not null
);

create table shop_settings (
  branch_id text primary key references branches(id),
  shop_name text not null,
  logo text,
  currency text not null,
  currency_symbol text not null,
  tax_rate numeric not null default 0,
  tax_enabled boolean not null default true,
  locale text not null default 'en',
  theme text not null default 'light',
  receipt_footer jsonb,
  address text,
  phone text
);

create table staff (
  id text primary key,
  branch_id text not null references branches(id),
  name text not null,
  pin_hash text,
  role text not null check (role in ('owner', 'cashier')),
  avatar_color text not null,
  is_active boolean not null default true
);

-- Public-facing view for the login picker: never exposes pin_hash.
create view staff_public as
  select id, branch_id, name, role, avatar_color, is_active from staff;

create table categories (
  id text primary key,
  branch_id text not null references branches(id),
  name jsonb not null,
  color text,
  icon text,
  sort_order int not null default 0
);

create table modifier_groups (
  id text primary key,
  branch_id text not null references branches(id),
  name jsonb not null,
  required boolean not null default false,
  multi_select boolean not null default false,
  options jsonb not null default '[]',
  sort_order int not null default 0
);

create table inventory_items (
  id text primary key,
  branch_id text not null references branches(id),
  name jsonb not null,
  type text not null check (type in ('piece', 'measured')),
  unit text check (unit in ('g', 'ml', 'l', 'kg')),
  quantity numeric not null default 0,
  critical_threshold numeric,
  low_threshold numeric,
  last_purchase_cost numeric,
  average_cost numeric
);

create table shifts (
  id text primary key,
  branch_id text not null references branches(id),
  cashier_id text not null,
  cashier_name text not null,
  opening_cash numeric not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  actual_cash numeric,
  cash_sales numeric,
  card_sales numeric,
  expenses_total numeric,
  orders_count int,
  expected_cash numeric,
  difference numeric
);

create table products (
  id text primary key,
  branch_id text not null references branches(id),
  name jsonb not null,
  category_id text references categories(id) on delete set null,
  price numeric not null,
  cost numeric,
  sku text,
  image text,
  color text,
  is_active boolean not null default true,
  recipe jsonb not null default '[]', -- [{ inventoryItemId, qty }] — no FK, just ids inside JSON
  modifier_group_ids text[] not null default '{}',
  sort_order int not null default 0
);

create table orders (
  id text primary key,
  branch_id text not null references branches(id),
  shift_id text references shifts(id),
  order_number bigint generated always as identity,
  subtotal numeric not null,
  discount_amount numeric not null default 0,
  discount_percent numeric,
  promo_code text,
  tax_amount numeric not null default 0,
  tax_rate numeric not null default 0,
  total numeric not null,
  payment jsonb not null,
  status text not null,
  type text not null,
  table_number text,
  customer_name text,
  cashier_id text,
  cashier_name text,
  created_at timestamptz not null default now()
);

create table order_lines (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  product_id text,
  name jsonb not null,
  unit_price numeric not null,
  qty int not null,
  modifiers jsonb not null default '[]',
  note text
);

create table promo_codes (
  id text primary key default gen_random_uuid()::text,
  branch_id text not null references branches(id) on delete cascade,
  code text not null,
  discount_percent numeric not null check (discount_percent > 0 and discount_percent <= 100),
  duration_days integer not null check (duration_days > 0),
  customer_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (branch_id, code)
);

create table expenses (
  id text primary key,
  branch_id text not null references branches(id),
  title text not null,
  category text not null,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now(),
  created_by text
);

create table stock_movements (
  id text primary key,
  branch_id text not null references branches(id),
  inventory_item_id text not null references inventory_items(id),
  quantity_delta numeric not null,
  reason text not null check (reason in ('sale', 'manual_receive', 'waste', 'stock_count')),
  employee_id text,
  employee_name text not null,
  order_id text references orders(id),
  created_at timestamptz not null default now()
);

create table inventory_quality_checks (
  id text primary key,
  branch_id text not null references branches(id),
  inventory_item_id text not null,
  inventory_item_name jsonb not null,
  result text not null check (result in ('good', 'needs_attention')),
  note text,
  checked_by_id text not null,
  checked_by_name text not null,
  checked_at timestamptz not null default now()
);
create index inventory_quality_checks_branch_checked_at_idx
  on inventory_quality_checks(branch_id, checked_at desc);

create table purchases (
  id text primary key,
  branch_id text not null references branches(id),
  inventory_item_id text not null references inventory_items(id),
  quantity numeric not null,
  unit_cost numeric not null,
  total_cost numeric not null,
  employee_id text,
  employee_name text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- No per-user Supabase Auth session exists in this app (PIN-tap login is a UX
-- gate, not a Supabase-recognized identity), so policies are table-wide.
-- `staff` is the one exception: no anon policy at all — access only via
-- staff_public (view) and the SECURITY DEFINER functions below.
-- ----------------------------------------------------------------------------

alter table branches enable row level security;
alter table shop_settings enable row level security;
alter table categories enable row level security;
alter table modifier_groups enable row level security;
alter table inventory_items enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table expenses enable row level security;
alter table stock_movements enable row level security;
alter table inventory_quality_checks enable row level security;
alter table purchases enable row level security;
alter table promo_codes enable row level security;
alter table shifts enable row level security;
alter table staff enable row level security;

-- ----------------------------------------------------------------------------
-- SECURITY NOTE (documented after a production audit): every policy below
-- is "anon full access" (using(true)/with check(true)) — RLS is technically
-- ON for every table, but grants unconditional read/write to anyone holding
-- the public API key, which is embedded in the client bundle and therefore
-- effectively public. Branch isolation and all authorization (owner-only
-- actions, staff PIN checks) are enforced ONLY by the app's UI and by
-- individual RPC functions (see save_staff/delete_staff/etc. below, none of
-- which check a caller identity — there is no real per-session auth in this
-- app, just local PIN verification the client trusts itself). This is a
-- known, accepted trade-off for a single-shop till system where the
-- practical security boundary is physical/network access to the shop's own
-- Wi-Fi and devices, not the database layer — NOT an oversight. A real fix
-- (Supabase Auth + JWT-scoped RLS policies keyed to an authenticated
-- role/branch claim) is a deliberate, scoped follow-up project if this ever
-- needs to be revisited (e.g. multiple untrusted networks, franchisees,
-- or public-internet exposure beyond a single shop's LAN).
-- ----------------------------------------------------------------------------
create policy "anon full access" on branches for all using (true) with check (true);
create policy "anon full access" on shop_settings for all using (true) with check (true);
create policy "anon full access" on categories for all using (true) with check (true);
create policy "anon full access" on modifier_groups for all using (true) with check (true);
create policy "anon full access" on inventory_items for all using (true) with check (true);
create policy "anon full access" on products for all using (true) with check (true);
create policy "anon full access" on orders for all using (true) with check (true);
create policy "anon full access" on order_lines for all using (true) with check (true);
create policy "anon full access" on expenses for all using (true) with check (true);
create policy "anon full access" on stock_movements for all using (true) with check (true);
create policy "anon read inventory quality checks" on inventory_quality_checks for select using (true);
create policy "anon insert inventory quality checks" on inventory_quality_checks for insert with check (true);
create policy "anon full access" on purchases for all using (true) with check (true);
create policy "anon full access" on promo_codes for all using (true) with check (true);
create policy "anon full access" on shifts for all using (true) with check (true);

grant select, insert, update, delete on branches, shop_settings, categories, modifier_groups, inventory_items, products, orders, order_lines, expenses, stock_movements, purchases, shifts, promo_codes to anon, authenticated;
grant select, insert on inventory_quality_checks to anon, authenticated;
grant select on staff_public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- verify_staff_pin — the login screen's PIN check. Runs server-side so the
-- browser never sees pin_hash or gets to compare PINs itself. Branch-checked
-- as defense in depth (the staff picker is already branch-filtered).
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
      'isActive', v_staff.is_active
    );
  end if;
  return null;
end;
$$;

grant execute on function verify_staff_pin(text, text, text) to anon, authenticated;

-- Direct-PIN login: resolve the employee from the PIN without exposing hashes.
create or replace function authenticate_staff_pin(p_pin text, p_branch_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff staff%rowtype;
  v_staff_json jsonb;
  v_matches integer;
begin
  if p_pin !~ '^[0-9]{4}$' then
    return null;
  end if;
  select count(*) into v_matches
  from staff
  where branch_id = p_branch_id and is_active = true
    and pin_hash is not null and pin_hash = crypt(p_pin, pin_hash);
  if v_matches <> 1 then
    return null;
  end if;
  select * into v_staff from staff
  where branch_id = p_branch_id and is_active = true
    and pin_hash = crypt(p_pin, pin_hash)
  limit 1;
  v_staff_json := to_jsonb(v_staff);
  return jsonb_build_object(
    'id', v_staff.id, 'branchId', v_staff.branch_id, 'name', v_staff.name,
    'role', v_staff.role, 'avatarColor', v_staff.avatar_color,
    'isActive', v_staff.is_active, 'permissions', v_staff_json -> 'permissions'
  );
end;
$$;
revoke all on function authenticate_staff_pin(text, text) from public;
grant execute on function authenticate_staff_pin(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- save_staff — the only path that can set a staff PIN. Hashes it server-side;
-- passing p_pin as null/empty on an update keeps the existing PIN unchanged.
-- branch_id is only applied on first insert — staff don't change branches.
-- ----------------------------------------------------------------------------
create or replace function save_staff(
  p_id text,
  p_name text,
  p_pin text,
  p_role text,
  p_avatar_color text,
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

  insert into staff (id, name, pin_hash, role, avatar_color, is_active, branch_id)
  values (p_id, p_name, v_pin_hash, p_role, p_avatar_color, p_is_active, p_branch_id)
  on conflict (id) do update set
    name = excluded.name,
    pin_hash = coalesce(v_pin_hash, staff.pin_hash),
    role = excluded.role,
    avatar_color = excluded.avatar_color,
    is_active = excluded.is_active
  returning branch_id into v_branch_id;

  return jsonb_build_object(
    'id', p_id,
    'branchId', v_branch_id,
    'name', p_name,
    'role', p_role,
    'avatarColor', p_avatar_color,
    'isActive', p_is_active
  );
end;
$$;

grant execute on function save_staff(text, text, text, text, text, boolean, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- delete_staff — `staff` has no anon RLS policy at all, so a direct
-- `.from('staff').delete()` from the client would be silently filtered to
-- zero rows. This is the sanctioned path for Settings -> staff delete.
-- ----------------------------------------------------------------------------
create or replace function delete_staff(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from staff where id = p_id;
end;
$$;

grant execute on function delete_staff(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- record_stock_movement — the only path that changes inventory_items.quantity.
-- Used by Receive Stock (delta > 0, reason='manual_receive') and Inventory's
-- owner-only Adjust action (any sign, reason='waste'|'stock_count'). Same
-- trust model as the rest of this app: enforcing "cashier can only increase
-- stock" is a UI-layer rule, not a DB one, since there's no per-user DB
-- session to check against (consistent with how role gating works everywhere
-- else here — see verify_staff_pin above, the only real server-side check).
-- ----------------------------------------------------------------------------
create or replace function record_stock_movement(
  p_branch_id text,
  p_inventory_item_id text,
  p_delta numeric,
  p_reason text,
  p_employee_id text,
  p_employee_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_qty numeric;
  v_movement_id text := gen_random_uuid()::text;
  v_created_at timestamptz := now();
begin
  update inventory_items
    set quantity = quantity + p_delta
    where id = p_inventory_item_id and branch_id = p_branch_id
    returning quantity into v_new_qty;

  if not found then
    raise exception 'Inventory item % not found in branch %', p_inventory_item_id, p_branch_id;
  end if;

  insert into stock_movements (id, branch_id, inventory_item_id, quantity_delta, reason, employee_id, employee_name, created_at)
  values (v_movement_id, p_branch_id, p_inventory_item_id, p_delta, p_reason, p_employee_id, p_employee_name, v_created_at);

  return jsonb_build_object(
    'id', p_inventory_item_id,
    'quantity', v_new_qty,
    'movement', jsonb_build_object(
      'id', v_movement_id,
      'branchId', p_branch_id,
      'inventoryItemId', p_inventory_item_id,
      'quantityDelta', p_delta,
      'reason', p_reason,
      'employeeId', p_employee_id,
      'employeeName', p_employee_name,
      'createdAt', to_char(v_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
end;
$$;

grant execute on function record_stock_movement(text, text, numeric, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- start_shift — idempotent: returns the existing open shift for this cashier
-- if one already exists, instead of creating a duplicate.
-- ----------------------------------------------------------------------------
create or replace function start_shift(
  p_branch_id text,
  p_cashier_id text,
  p_cashier_name text,
  p_opening_cash numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift shifts%rowtype;
begin
  select * into v_shift from shifts
    where branch_id = p_branch_id and cashier_id = p_cashier_id and status = 'open'
    limit 1;

  if not found then
    insert into shifts (id, branch_id, cashier_id, cashier_name, opening_cash, status, started_at)
    values (gen_random_uuid()::text, p_branch_id, p_cashier_id, p_cashier_name, p_opening_cash, 'open', now())
    returning * into v_shift;
  end if;

  return jsonb_build_object(
    'id', v_shift.id,
    'branchId', v_shift.branch_id,
    'cashierId', v_shift.cashier_id,
    'cashierName', v_shift.cashier_name,
    'openingCash', v_shift.opening_cash,
    'status', v_shift.status,
    'startedAt', to_char(v_shift.started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'closedAt', null,
    'actualCash', v_shift.actual_cash,
    'cashSales', v_shift.cash_sales,
    'cardSales', v_shift.card_sales,
    'expensesTotal', v_shift.expenses_total,
    'ordersCount', v_shift.orders_count,
    'expectedCash', v_shift.expected_cash,
    'difference', v_shift.difference
  );
end;
$$;

grant execute on function start_shift(text, text, text, numeric) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- close_shift — sums this shift's completed orders into cash_sales/card_sales
-- (wallet counts toward card_sales; split orders are split by their parts),
-- sums branch expenses logged during the shift's open window, and computes
-- expected_cash / difference. The UI derives Balanced/Short/Over from the
-- sign of `difference` rather than storing a separate status.
-- ----------------------------------------------------------------------------
create or replace function close_shift(p_shift_id text, p_actual_cash numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift shifts%rowtype;
  v_order record;
  v_part jsonb;
  v_cash_sales numeric := 0;
  v_card_sales numeric := 0;
  v_orders_count int := 0;
  v_expenses_total numeric := 0;
  v_expected numeric;
  v_difference numeric;
  v_method text;
begin
  select * into v_shift from shifts where id = p_shift_id;
  if not found then
    raise exception 'Shift % not found', p_shift_id;
  end if;

  for v_order in
    select * from orders where shift_id = p_shift_id and status = 'completed'
  loop
    v_orders_count := v_orders_count + 1;
    v_method := v_order.payment->>'method';

    if v_method = 'cash' then
      v_cash_sales := v_cash_sales + v_order.total;
    elsif v_method = 'split' then
      for v_part in select * from jsonb_array_elements(coalesce(v_order.payment->'splitParts', '[]'::jsonb))
      loop
        if v_part->>'method' = 'cash' then
          v_cash_sales := v_cash_sales + (v_part->>'amount')::numeric;
        else
          v_card_sales := v_card_sales + (v_part->>'amount')::numeric;
        end if;
      end loop;
    else
      -- card or wallet
      v_card_sales := v_card_sales + v_order.total;
    end if;
  end loop;

  select coalesce(sum(amount), 0) into v_expenses_total
    from expenses
    where branch_id = v_shift.branch_id
      and created_at >= v_shift.started_at
      and created_at <= now();

  v_expected := v_shift.opening_cash + v_cash_sales - v_expenses_total;
  v_difference := p_actual_cash - v_expected;

  update shifts set
    status = 'closed',
    closed_at = now(),
    actual_cash = p_actual_cash,
    cash_sales = v_cash_sales,
    card_sales = v_card_sales,
    expenses_total = v_expenses_total,
    orders_count = v_orders_count,
    expected_cash = v_expected,
    difference = v_difference
  where id = p_shift_id
  returning * into v_shift;

  return jsonb_build_object(
    'id', v_shift.id,
    'branchId', v_shift.branch_id,
    'cashierId', v_shift.cashier_id,
    'cashierName', v_shift.cashier_name,
    'openingCash', v_shift.opening_cash,
    'status', v_shift.status,
    'startedAt', to_char(v_shift.started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'closedAt', to_char(v_shift.closed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actualCash', v_shift.actual_cash,
    'cashSales', v_shift.cash_sales,
    'cardSales', v_shift.card_sales,
    'expensesTotal', v_shift.expenses_total,
    'ordersCount', v_shift.orders_count,
    'expectedCash', v_shift.expected_cash,
    'difference', v_shift.difference
  );
end;
$$;

grant execute on function close_shift(text, numeric) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- receive_purchase — the Receive Stock flow. Atomically bumps quantity,
-- records last_purchase_cost, recomputes average_cost as a running weighted
-- average, logs a stock_movements row (reason='manual_receive', same as
-- before), and logs one purchases row. Replaces record_stock_movement for
-- this specific flow; record_stock_movement is unchanged and still serves
-- Owner's cost-agnostic Adjust Stock (waste/stock_count).
-- ----------------------------------------------------------------------------
create or replace function receive_purchase(
  p_branch_id text,
  p_inventory_item_id text,
  p_qty numeric,
  p_unit_cost numeric,
  p_employee_id text,
  p_employee_name text
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

  insert into purchases (id, branch_id, inventory_item_id, quantity, unit_cost, total_cost, employee_id, employee_name, created_at)
  values (v_purchase_id, p_branch_id, p_inventory_item_id, p_qty, p_unit_cost, v_total_cost, p_employee_id, p_employee_name, v_created_at);

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
      'employeeId', p_employee_id,
      'employeeName', p_employee_name,
      'createdAt', to_char(v_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
end;
$$;

grant execute on function receive_purchase(text, text, numeric, numeric, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- create_order — atomically inserts the order + its lines, then walks each
-- line's product recipe and deducts ingredients from inventory_items,
-- logging one stock_movements row per ingredient (reason='sale'). Returns the
-- full order (camelCase, matching the Order type) plus inventoryUpdates so
-- the client can patch local inventory state without a full refetch.
-- ----------------------------------------------------------------------------
create or replace function create_order(p_order jsonb, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := gen_random_uuid()::text;
  v_branch_id text := p_order->>'branchId';
  v_shift_id text := p_order->>'shiftId';
  v_cashier_id text := p_order->>'cashierId';
  v_cashier_name text := p_order->>'cashierName';
  v_order_number bigint;
  v_created_at timestamptz := coalesce((p_order->>'createdAt')::timestamptz, now());
  v_line jsonb;
  v_line_id text;
  v_lines jsonb := '[]'::jsonb;
  v_recipe jsonb;
  v_ingredient jsonb;
  v_deduct numeric;
  v_new_qty numeric;
  v_inventory_updates jsonb := '[]'::jsonb;
begin
  insert into orders (
    id, branch_id, shift_id, subtotal, discount_amount, discount_percent, promo_code, tax_amount, tax_rate,
    total, payment, status, type, table_number, customer_name,
    cashier_id, cashier_name, created_at
  ) values (
    v_id,
    v_branch_id,
    v_shift_id,
    (p_order->>'subtotal')::numeric,
    (p_order->>'discountAmount')::numeric,
    nullif(p_order->>'discountPercent', '')::numeric,
    nullif(p_order->>'promoCode', ''),
    (p_order->>'taxAmount')::numeric,
    (p_order->>'taxRate')::numeric,
    (p_order->>'total')::numeric,
    p_order->'payment',
    p_order->>'status',
    p_order->>'type',
    p_order->>'tableNumber',
    p_order->>'customerName',
    v_cashier_id,
    v_cashier_name,
    v_created_at
  )
  returning order_number into v_order_number;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_id := gen_random_uuid()::text;

    insert into order_lines (id, order_id, product_id, name, unit_price, qty, modifiers, note)
    values (
      v_line_id,
      v_id,
      v_line->>'productId',
      v_line->'name',
      (v_line->>'unitPrice')::numeric,
      (v_line->>'qty')::int,
      coalesce(v_line->'modifiers', '[]'::jsonb),
      v_line->>'note'
    );

    v_lines := v_lines || jsonb_build_object(
      'lineId', v_line_id,
      'productId', v_line->>'productId',
      'name', v_line->'name',
      'unitPrice', (v_line->>'unitPrice')::numeric,
      'qty', (v_line->>'qty')::int,
      'modifiers', coalesce(v_line->'modifiers', '[]'::jsonb),
      'note', v_line->>'note'
    );

    select recipe into v_recipe from products where id = v_line->>'productId';

    for v_ingredient in select * from jsonb_array_elements(coalesce(v_recipe, '[]'::jsonb))
    loop
      v_deduct := (v_ingredient->>'qty')::numeric * (v_line->>'qty')::int;

      update inventory_items
        set quantity = quantity - v_deduct
        where id = v_ingredient->>'inventoryItemId'
        returning quantity into v_new_qty;

      if found then
        insert into stock_movements (id, branch_id, inventory_item_id, quantity_delta, reason, employee_id, employee_name, order_id, created_at)
        values (gen_random_uuid()::text, v_branch_id, v_ingredient->>'inventoryItemId', -v_deduct, 'sale', v_cashier_id, v_cashier_name, v_id, v_created_at);

        v_inventory_updates := v_inventory_updates || jsonb_build_object(
          'id', v_ingredient->>'inventoryItemId',
          'quantity', v_new_qty
        );
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'branchId', v_branch_id,
    'shiftId', v_shift_id,
    'orderNumber', v_order_number,
    'lines', v_lines,
    'subtotal', (p_order->>'subtotal')::numeric,
    'discountAmount', (p_order->>'discountAmount')::numeric,
    'discountPercent', nullif(p_order->>'discountPercent', '')::numeric,
    'taxAmount', (p_order->>'taxAmount')::numeric,
    'taxRate', (p_order->>'taxRate')::numeric,
    'total', (p_order->>'total')::numeric,
    'payment', p_order->'payment',
    'status', p_order->>'status',
    'type', p_order->>'type',
    'tableNumber', p_order->>'tableNumber',
    'customerName', p_order->>'customerName',
    'cashierId', v_cashier_id,
    'cashierName', v_cashier_name,
    'createdAt', to_char(v_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'inventoryUpdates', v_inventory_updates
  );
end;
$$;

grant execute on function create_order(jsonb, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- seed_catalog — (re)inserts one branch's reference/catalog data (settings,
-- staff, categories, modifier groups, inventory items, products+recipes).
-- Idempotent via ON CONFLICT so it can be called once per branch by
-- seed.sql on first run. Body supplied by seed.sql. Deliberately NOT
-- granted to anon/authenticated — it's only ever run by hand from the SQL
-- Editor during initial setup, never callable from the app.
-- ----------------------------------------------------------------------------
create or replace function seed_catalog(p_branch_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- placeholder; replaced by seed.sql, which redefines this function with
  -- the actual seed data so schema.sql itself stays data-free.
  null;
end;
$$;
