-- Promo codes: branch-scoped codes with a discount percentage and an expiry
-- calculated from the number of days selected when creating the code.
alter table orders add column if not exists promo_code text;

create table if not exists promo_codes (
  id text primary key default gen_random_uuid()::text,
  branch_id text not null references branches(id) on delete cascade,
  code text not null,
  discount_percent numeric not null check (discount_percent > 0 and discount_percent <= 100),
  duration_days integer not null check (duration_days > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (branch_id, code)
);

alter table promo_codes enable row level security;
drop policy if exists "anon full access" on promo_codes;
create policy "anon full access" on promo_codes for all using (true) with check (true);
grant select, insert, update, delete on promo_codes to anon, authenticated;
