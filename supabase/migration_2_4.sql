-- ============================================================================
-- Migration 2.4 — Inventory Pack Size (data-entry shortcut only)
-- ADDITIVE-SAFE TO RUN: adds one nullable column. Does not touch any
-- existing row's data. Safe to re-run.
--
-- inventory_items.pack_size — optional, piece-type items only (the UI never
-- shows/sets it for measured items). Null/unset means "no change" — every
-- existing item keeps behaving exactly as today. Purely a Receive Stock
-- data-entry helper (its "+ Pack" button adds pack_size at a time instead
-- of typing it out); the actual purchase/quantity saved is always just the
-- final piece count, same as before this migration — no business logic,
-- no new tables, nothing recorded about "packs" anywhere else.
-- ============================================================================

alter table inventory_items add column if not exists pack_size numeric;
