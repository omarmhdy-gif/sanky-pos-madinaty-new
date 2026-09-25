-- ============================================================================
-- Migration 2.0 — Talabat as a separate, non-POS payment method
-- ADDITIVE-SAFE TO RUN: adds new nullable columns and replaces close_shift's
-- body only (same signature — no drop needed). Does not touch any existing
-- row's data. Safe to re-run.
--
-- "talabat" needs zero orders/order_lines schema change at all — payment
-- method is already a free-form string inside the orders.payment jsonb
-- column, so a new order simply stores payment->>'method' = 'talabat'.
-- The only server-side logic that ever aggregates by payment method is
-- close_shift (cash_sales/card_sales/expected_cash) — this migration
-- teaches it to track Talabat separately instead of folding it into
-- card_sales the way an unrecognized method previously would have.
-- ============================================================================

alter table shifts add column if not exists talabat_orders_count int;
alter table shifts add column if not exists talabat_revenue numeric;

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
