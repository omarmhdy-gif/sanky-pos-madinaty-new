-- ============================================================================
-- Migration 2.1 — Waste as a separate, non-revenue payment method
-- ADDITIVE-SAFE TO RUN: adds one new nullable column and replaces
-- create_order/close_shift's bodies only (same signatures — no drop
-- needed). Does not touch any existing row's data. Safe to re-run.
--
-- "waste" mirrors how Talabat (migration_2_0.sql) is tracked separately from
-- POS revenue, except a waste order collects no payment at all — instead it
-- requires a mandatory waste_reason. Inventory/recipe deduction is completely
-- unchanged (create_order's ingredient-deduction loop already runs
-- unconditionally for every order regardless of payment method), so waste
-- orders deduct stock exactly like any normal sale, per requirement.
-- ============================================================================

alter table orders add column if not exists waste_reason text;

-- ----------------------------------------------------------------------------
-- create_order — replaced in place (same signature) to also persist/return
-- waste_reason. Identical to the migration_1_2 version otherwise.
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
    cashier_id, cashier_name, created_at, waste_reason
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
    v_created_at,
    p_order->>'wasteReason'
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
    'inventoryUpdates', v_inventory_updates,
    'wasteReason', p_order->>'wasteReason'
  );
end;
$$;

grant execute on function create_order(jsonb, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- close_shift — replaced in place (same signature) to also skip 'waste'
-- orders entirely, the same way 'talabat' orders are skipped. Waste orders
-- collect no payment, so they must never contribute to orders_count,
-- cash_sales, card_sales, or expected_cash. No new shift-level waste columns
-- are added — only exclusion, per requirement (Waste Reporting lives in its
-- own report, not the Shift Report).
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
  v_talabat_orders_count int := 0;
  v_talabat_revenue numeric := 0;
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
    v_method := v_order.payment->>'method';

    if v_method = 'talabat' then
      -- External marketplace revenue — deliberately excluded from
      -- orders_count/cash_sales/card_sales/expected_cash entirely, per
      -- explicit requirement. Tracked in its own pair of columns instead.
      v_talabat_orders_count := v_talabat_orders_count + 1;
      v_talabat_revenue := v_talabat_revenue + v_order.total;
      continue;
    end if;

    if v_method = 'waste' then
      -- Discarded product, not revenue — collects no payment, so it must
      -- never contribute to orders_count/cash_sales/card_sales/expected_cash.
      continue;
    end if;

    v_orders_count := v_orders_count + 1;

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
    talabat_orders_count = v_talabat_orders_count,
    talabat_revenue = v_talabat_revenue,
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
    'talabatOrdersCount', v_shift.talabat_orders_count,
    'talabatRevenue', v_shift.talabat_revenue,
    'expectedCash', v_shift.expected_cash,
    'difference', v_shift.difference
  );
end;
$$;

grant execute on function close_shift(text, numeric) to anon, authenticated;
