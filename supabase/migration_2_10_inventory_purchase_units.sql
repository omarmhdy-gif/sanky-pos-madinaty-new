-- Optional large purchase unit with canonical small-unit inventory quantities.
-- Existing rows retain their current unit and receive a 1:1 conversion.
alter table inventory_items
  add column if not exists purchase_unit text,
  add column if not exists conversion_factor numeric not null default 1;

alter table purchases
  add column if not exists purchase_quantity numeric,
  add column if not exists purchase_unit text,
  add column if not exists conversion_factor numeric,
  add column if not exists purchase_unit_cost numeric;

-- Existing recipes and ledgers used kg/l directly. Normalize them once to
-- g/ml so new recipes always consume the small unit while old quantities,
-- costs and historical movement totals remain mathematically equivalent.
create temporary table legacy_large_unit_items on commit drop as
  select id, unit as legacy_unit from inventory_items where unit in ('kg', 'l');

update purchases p
set purchase_quantity = coalesce(p.purchase_quantity, p.quantity),
    purchase_unit = coalesce(p.purchase_unit, i.legacy_unit),
    conversion_factor = coalesce(p.conversion_factor, 1000),
    purchase_unit_cost = coalesce(p.purchase_unit_cost, p.unit_cost),
    quantity = p.quantity * 1000,
    unit_cost = p.unit_cost / 1000
from legacy_large_unit_items i
where p.inventory_item_id = i.id;

update stock_movements m set quantity_delta = m.quantity_delta * 1000
from legacy_large_unit_items i where m.inventory_item_id = i.id;

update products p
set recipe = (
  select coalesce(jsonb_agg(
    case when i.id is not null
      then jsonb_set(recipe_item.ingredient, '{qty}', to_jsonb((recipe_item.ingredient->>'qty')::numeric * 1000))
      else recipe_item.ingredient end
  ), '[]'::jsonb)
  from jsonb_array_elements(p.recipe) as recipe_item(ingredient)
  left join legacy_large_unit_items i on i.id = recipe_item.ingredient->>'inventoryItemId'
)
where exists (
  select 1 from jsonb_array_elements(p.recipe) ing
  join legacy_large_unit_items i on i.id = ing->>'inventoryItemId'
);

update inventory_items i
set unit = case when l.legacy_unit = 'kg' then 'g' else 'ml' end,
    purchase_unit = l.legacy_unit,
    conversion_factor = 1000,
    quantity = i.quantity * 1000,
    critical_threshold = case when i.critical_threshold is null then null else i.critical_threshold * 1000 end,
    low_threshold = case when i.low_threshold is null then null else i.low_threshold * 1000 end,
    last_purchase_cost = case when i.last_purchase_cost is null then null else i.last_purchase_cost / 1000 end
from legacy_large_unit_items l where i.id = l.id;

update inventory_items
set purchase_unit = coalesce(purchase_unit, unit)
where purchase_unit is null;

