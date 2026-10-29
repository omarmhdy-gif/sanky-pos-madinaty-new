-- Inventory manufacturing recipes and atomic manufacture-on-sale support.
-- Apply this migration to a database before using the new inventory fields.

alter table public.inventory_items
  add column if not exists sourcing_type text not null default 'purchased',
  add column if not exists manufacturing_recipe jsonb not null default '[]'::jsonb,
  add column if not exists auto_manufacture_on_sale boolean not null default false;

alter table public.inventory_items
  drop constraint if exists inventory_items_sourcing_type_check,
  drop constraint if exists inventory_items_manufacturing_recipe_array_check,
  drop constraint if exists inventory_items_purchased_recipe_check,
  drop constraint if exists inventory_items_auto_manufacture_recipe_check;
alter table public.inventory_items
  add constraint inventory_items_sourcing_type_check
    check (sourcing_type in ('purchased', 'manufactured')),
  add constraint inventory_items_manufacturing_recipe_array_check
    check (jsonb_typeof(manufacturing_recipe) = 'array'),
  add constraint inventory_items_purchased_recipe_check
    check (sourcing_type = 'manufactured' or (manufacturing_recipe = '[]'::jsonb and not auto_manufacture_on_sale)),
  add constraint inventory_items_auto_manufacture_recipe_check
    check (not auto_manufacture_on_sale or (sourcing_type = 'manufactured' and jsonb_array_length(manufacturing_recipe) > 0));

alter table public.stock_movements
  drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements
  add constraint stock_movements_reason_check
  check (reason in ('sale', 'manual_receive', 'waste', 'stock_count', 'opening_balance', 'manufacturing'));

