-- ============================================================================
-- Migration 1.6 — Production Mode: remove reset_demo_data() entirely
-- ============================================================================
-- The "Reset Demo Data" button was removed from Settings back in Milestone
-- 1.5, but the underlying reset_demo_data() Postgres function was left in
-- place, still `grant execute`-ed to `anon` — meaning it stayed callable by
-- literally anyone with the public anon key (which is embedded in this
-- app's client-side JS bundle, so effectively anyone who inspects network
-- requests) via a direct call to Supabase's REST RPC endpoint, completely
-- bypassing the UI. That function truncates orders/shifts/expenses/stock
-- movements and deletes every product/category/inventory item/staff member,
-- then reseeds from the demo catalog — a real, exploitable, one-request way
-- to destroy this shop's live data. This migration removes it completely.
--
-- Safe to run on a live database with real data: this only drops a function
-- definition, it does not touch any table or row.
-- ============================================================================

drop function if exists reset_demo_data();
