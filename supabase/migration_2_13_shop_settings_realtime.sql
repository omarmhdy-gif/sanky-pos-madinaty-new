-- Let the web POS and Windows cashier receive live settings/layout changes.
-- Realtime subscriptions must be explicitly added to the publication.
alter publication supabase_realtime add table public.shop_settings;
