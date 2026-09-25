"use strict";
// Read-only investigation: finds stock_movements whose inventory_item_id
// doesn't match any row currently in inventory_items, and checks whether
// those exact ids exist ANYWHERE (any branch, any table) to determine the
// real root cause — genuinely deleted item vs. branch mismatch vs.
// something else. Makes no writes.
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

(async () => {
  const { data: movements, error: mErr } = await supabase
    .from("stock_movements")
    .select("id, branch_id, inventory_item_id, reason, quantity_delta, created_at")
    .order("created_at", { ascending: false });
  if (mErr) throw new Error(mErr.message);
  console.log(`Total stock_movements: ${movements.length}`);

  const { data: items, error: iErr } = await supabase.from("inventory_items").select("id, branch_id, name");
  if (iErr) throw new Error(iErr.message);
  console.log(`Total inventory_items (all branches): ${items.length}`);

  const itemById = new Map(items.map((i) => [i.id, i]));

  const orphaned = movements.filter((m) => !itemById.has(m.inventory_item_id));
  console.log(`\nOrphaned movements (item id not found at all): ${orphaned.length}`);
  for (const m of orphaned.slice(0, 10)) {
    console.log(`  ${m.id} | branch=${m.branch_id} | item_id=${m.inventory_item_id} | reason=${m.reason} | qty=${m.quantity_delta} | at=${m.created_at}`);
  }

  const branchMismatch = movements.filter((m) => {
    const item = itemById.get(m.inventory_item_id);
    return item && item.branch_id !== m.branch_id;
  });
  console.log(`\nBranch-mismatched movements (item exists but in a different branch): ${branchMismatch.length}`);
  for (const m of branchMismatch.slice(0, 10)) {
    const item = itemById.get(m.inventory_item_id);
    console.log(`  ${m.id} | movement.branch=${m.branch_id} vs item.branch=${item.branch_id} | item_id=${m.inventory_item_id}`);
  }

  const reasonBreakdown = {};
  for (const m of movements) {
    const key = m.reason;
    reasonBreakdown[key] = reasonBreakdown[key] || { total: 0, orphaned: 0 };
    reasonBreakdown[key].total++;
    if (!itemById.has(m.inventory_item_id)) reasonBreakdown[key].orphaned++;
  }
  console.log("\nBy reason:", JSON.stringify(reasonBreakdown, null, 2));

  // Also check purchases for the same orphan pattern, since it references
  // inventory_items the same way.
  const { data: purchases, error: pErr } = await supabase.from("purchases").select("id, branch_id, inventory_item_id");
  if (!pErr) {
    const orphanedPurchases = purchases.filter((p) => !itemById.has(p.inventory_item_id));
    console.log(`\nTotal purchases: ${purchases.length}, orphaned: ${orphanedPurchases.length}`);
  }
})().catch((err) => {
  console.error("INVESTIGATION FAILED:", err.message);
  process.exit(1);
});
