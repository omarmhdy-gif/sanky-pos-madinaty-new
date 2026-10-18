-- Share the POS table/area layout between the website and the Windows app.
-- Active table orders and occupancy remain on the device that is serving them.
alter table public.shop_settings
  add column if not exists dining_layout jsonb;
