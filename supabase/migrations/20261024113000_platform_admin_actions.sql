create or replace function public.platform_create_shop(
  p_name text,
  p_owner_email text,
  p_plan text,
  p_modules text[],
  p_monthly_fee numeric default null,
  p_branch_limit integer default 1,
  p_device_limit integer default 1,
  p_expires_at date default null
)
returns public.platform_shops
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_code text;
  v_shop public.platform_shops;
  v_attempt integer;
begin
  if not public.platform_admin_is_allowed() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_plan not in ('starter', 'growth', 'premium') then
    raise exception 'invalid plan' using errcode = '22023';
  end if;
  if coalesce(array_length(p_modules, 1), 0) = 0 then
    raise exception 'select at least one module' using errcode = '22023';
  end if;

  for v_attempt in 1..40 loop
    v_code := lpad(floor(random() * 10000)::integer::text, 4, '0');
    begin
      insert into public.platform_shops (
        account_number, name, owner_email, plan, status, modules,
        monthly_fee, branch_limit, device_limit, expires_at
      ) values (
        v_code, trim(p_name), lower(trim(p_owner_email)), p_plan, 'trial', p_modules,
        p_monthly_fee, p_branch_limit, p_device_limit, p_expires_at
      ) returning * into v_shop;
      return v_shop;
    exception when unique_violation then
      if v_attempt = 40 then
        raise exception 'unable to allocate a unique account number' using errcode = '23505';
      end if;
    end;
  end loop;

  raise exception 'unable to allocate a unique account number' using errcode = '23505';
end;
$$;

create or replace function public.platform_record_payment(
  p_shop_id uuid,
  p_amount numeric,
  p_note text default ''
)
returns public.platform_payments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shop public.platform_shops;
  v_period_start date;
  v_period_end date;
  v_payment public.platform_payments;
begin
  if not public.platform_admin_is_allowed() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment must be positive' using errcode = '22023';
  end if;

  select * into v_shop
  from public.platform_shops
  where id = p_shop_id
  for update;
  if not found then
    raise exception 'shop not found' using errcode = 'P0002';
  end if;

  v_period_start := greatest(coalesce(v_shop.expires_at, current_date), current_date);
  v_period_end := (v_period_start + interval '1 month')::date;

  insert into public.platform_payments (
    shop_id, amount, currency, paid_on, period_start, period_end, note, created_by
  ) values (
    v_shop.id, p_amount, v_shop.currency, current_date,
    v_period_start, v_period_end, coalesce(p_note, ''), auth.uid()
  ) returning * into v_payment;

  update public.platform_shops
  set status = 'active', expires_at = v_period_end
  where id = v_shop.id;

  return v_payment;
end;
$$;

revoke all on function public.platform_create_shop(text, text, text, text[], numeric, integer, integer, date) from public, anon;
revoke all on function public.platform_record_payment(uuid, numeric, text) from public, anon;
grant execute on function public.platform_create_shop(text, text, text, text[], numeric, integer, integer, date) to authenticated;
grant execute on function public.platform_record_payment(uuid, numeric, text) to authenticated;
