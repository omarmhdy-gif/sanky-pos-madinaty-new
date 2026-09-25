-- ============================================================================
-- Migration 2.2 — Fix "canceling statement due to timeout" on app load
-- ADDITIVE-SAFE TO RUN: adds two indexes only. Does not touch any row,
-- column, or existing data. Safe to re-run (IF NOT EXISTS).
--
-- NOT using CONCURRENTLY: Supabase's SQL Editor runs scripts inside a
-- transaction block, and CONCURRENTLY cannot run inside one ("CREATE INDEX
-- CONCURRENTLY cannot run inside a transaction block"). Plain CREATE INDEX
-- takes a brief SHARE lock (blocks writes, not reads) while building — for
-- these table sizes (4,063 orders / 7,115 order_lines total) that's well
-- under a second, so this is safe to run during business hours too.
--
-- ROOT CAUSE (confirmed by reproducing the exact failure against production
-- with scripts/diagnose-timeout.js):
--
-- src/lib/supabase/api.ts's fetchAll() — called on every login/branch-switch
-- via DataBootstrap.tsx — runs:
--
--   supabase.from("orders").select("*, order_lines(*)")
--     .eq("branch_id", branchId)
--     .order("created_at", { ascending: false })
--
-- for Sanky GMC (branch_gmc, 4,063 orders / ~6,700 order_lines) this now
-- fails with "canceling statement due to statement timeout" (Postgres error
-- 57014) after ~3.1s. The same query for Sanky Coffee (389 orders) succeeds
-- in under 500ms — same query, same code, just more rows on one branch.
-- Stripping the order_lines(*) embed and re-running just `orders` alone for
-- branch_gmc succeeds in 275ms, isolating the join itself as the expensive
-- part, not the orders table scan.
--
-- supabase/schema.sql has never defined a single index beyond implicit
-- primary keys (confirmed: zero `create index` statements anywhere in
-- supabase/*.sql). Postgres does NOT auto-index foreign key columns, so
-- order_lines.order_id — the exact column this embed joins on — has always
-- been a sequential scan. That was invisible while every branch's order
-- history was small; it stopped being invisible once branch_gmc's order
-- count grew enough that the embed's per-order lookup against an unindexed
-- order_lines became quadratic-ish and finally crossed Supabase's statement
-- timeout. This is a pre-existing schema gap, not something introduced by
-- Waste/Reports/Dashboard/Talabat/Multi Pricing — none of those changes
-- touched fetchAll(), the orders/order_lines schema, or any index; they were
-- ruled out by inspection (all Waste/Reports/Dashboard analytics run
-- entirely in-browser over already-fetched data, no new SQL) and by the
-- fact this reproduces on a plain, unmodified fetchAll() query.
-- ============================================================================

create index if not exists order_lines_order_id_idx
  on order_lines (order_id);

create index if not exists orders_branch_id_created_at_idx
  on orders (branch_id, created_at desc);
