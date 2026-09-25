-- ============================================================================
-- Sanky POS — Milestone 1.2 migration (shifts, purchases, costing)
-- ADDITIVE ONLY — safe to run in full against your existing database.
-- Does not drop or truncate anything; your current products/orders/staff/
-- inventory are untouched. Run this whole file once in the Supabase SQL
-- Editor (select all, run) — no need to pick out a sub-section.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- New tables
-- ----------------------------------------------------------------------------

create table if not exists shifts (
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

create table if not exists purchases (
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
-- Additive columns on existing tables
-- ----------------------------------------------------------------------------

alter table orders add column if not exists shift_id text references shifts(id);
alter table inventory_items add column if not exists last_purchase_cost numeric;
alter table inventory_items add column if not exists average_cost numeric;

-- ----------------------------------------------------------------------------
-- RLS — same open/anon-key trust model as every other table in this app.
-- ----------------------------------------------------------------------------

alter table shifts enable row level security;
alter table purchases enable row level security;

drop policy if exists "anon full access" on shifts;
create policy "anon full access" on shifts for all using (true) with check (true);

drop policy if exists "anon full access" on purchases;
create policy "anon full access" on purchases for all using (true) with check (true);

grant select, insert, update, delete on shifts, purchases to anon, authenticated;

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
-- receive_purchase — the new Receive Stock flow. Atomically bumps quantity,
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
-- create_order — replaced in place (same signature) to add shift_id handling.
-- Identical to the 1.1 version otherwise (recipe-driven ingredient deduction).
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
    id, branch_id, shift_id, subtotal, discount_amount, discount_percent, tax_amount, tax_rate,
    total, payment, status, type, table_number, customer_name,
    cashier_id, cashier_name, created_at
  ) values (
    v_id,
    v_branch_id,
    v_shift_id,
    (p_order->>'subtotal')::numeric,
    (p_order->>'discountAmount')::numeric,
    nullif(p_order->>'discountPercent', '')::numeric,
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
-- reset_demo_data — replaced in place to also clear shifts/purchases (pure
-- usage data, nothing to reseed) alongside the existing truncate/reseed logic.
-- ----------------------------------------------------------------------------
create or replace function reset_demo_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table stock_movements;
  truncate table purchases;
  truncate table order_lines, orders restart identity cascade;
  truncate table shifts;
  truncate table expenses;
  delete from products;
  delete from inventory_items;
  delete from categories;
  delete from modifier_groups;
  delete from staff;
  perform seed_catalog('branch_coffee');
  perform seed_catalog('branch_gmc');
end;
$$;

grant execute on function reset_demo_data() to anon, authenticated;
