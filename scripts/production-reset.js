"use strict";
// Production Reset: clears transactional/history data while preserving all
// configuration (products, categories, recipes, branches, employees, PINs,
// attendance settings, shift templates, printer/device config, system
// settings). Run production-backup.js first — this script assumes a fresh
// backup already exists and does not take one itself.
//
// Delete order respects foreign keys: stock_movements references orders
// (no cascade) so it goes first; orders cascade-delete order_lines
// automatically; shifts go after orders since orders.shift_id references
// shifts (no cascade). attendance/purchases/expenses have no dependents.
// inventory_items rows are kept and only their `quantity` is zeroed.
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

async function countRows(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count;
}

async function deleteAll(table) {
  const before = await countRows(table);
  const { error } = await supabase.from(table).delete().not("id", "is", null);
  if (error) throw new Error(`${table} delete: ${error.message}`);
  const after = await countRows(table);
  console.log(`${table}: ${before} -> ${after} rows`);
  if (after !== 0) throw new Error(`${table} still has ${after} rows after delete`);
}

(async () => {
  console.log("=== Production Reset starting ===\n");

  console.log("-- Clearing transactional/history tables --");
  await deleteAll("stock_movements");
  await deleteAll("orders"); // cascades order_lines
  const orderLinesLeft = await countRows("order_lines");
  console.log(`order_lines (cascaded): ${orderLinesLeft} rows remaining`);
  if (orderLinesLeft !== 0) throw new Error("order_lines did not fully cascade");
  await deleteAll("shifts");
  await deleteAll("attendance");
  await deleteAll("purchases");
  await deleteAll("expenses");

  console.log("\n-- Zeroing inventory quantities (items themselves kept) --");
  const { data: items, error: itemsErr } = await supabase.from("inventory_items").select("id, quantity");
  if (itemsErr) throw new Error(`inventory_items read: ${itemsErr.message}`);
  const { error: zeroErr } = await supabase.from("inventory_items").update({ quantity: 0 }).not("id", "is", null);
  if (zeroErr) throw new Error(`inventory_items zero: ${zeroErr.message}`);
  const { count: itemsAfterCount } = await supabase.from("inventory_items").select("*", { count: "exact", head: true });
  console.log(`inventory_items: ${items.length} items kept, all quantities set to 0 (row count unchanged: ${itemsAfterCount})`);

  console.log("\n-- Verifying preserved config tables are untouched --");
  for (const table of ["products", "categories", "branches", "staff", "modifier_groups", "attendance_employees", "shop_settings"]) {
    const c = await countRows(table);
    console.log(`${table}: ${c} rows (kept)`);
  }

  console.log("\n=== Production Reset complete ===");
})().catch((err) => {
  console.error("\nRESET FAILED (stopped, no further steps taken):", err.message);
  process.exit(1);
});
