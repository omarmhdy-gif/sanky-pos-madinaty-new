-- Add persistent per-branch external payment configuration. The existing
-- Talabat name/icon columns are also created here because older production
-- databases may not yet have received migration_2_3.sql.
alter table public.shop_settings
  add column if not exists external_payment_name jsonb,
  add column if not exists external_payment_icon text,
  add column if not exists external_payment_methods jsonb;

update public.shop_settings
set external_payment_name = coalesce(external_payment_name, '{"en":"Talabat","ar":"طلبات"}'::jsonb),
    external_payment_icon = coalesce(external_payment_icon, 'Bike')
where external_payment_name is null or external_payment_icon is null;

update public.shop_settings
set external_payment_methods = jsonb_build_array(
  jsonb_build_object(
    'id', 'talabat',
    'name', external_payment_name,
    'icon', external_payment_icon
  )
)
where external_payment_methods is null
   or case
        when jsonb_typeof(external_payment_methods) = 'array'
          then jsonb_array_length(external_payment_methods) = 0
        else true
      end;

alter table public.shop_settings
  alter column external_payment_name set default '{"en":"Talabat","ar":"طلبات"}'::jsonb,
  alter column external_payment_icon set default 'Bike',
  alter column external_payment_methods set default '[{"id":"talabat","name":{"en":"Talabat","ar":"طلبات"},"icon":"Bike"}]'::jsonb,
  alter column external_payment_name set not null,
  alter column external_payment_icon set not null,
  alter column external_payment_methods set not null;
