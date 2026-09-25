"use strict";
// Full backup of every table that the Production Reset is about to clear.
// Run BEFORE any delete. Writes one timestamped JSON file per table to
// backups/<timestamp>/ so the owner has a complete, restorable snapshot of
// real production data even though the reset itself is irreversible via
// the anon-key client SDK used here.
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

const TABLES_TO_BACKUP = [
  "orders",
  "order_lines",
  "shifts",
  "attendance",
  "purchases",
  "expenses",
  "stock_movements",
  "inventory_items", // backed up too, since we're about to mutate quantity on every row
];

async function fetchAll(table) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(__dirname, "..", "backups", `production-reset-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const summary = {};
  for (const table of TABLES_TO_BACKUP) {
    const rows = await fetchAll(table);
    fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
    summary[table] = rows.length;
    console.log(`Backed up ${table}: ${rows.length} rows`);
  }

  fs.writeFileSync(path.join(dir, "_summary.json"), JSON.stringify({ takenAt: new Date().toISOString(), counts: summary }, null, 2));
  console.log(`\nBackup complete: ${dir}`);
})().catch((err) => {
  console.error("BACKUP FAILED:", err.message);
  process.exit(1);
});
