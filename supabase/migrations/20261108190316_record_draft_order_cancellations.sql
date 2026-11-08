-- Save unpaid POS cart cancellations for audit/history without treating them
-- as sales or changing inventory.

alter table public.orders
  add column if not exists void_reason text;

alter table public.shop_settings
  add column if not exists order_cancellation_settings jsonb not null default '{"requireReason":true,"allowCustomReason":true,"reasons":[{"id":"changed_mind","name":{"en":"Customer changed their mind","ar":"العميل غير رأيه"}},{"id":"entered_by_mistake","name":{"en":"Order entered by mistake","ar":"تم إدخال الطلب بالخطأ"}},{"id":"item_unavailable","name":{"en":"Item unavailable","ar":"الصنف غير متوفر"}},{"id":"long_wait","name":{"en":"Long waiting time","ar":"طول وقت الانتظار"}}]}'::jsonb;

create or replace function public.record_draft_order_cancellation(
  p_branch_id text,
  p_actor_id text,
  p_approval_pin text,
  p_order jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $function$
declare
  v_actor public.staff%rowtype;
  v_approver_count integer;
  v_actor_can_void boolean := false;
  v_reason text := btrim(coalesce(p_order->>'voidReason', ''));
  v_settings jsonb := '{}'::jsonb;
  v_require_reason boolean := true;
  v_allow_custom_reason boolean := true;
  v_order_id text := gen_random_uuid()::text;
  v_line jsonb;
  v_result jsonb;
begin
  if not private.shop_branch_accessible(p_branch_id) then
    raise exception 'Branch access denied.' using errcode = '42501';
  end if;
  select coalesce(s.order_cancellation_settings, '{}'::jsonb)
    into v_settings
    from public.shop_settings s
   where s.branch_id = p_branch_id;
  v_require_reason := coalesce(nullif(v_settings->>'requireReason', '')::boolean, true);
  v_allow_custom_reason := coalesce(nullif(v_settings->>'allowCustomReason', '')::boolean, true);

  if (v_require_reason and v_reason = '') or char_length(v_reason) > 300 then
    raise exception 'Order cancellation reason is required.' using errcode = '22023';
  end if;
  if v_reason <> '' and not v_allow_custom_reason and not exists (
    select 1
      from jsonb_array_elements(coalesce(v_settings->'reasons', '[]'::jsonb)) reason
     where reason->'name'->>'en' = v_reason
        or reason->'name'->>'ar' = v_reason
  ) then
    raise exception 'Choose a configured cancellation reason.' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A cancelled order must contain at least one item.' using errcode = '22023';
  end if;
  if coalesce(p_order->>'type', '') not in ('takeaway', 'dine_in') then
    raise exception 'Invalid order type.' using errcode = '22023';
  end if;

  select * into v_actor
    from public.staff s
   where s.id = p_actor_id
     and s.branch_id = p_branch_id
     and s.is_active;
  if not found then
    raise exception 'Active cashier not found for this branch.' using errcode = '42501';
  end if;

  -- NULL grants retain the app's legacy employee defaults; explicit grants
  -- must include orders.void or the legacy module-level orders grant.
  v_actor_can_void := v_actor.role = 'owner'
    or v_actor.permissions is null
    or v_actor.permissions @> '["orders.void"]'::jsonb
    or v_actor.permissions @> '["orders"]'::jsonb;

  if not v_actor_can_void then
    if p_approval_pin is null or p_approval_pin !~ '^[0-9]{4}$' then
      raise exception 'Invalid approval.' using errcode = '42501';
    end if;

    select count(*) into v_approver_count
      from public.staff s
     where s.branch_id = p_branch_id
       and s.is_active
       and s.pin_hash is not null
       and s.pin_hash = extensions.crypt(p_approval_pin, s.pin_hash)
       and (
         s.role = 'owner'
         or s.permissions is null
         or s.permissions @> '["orders.void"]'::jsonb
         or s.permissions @> '["orders"]'::jsonb
       );
    if v_approver_count <> 1 then
      raise exception 'Invalid approval.' using errcode = '42501';
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line->'name') is distinct from 'object'
       or coalesce(nullif(v_line->>'qty', '')::integer, 0) <= 0
       or coalesce(nullif(v_line->>'unitPrice', '')::numeric, -1) < 0 then
      raise exception 'Invalid cancelled order item.' using errcode = '22023';
    end if;
  end loop;

  insert into public.orders (
    id, branch_id, shift_id, subtotal, discount_amount, discount_percent,
    promo_code, tax_amount, tax_rate, total, payment, status, void_reason,
    type, table_number, customer_name, customer_id, cashier_id, cashier_name, created_at
  ) values (
    v_order_id,
    p_branch_id,
    nullif(p_order->>'shiftId', ''),
    greatest(0, coalesce(nullif(p_order->>'subtotal', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_order->>'discountAmount', '')::numeric, 0)),
    nullif(p_order->>'discountPercent', '')::numeric,
    nullif(p_order->>'promoCode', ''),
    greatest(0, coalesce(nullif(p_order->>'taxAmount', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_order->>'taxRate', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_order->>'total', '')::numeric, 0)),
    '{"method":"cash","amount":0}'::jsonb,
    'voided',
    v_reason,
    p_order->>'type',
    nullif(p_order->>'tableNumber', ''),
    nullif(p_order->>'customerName', ''),
    nullif(p_order->>'customerId', ''),
    v_actor.id,
    v_actor.name,
    now()
  );

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.order_lines (id, order_id, product_id, name, unit_price, qty, modifiers, note)
    values (
      gen_random_uuid()::text,
      v_order_id,
      nullif(v_line->>'productId', ''),
      v_line->'name',
      (v_line->>'unitPrice')::numeric,
      (v_line->>'qty')::integer,
      coalesce(v_line->'modifiers', '[]'::jsonb),
      nullif(v_line->>'note', '')
    );
  end loop;

  select to_jsonb(o) || jsonb_build_object(
    'order_lines', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.id)
        from public.order_lines l
       where l.order_id = o.id
    ), '[]'::jsonb)
  )
    into v_result
    from public.orders o
   where o.id = v_order_id;

  return v_result;
end;
$function$;

revoke all on function public.record_draft_order_cancellation(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.record_draft_order_cancellation(text, text, text, jsonb, jsonb) to authenticated;

-- Make the new column and RPC visible to PostgREST immediately.
notify pgrst, 'reload schema';