create or replace function receive_purchase_v2(
  p_branch_id text,
  p_inventory_item_id text,
  p_purchase_qty numeric,
  p_purchase_unit_cost numeric,
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
  v_factor numeric;
  v_purchase_unit text;
  v_base_qty numeric;
  v_base_cost numeric;
  v_total_cost numeric;
  v_new_qty numeric;
begin
  if p_purchase_qty is null or p_purchase_qty <= 0 or p_purchase_unit_cost is null or p_purchase_unit_cost < 0 then
    raise exception 'Purchase quantity must be positive and cost cannot be negative';
  end if;

  select coalesce(conversion_factor, 1), coalesce(purchase_unit, unit, 'piece')
    into v_factor, v_purchase_unit
    from inventory_items
    where id = p_inventory_item_id and branch_id = p_branch_id
    for update;
  if not found then
    raise exception 'Inventory item % not found in branch %', p_inventory_item_id, p_branch_id;
  end if;
  if v_factor <= 0 then raise exception 'Conversion factor must be positive'; end if;

  v_base_qty := p_purchase_qty * v_factor;
  v_base_cost := p_purchase_unit_cost / v_factor;
  v_total_cost := p_purchase_qty * p_purchase_unit_cost;

  update inventory_items
    set quantity = quantity + v_base_qty, last_purchase_cost = v_base_cost
    where id = p_inventory_item_id and branch_id = p_branch_id
    returning quantity into v_new_qty;

  insert into stock_movements (id, branch_id, inventory_item_id, quantity_delta, reason, employee_id, employee_name, created_at)
  values (v_movement_id, p_branch_id, p_inventory_item_id, v_base_qty, 'manual_receive', p_employee_id, p_employee_name, v_created_at);

  insert into purchases (id, branch_id, inventory_item_id, quantity, unit_cost, total_cost, supplier, employee_id, employee_name, created_at,
                         purchase_quantity, purchase_unit, conversion_factor, purchase_unit_cost)
  values (v_purchase_id, p_branch_id, p_inventory_item_id, v_base_qty, v_base_cost, v_total_cost, p_supplier, p_employee_id, p_employee_name, v_created_at,
          p_purchase_qty, v_purchase_unit, v_factor, p_purchase_unit_cost);

  return jsonb_build_object(
    'inventoryItem', jsonb_build_object('id', p_inventory_item_id, 'quantity', v_new_qty, 'lastPurchaseCost', v_base_cost),
    'movement', jsonb_build_object('id', v_movement_id, 'branchId', p_branch_id, 'inventoryItemId', p_inventory_item_id,
      'quantityDelta', v_base_qty, 'reason', 'manual_receive', 'employeeId', p_employee_id, 'employeeName', p_employee_name,
      'createdAt', to_char(v_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'purchase', jsonb_build_object('id', v_purchase_id, 'branchId', p_branch_id, 'inventoryItemId', p_inventory_item_id,
      'quantity', v_base_qty, 'purchaseQuantity', p_purchase_qty, 'purchaseUnit', v_purchase_unit, 'conversionFactor', v_factor,
      'unitCost', v_base_cost, 'purchaseUnitCost', p_purchase_unit_cost, 'totalCost', v_total_cost, 'supplier', p_supplier,
      'employeeId', p_employee_id, 'employeeName', p_employee_name,
      'createdAt', to_char(v_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );
end;
$$;

grant execute on function receive_purchase_v2(text, text, numeric, numeric, text, text, text) to anon, authenticated;

-- Re-importing an opening balance adjusts only the difference from the prior
-- baseline, preserving all movements recorded after the original import.
create table if not exists inventory_opening_balances (
  branch_id text not null references branches(id),
  inventory_item_id text not null references inventory_items(id),
  opening_quantity numeric not null,
  purchase_unit_cost numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (branch_id, inventory_item_id)
);
alter table inventory_opening_balances enable row level security;
drop policy if exists "anon full access" on inventory_opening_balances;
create policy "anon full access" on inventory_opening_balances for all using (true) with check (true);
grant select, insert, update, delete on inventory_opening_balances to anon, authenticated;

alter table stock_movements drop constraint if exists stock_movements_reason_check;
alter table stock_movements add constraint stock_movements_reason_check
  check (reason in ('sale', 'manual_receive', 'waste', 'stock_count', 'opening_balance'));

create or replace function set_inventory_opening_balance(
  p_branch_id text,
  p_inventory_item_id text,
  p_purchase_qty numeric,
  p_purchase_unit_cost numeric,
  p_employee_id text,
  p_employee_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factor numeric;
  v_cost numeric;
  v_old_opening numeric := 0;
  v_new_opening numeric;
  v_delta numeric;
  v_quantity numeric;
  v_movement_id text := gen_random_uuid()::text;
  v_created_at timestamptz := now();
begin
  if p_purchase_qty is null or p_purchase_qty < 0 or p_purchase_unit_cost is null or p_purchase_unit_cost < 0 then
    raise exception 'Opening quantity and cost must be zero or greater';
  end if;
  select coalesce(conversion_factor, 1) into v_factor from inventory_items
    where id = p_inventory_item_id and branch_id = p_branch_id for update;
  if not found then raise exception 'Inventory item not found in branch'; end if;
  if v_factor <= 0 then raise exception 'Conversion factor must be positive'; end if;

  select opening_quantity into v_old_opening from inventory_opening_balances
    where branch_id = p_branch_id and inventory_item_id = p_inventory_item_id;
  v_new_opening := p_purchase_qty * v_factor;
  v_delta := v_new_opening - coalesce(v_old_opening, 0);
  v_cost := case when v_factor = 0 then 0 else p_purchase_unit_cost / v_factor end;

  update inventory_items set quantity = quantity + v_delta, last_purchase_cost = v_cost
    where id = p_inventory_item_id and branch_id = p_branch_id returning quantity into v_quantity;
  insert into inventory_opening_balances(branch_id, inventory_item_id, opening_quantity, purchase_unit_cost, updated_at)
    values (p_branch_id, p_inventory_item_id, v_new_opening, p_purchase_unit_cost, v_created_at)
    on conflict (branch_id, inventory_item_id) do update set opening_quantity = excluded.opening_quantity,
      purchase_unit_cost = excluded.purchase_unit_cost, updated_at = excluded.updated_at;
  insert into stock_movements(id, branch_id, inventory_item_id, quantity_delta, reason, employee_id, employee_name, created_at)
    values(v_movement_id, p_branch_id, p_inventory_item_id, v_delta, 'opening_balance', p_employee_id, p_employee_name, v_created_at);
  return jsonb_build_object('quantity', v_quantity, 'delta', v_delta, 'lastPurchaseCost', v_cost,
    'movement', jsonb_build_object('id', v_movement_id, 'branchId', p_branch_id, 'inventoryItemId', p_inventory_item_id,
      'quantityDelta', v_delta, 'reason', 'opening_balance', 'employeeId', p_employee_id,
      'employeeName', p_employee_name, 'createdAt', to_char(v_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
end;
$$;
grant execute on function set_inventory_opening_balance(text, text, numeric, numeric, text, text) to anon, authenticated;
