-- Associate each promo code with the registered customer who is added to an order
-- when the cashier enters the code.
alter table promo_codes
  add column if not exists customer_id text references customers(id) on delete set null;

create index if not exists idx_promo_codes_customer_id on promo_codes(customer_id);
