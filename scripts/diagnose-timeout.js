"use strict";
// Read-only production diagnostic: times every query fetchAll() issues on
// every app startup/branch-switch (see src/lib/supabase/api.ts's fetchAll),
// plus row counts, to find which exact query is timing out.
// Safe to run repeatedly — never writes anything.
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
  try {
    const { data, error, count } = await fn();
    const ms = Date.now() - start;
    if (error) {
      console.log(`[${ms}ms] FAILED  ${label} -> ${error.message} (code=${error.code ?? "?"})`);
    } else {
      console.log(`[${ms}ms] OK      ${label} -> rows=${Array.isArray(data) ? data.length : count ?? "n/a"}`);
    }
    return { ms, error, data };
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`[${ms}ms] THREW   ${label} -> ${err.message}`);
    return { ms, error: err };
  }
}

(async () => {
  console.log("=== Branches ===");
  const { data: branches } = await supabase.from("branches").select("id, name");
  console.log(branches);

  console.log("\n=== Row counts (exact, per table) ===");
  for (const table of ["orders", "order_lines", "stock_movements", "purchases", "expenses", "shifts", "attendance"]) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    console.log(`${table}: ${error ? "ERROR " + error.message : count}`);
  }

  for (const branch of branches) {
    console.log(`\n=== Branch ${branch.id} (${branch.name?.en ?? ""}) ===`);

    const { count: ordersCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branch.id);
    console.log(`orders for this branch: ${ordersCount}`);

    // Exactly fetchAll()'s queries, timed individually (mirrors api.ts).
    await timed("shop_settings", () => supabase.from("shop_settings").select("*").eq("branch_id", branch.id).single());
    await timed("staff_public", () => supabase.from("staff_public").select("*").eq("branch_id", branch.id).order("name"));
    await timed("categories", () => supabase.from("categories").select("*").eq("branch_id", branch.id).order("sort_order"));
    await timed("modifier_groups", () => supabase.from("modifier_groups").select("*").eq("branch_id", branch.id).order("sort_order"));
    await timed("products", () => supabase.from("products").select("*").eq("branch_id", branch.id).order("sort_order"));
    await timed("orders + order_lines (full history, unbounded)", () =>
      supabase.from("orders").select("*, order_lines(*)").eq("branch_id", branch.id).order("created_at", { ascending: false })
    );
    await timed("expenses", () => supabase.from("expenses").select("*").eq("branch_id", branch.id).order("created_at", { ascending: false }));
    await timed("inventory_items", () => supabase.from("inventory_items").select("*").eq("branch_id", branch.id).order("quantity", { ascending: true }));
    await timed("stock_movements (+inventory_items join, limit 200)", () =>
      supabase.from("stock_movements").select("*, inventory_items(name)").eq("branch_id", branch.id).order("created_at", { ascending: false }).limit(200)
    );
    await timed("purchases (+inventory_items join, limit 200)", () =>
      supabase.from("purchases").select("*, inventory_items(name)").eq("branch_id", branch.id).order("created_at", { ascending: false }).limit(200)
    );
    await timed("shifts", () => supabase.from("shifts").select("*").eq("branch_id", branch.id).order("started_at", { ascending: false }));
    await timed("attendance (limit 200)", () =>
      supabase.from("attendance").select("*").eq("branch_id", branch.id).order("check_in_at", { ascending: false }).limit(200)
    );
    await timed("attendance_employees_public", () => supabase.from("attendance_employees_public").select("*").eq("branch_id", branch.id).order("name"));

    // Isolate: is it the base orders scan, or the order_lines join specifically?
    await timed("orders ONLY (no order_lines join)", () =>
      supabase.from("orders").select("*").eq("branch_id", branch.id).order("created_at", { ascending: false })
    );
    await timed("order_lines count for this branch's orders (proxy via orders join)", () =>
      supabase.from("order_lines").select("*", { count: "exact", head: true })
    );
  }
})().catch((err) => {
  console.error("DIAGNOSTIC FAILED:", err);
  process.exit(1);
});