create or replace function public._sanky_consume_inventory_item(
  p_branch_id text,
  p_item_id text,
  p_quantity numeric,
  p_reason text,
  p_employee_id text,
  p_employee_name text,
  p_order_id text,
  p_created_at timestamptz,
  p_stack text[],
  p_allow_negative boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_item record;
  v_child_result jsonb := '{"itemIds":[],"movements":[]}'::jsonb;
  v_item_ids text[] := array[]::text[];
  v_movements jsonb := '[]'::jsonb;
  v_movement_id text;
  v_new_quantity numeric;
  v_movement jsonb;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Inventory consumption quantity must be positive';
  end if;

  select id, quantity, name, sourcing_type, manufacturing_recipe, auto_manufacture_on_sale
    into v_item
    from public.inventory_items
   where id = p_item_id and branch_id = p_branch_id
   for update;
  if not found then
    raise exception 'Inventory item % was not found in branch %', p_item_id, p_branch_id;
  end if;

  if v_item.quantity < p_quantity then
    if v_item.sourcing_type = 'manufactured'
       and v_item.auto_manufacture_on_sale
       and jsonb_typeof(v_item.manufacturing_recipe) = 'array'
       and jsonb_array_length(v_item.manufacturing_recipe) > 0 then
      v_child_result := public._sanky_produce_inventory_item(
        p_branch_id, p_item_id, p_quantity - v_item.quantity,
        p_employee_id, p_employee_name, p_order_id, p_created_at,
        p_stack, p_allow_negative
      );
      v_item_ids := v_item_ids || array(select jsonb_array_elements_text(v_child_result->'itemIds'));
      v_movements := v_movements || coalesce(v_child_result->'movements', '[]'::jsonb);
    elsif not p_allow_negative then
      raise exception 'Not enough stock for inventory item %', p_item_id;
    end if;
  end if;

  update public.inventory_items
     set quantity = quantity - p_quantity
   where id = p_item_id and branch_id = p_branch_id
   returning quantity into v_new_quantity;

  v_movement_id := gen_random_uuid()::text;
  insert into public.stock_movements (
    id, branch_id, inventory_item_id, quantity_delta, reason,
    employee_id, employee_name, order_id, created_at
  ) values (
    v_movement_id, p_branch_id, p_item_id, -p_quantity, p_reason,
    p_employee_id, coalesce(p_employee_name, 'Unknown'), p_order_id, p_created_at
  );

  v_movement := jsonb_build_object(
    'id', v_movement_id,
    'branchId', p_branch_id,
    'inventoryItemId', p_item_id,
    'itemName', v_item.name,
    'quantityDelta', -p_quantity,
    'reason', p_reason,
    'employeeId', p_employee_id,
    'employeeName', coalesce(p_employee_name, 'Unknown'),
    'orderId', p_order_id,
    'createdAt', to_char(p_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_item_ids := array_append(v_item_ids, p_item_id);
  v_movements := v_movements || jsonb_build_array(v_movement);

  return jsonb_build_object('itemIds', to_jsonb(v_item_ids), 'movements', v_movements);
end;
$function$;

create or replace function public._sanky_produce_inventory_item(
  p_branch_id text,
  p_item_id text,
  p_quantity numeric,
  p_employee_id text,
  p_employee_name text,
  p_order_id text,
  p_created_at timestamptz,
  p_stack text[],
  p_allow_negative boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_item record;
  v_ingredient jsonb;
  v_component_id text;
  v_component_quantity numeric;
  v_child_result jsonb;
  v_item_ids text[] := array[]::text[];
  v_movements jsonb := '[]'::jsonb;
  v_movement_id text;
  v_new_quantity numeric;
  v_movement jsonb;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Manufacturing quantity must be positive';
  end if;
  if p_item_id = any(coalesce(p_stack, array[]::text[])) then
    raise exception 'Manufacturing recipe cycle detected at inventory item %', p_item_id;
  end if;

  select id, quantity, name, sourcing_type, manufacturing_recipe
    into v_item
    from public.inventory_items
   where id = p_item_id and branch_id = p_branch_id
   for update;
  if not found then
    raise exception 'Inventory item % was not found in branch %', p_item_id, p_branch_id;
  end if;
  if v_item.sourcing_type <> 'manufactured' then
    raise exception 'Purchased inventory items cannot be manufactured';
  end if;
  if jsonb_typeof(v_item.manufacturing_recipe) <> 'array'
     or jsonb_array_length(v_item.manufacturing_recipe) = 0 then
    raise exception 'No manufacturing recipe is configured for inventory item %', p_item_id;
  end if;

  for v_ingredient in select * from jsonb_array_elements(v_item.manufacturing_recipe)
  loop
    v_component_id := nullif(v_ingredient->>'inventoryItemId', '');
    v_component_quantity := coalesce(nullif(v_ingredient->>'qty', '')::numeric, 0) * p_quantity;
    if v_component_id is null or v_component_quantity <= 0 then
      raise exception 'Invalid manufacturing recipe component for inventory item %', p_item_id;
    end if;
    v_child_result := public._sanky_consume_inventory_item(
      p_branch_id, v_component_id, v_component_quantity, 'manufacturing',
      p_employee_id, p_employee_name, p_order_id, p_created_at,
      coalesce(p_stack, array[]::text[]) || p_item_id, p_allow_negative
    );
    v_item_ids := v_item_ids || array(select jsonb_array_elements_text(v_child_result->'itemIds'));
    v_movements := v_movements || coalesce(v_child_result->'movements', '[]'::jsonb);
  end loop;

  update public.inventory_items
     set quantity = quantity + p_quantity
   where id = p_item_id and branch_id = p_branch_id
   returning quantity into v_new_quantity;

  v_movement_id := gen_random_uuid()::text;
  insert into public.stock_movements (
    id, branch_id, inventory_item_id, quantity_delta, reason,
    employee_id, employee_name, order_id, created_at
  ) values (
    v_movement_id, p_branch_id, p_item_id, p_quantity, 'manufacturing',
    p_employee_id, coalesce(p_employee_name, 'Unknown'), p_order_id, p_created_at
  );
  v_movement := jsonb_build_object(
    'id', v_movement_id,
    'branchId', p_branch_id,
    'inventoryItemId', p_item_id,
    'itemName', v_item.name,
    'quantityDelta', p_quantity,
    'reason', 'manufacturing',
    'employeeId', p_employee_id,
    'employeeName', coalesce(p_employee_name, 'Unknown'),
    'orderId', p_order_id,
    'createdAt', to_char(p_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_item_ids := array_append(v_item_ids, p_item_id);
  v_movements := v_movements || jsonb_build_array(v_movement);

  return jsonb_build_object('itemIds', to_jsonb(v_item_ids), 'movements', v_movements);
end;
$function$;

revoke all on function public._sanky_consume_inventory_item(text, text, numeric, text, text, text, text, timestamptz, text[], boolean) from public, anon, authenticated;
revoke all on function public._sanky_produce_inventory_item(text, text, numeric, text, text, text, timestamptz, text[], boolean) from public, anon, authenticated;

create or replace function public.manufacture_inventory_item(
  p_branch_id text,
  p_inventory_item_id text,
  p_quantity numeric,
  p_employee_id text,
  p_employee_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_result jsonb;
  v_inventory_updates jsonb;
begin
  if p_branch_id is null or p_inventory_item_id is null or p_quantity is null or p_quantity <= 0 then
    raise exception 'Branch, inventory item and a positive quantity are required';
  end if;
  v_result := public._sanky_produce_inventory_item(
    p_branch_id, p_inventory_item_id, p_quantity, p_employee_id,
    p_employee_name, null, now(), array[]::text[], false
  );
  select coalesce(jsonb_agg(jsonb_build_object('id', item.id, 'quantity', item.quantity)), '[]'::jsonb)
    into v_inventory_updates
    from public.inventory_items item
   where item.branch_id = p_branch_id
     and item.id in (select jsonb_array_elements_text(v_result->'itemIds'));
  return jsonb_build_object(
    'inventoryUpdates', v_inventory_updates,
    'stockMovementUpdates', coalesce(v_result->'movements', '[]'::jsonb)
  );
end;
$function$;

grant execute on function public.manufacture_inventory_item(text, text, numeric, text, text) to anon, authenticated;

create or replace function public.prevent_purchase_for_manufactured_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.reason = 'manual_receive' and exists (
    select 1 from public.inventory_items item
     where item.id = new.inventory_item_id
       and item.branch_id = new.branch_id
       and item.sourcing_type = 'manufactured'
  ) then
    raise exception 'Manufactured inventory items cannot be received as purchases';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_purchase_for_manufactured_item on public.stock_movements;
create trigger prevent_purchase_for_manufactured_item
before insert on public.stock_movements
for each row execute function public.prevent_purchase_for_manufactured_item();

create or replace function public.create_order(p_order jsonb, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id text := gen_random_uuid()::text;
  v_branch_id text := p_order->>'branchId';
  v_shift_id text := p_order->>'shiftId';
  v_cashier_id text := p_order->>'cashierId';
  v_cashier_name text := p_order->>'cashierName';
  v_customer_id text := nullif(p_order->>'customerId', '');
  v_order_number bigint;
  v_created_at timestamptz := coalesce((p_order->>'createdAt')::timestamptz, now());
  v_line jsonb;
  v_line_id text;
  v_lines jsonb := '[]'::jsonb;
  v_recipe jsonb;
  v_ingredient jsonb;
  v_ingredient_id text;
  v_deduct numeric;
  v_result jsonb;
  v_item_ids text[] := array[]::text[];
  v_movements jsonb := '[]'::jsonb;
  v_inventory_updates jsonb := '[]'::jsonb;
begin
  insert into orders (
    id, branch_id, shift_id, subtotal, discount_amount, discount_percent, promo_code, tax_amount, tax_rate,
    total, payment, status, type, table_number, customer_id, customer_name,
    cashier_id, cashier_name, created_at
  ) values (
    v_id, v_branch_id, v_shift_id,
    (p_order->>'subtotal')::numeric,
    (p_order->>'discountAmount')::numeric,
    nullif(p_order->>'discountPercent', '')::numeric,
    nullif(p_order->>'promoCode', ''),
    (p_order->>'taxAmount')::numeric,
    (p_order->>'taxRate')::numeric,
    (p_order->>'total')::numeric,
    p_order->'payment', p_order->>'status', p_order->>'type',
    p_order->>'tableNumber', v_customer_id, p_order->>'customerName',
    v_cashier_id, v_cashier_name, v_created_at
  ) returning order_number into v_order_number;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_id := gen_random_uuid()::text;
    insert into order_lines (id, order_id, product_id, name, unit_price, qty, modifiers, note)
    values (
      v_line_id, v_id, v_line->>'productId', v_line->'name',
      (v_line->>'unitPrice')::numeric, (v_line->>'qty')::int,
      coalesce(v_line->'modifiers', '[]'::jsonb), v_line->>'note'
    );
    v_lines := v_lines || jsonb_build_object(
      'lineId', v_line_id, 'productId', v_line->>'productId', 'name', v_line->'name',
      'unitPrice', (v_line->>'unitPrice')::numeric, 'qty', (v_line->>'qty')::int,
      'modifiers', coalesce(v_line->'modifiers', '[]'::jsonb), 'note', v_line->>'note'
    );

    select recipe into v_recipe from products
     where id = v_line->>'productId' and branch_id = v_branch_id;
    for v_ingredient in select * from jsonb_array_elements(coalesce(v_recipe, '[]'::jsonb))
    loop
      v_ingredient_id := nullif(v_ingredient->>'inventoryItemId', '');
      v_deduct := coalesce(nullif(v_ingredient->>'qty', '')::numeric, 0) * (v_line->>'qty')::int;
      if v_ingredient_id is null or v_deduct <= 0 then continue; end if;
      v_result := public._sanky_consume_inventory_item(
        v_branch_id, v_ingredient_id, v_deduct, 'sale', v_cashier_id,
        v_cashier_name, v_id, v_created_at, array[]::text[], true
      );
      v_item_ids := v_item_ids || array(select jsonb_array_elements_text(v_result->'itemIds'));
      v_movements := v_movements || coalesce(v_result->'movements', '[]'::jsonb);
    end loop;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', item.id, 'quantity', item.quantity)), '[]'::jsonb)
    into v_inventory_updates
    from public.inventory_items item
   where item.branch_id = v_branch_id and item.id = any(v_item_ids);

  return jsonb_build_object(
    'id', v_id, 'branchId', v_branch_id, 'shiftId', v_shift_id,
    'orderNumber', v_order_number, 'lines', v_lines,
    'subtotal', (p_order->>'subtotal')::numeric,
    'discountAmount', (p_order->>'discountAmount')::numeric,
    'discountPercent', nullif(p_order->>'discountPercent', '')::numeric,
    'taxAmount', (p_order->>'taxAmount')::numeric,
    'taxRate', (p_order->>'taxRate')::numeric,
    'total', (p_order->>'total')::numeric, 'payment', p_order->'payment',
    'status', p_order->>'status', 'type', p_order->>'type',
    'tableNumber', p_order->>'tableNumber', 'customerId', v_customer_id,
    'customerName', p_order->>'customerName',
    'cashierId', v_cashier_id, 'cashierName', v_cashier_name,
    'createdAt', to_char(v_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'inventoryUpdates', v_inventory_updates,
    'stockMovementUpdates', v_movements
  );
end;
$function$;

grant execute on function public.create_order(jsonb, jsonb) to anon, authenticated;
