-- ============================================================================
-- Migration 1.9 — Multi Pricing
-- ADDITIVE-SAFE TO RUN: adds new nullable columns only, does not drop or
-- truncate any existing data or table. Safe to re-run.
-- ============================================================================

-- Secondary ("alternate") price per product — undefined/null means this
-- product has no secondary price configured, so the POS's "Second Price"
-- cart action leaves it at its primary price.
alter table products add column if not exists secondary_price numeric;

-- Multi Pricing on/off + owner-renamable labels for the two price levels
-- (e.g. "Staff Price"/"Visitor Price", or "Wholesale"/"Retail"). Stored as
-- jsonb, same pattern as shop_settings.shift_templates.
alter table shop_settings add column if not exists multi_pricing jsonb;

update shop_settings
set multi_pricing = '{"enabled":false,"primaryLabel":{"en":"Primary Price","ar":"السعر الأساسي"},"secondaryLabel":{"en":"Second Price","ar":"السعر الثاني"}}'::jsonb
where multi_pricing is null;
