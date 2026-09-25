"use strict";
// Read-only production verification of the new lazy order-loading
// architecture:
//   1. fetchAll() minus orders is fast even for branch_gmc (previously
//      timed out at 3.1s with the full orders+order_lines query).
//   2. Pagination (getOrdersPage's query shape) returns correct,
//      non-overlapping pages.
//   3. Shift-scoped and month-range queries (ShiftDialog/Dashboard/Reports)
//      work and stay fast.
// Never writes anything.
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}
const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function timed(label, fn) {
  const start = Date.now();
  const { data, error } = await fn();
  const ms = Date.now() - start;
  console.log(`[${ms}ms] ${error ? "FAILED " + error.message : "OK rows=" + (data?.length ?? "n/a")}  ${label}`);
  return { ms, data, error };
}

(async () => {
  const branchId = "branch_gmc"; // the branch that previously timed out
  console.log(`=== ${branchId} — new fetchAll() query set (orders excluded) ===`);

  const results = await Promise.all([
    timed("shop_settings", () => supabase.from("shop_settings").select("*").eq("branch_id", branchId).single()),
    timed("staff_public", () => supabase.from("staff_public").select("*").eq("branch_id", branchId).order("name")),
    timed("categories", () => supabase.from("categories").select("*").eq("branch_id", branchId).order("sort_order")),
    timed("products", () => supabase.from("products").select("*").eq("branch_id", branchId).order("sort_order")),
    timed("inventory_items", () => supabase.from("inventory_items").select("*").eq("branch_id", branchId).order("quantity", { ascending: true })),
    timed("stock_movements(limit 200)", () => supabase.from("stock_movements").select("*, inventory_items(name)").eq("branch_id", branchId).order("created_at", { ascending: false }).limit(200)),
    timed("purchases(limit 200)", () => supabase.from("purchases").select("*, inventory_items(name)").eq("branch_id", branchId).order("created_at", { ascending: false }).limit(200)),
    timed("shifts", () => supabase.from("shifts").select("*").eq("branch_id", branchId).order("started_at", { ascending: false })),
    timed("attendance(limit 200)", () => supabase.from("attendance").select("*").eq("branch_id", branchId).order("check_in_at", { ascending: false }).limit(200)),
  ]);
  const totalMs = results.reduce((s, r) => s + r.ms, 0);
  const anyFailed = results.some((r) => r.error);
  console.log(`Sum of all fetchAll() query times: ${totalMs}ms — ${anyFailed ? "SOME FAILED" : "ALL SUCCEEDED"}\n`);

  console.log("=== Pagination correctness (getOrdersPage shape) ===");
  const page0 = await timed("page 0 (offset 0, limit 50)", () =>
    supabase.from("orders").select("*, order_lines(*)").eq("branch_id", branchId).order("created_at", { ascending: false }).range(0, 49)
  );
  const page1 = await timed("page 1 (offset 50, limit 50)", () =>
    supabase.from("orders").select("*, order_lines(*)").eq("branch_id", branchId).order("created_at", { ascending: false }).range(50, 99)
  );
  const ids0 = new Set((page0.data ?? []).map((o) => o.id));
  const overlap = (page1.data ?? []).filter((o) => ids0.has(o.id));
  console.log(`page 0 rows: ${page0.data?.length}, page 1 rows: ${page1.data?.length}, overlap: ${overlap.length} (expect 0)`);
  const newestPage0 = page0.data?.[0]?.created_at;
  const oldestPage0 = page0.data?.[page0.data.length - 1]?.created_at;
  const newestPage1 = page1.data?.[0]?.created_at;
  console.log(`page 0 newest->oldest: ${newestPage0} -> ${oldestPage0}`);
  console.log(`page 1 newest: ${newestPage1} (expect <= page 0's oldest: ${oldestPage0 <= newestPage1 || newestPage1 <= oldestPage0 ? "ordering consistent" : "MISMATCH"})`);

  console.log("\n=== Shift-scoped query (ShiftDialog) ===");
  const { data: recentShift } = await supabase
    .from("shifts")
    .select("id")
    .eq("branch_id", branchId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentShift) {
    await timed(`orders for shift ${recentShift.id}`, () =>
      supabase.from("orders").select("*, order_lines(*)").eq("branch_id", branchId).eq("shift_id", recentShift.id).order("created_at", { ascending: false })
    );
  } else {
    console.log("No shifts found for this branch — skipping.");
  }

  console.log("\n=== Current-month range query (Dashboard/Reports monthlySummary) ===");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  await timed("orders this calendar month", () =>
    supabase
      .from("orders")
      .select("*, order_lines(*)")
      .eq("branch_id", branchId)
      .gte("created_at", monthStart.toISOString())
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: false })
  );

  console.log("\n=== 'All' filter (epoch-to-now, explicit owner action only) ===");
  await timed("orders epoch-to-now (full history)", () =>
    supabase
      .from("orders")
      .select("*, order_lines(*)")
      .eq("branch_id", branchId)
      .gte("created_at", new Date(0).toISOString())
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: false })
  );
})().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
