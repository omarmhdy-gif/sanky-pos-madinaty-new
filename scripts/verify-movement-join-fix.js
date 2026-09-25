"use strict";
// Read-only verification: runs the EXACT query api.ts now uses
// (stock_movements with an embedded inventory_items(name) join) and
// confirms the previously-broken cross-branch-referencing movements now
// resolve to a real name instead of falling back to the raw id.
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

const REPORTED_IDS = ["inv_mrd9p5f7_wwj1lx", "inv_mrd9nwd5_wkfgxf", "inv_mrd8vxb9_uyib54"];

(async () => {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*, inventory_items(name)")
    .eq("branch_id", "branch_coffee")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  console.log(`Fetched ${data.length} branch_coffee movements with embedded join.\n`);

  const reportedRows = data.filter((m) => REPORTED_IDS.includes(m.inventory_item_id));
  console.log(`Rows matching the user-reported ids: ${reportedRows.length}`);
  for (const m of reportedRows) {
    const resolvedName = m.inventory_items ? JSON.stringify(m.inventory_items.name) : "NULL (would show 'Unknown Inventory Item')";
    console.log(`  id=${m.id} item_id=${m.inventory_item_id} -> resolved name: ${resolvedName}`);
  }

  const allResolved = data.every((m) => m.inventory_items && m.inventory_items.name);
  console.log(`\nAll ${data.length} fetched movements resolve to a real name via the join: ${allResolved}`);

  const stillUnresolved = data.filter((m) => !m.inventory_items);
  console.log(`Movements that would show "Unknown Inventory Item" (item genuinely gone): ${stillUnresolved.length}`);
})().catch((err) => {
  console.error("VERIFICATION FAILED:", err.message);
  process.exit(1);
});
