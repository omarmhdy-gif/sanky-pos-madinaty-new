"use strict";
// Read-only check: confirms zero existing orders use payment_method =
// 'talabat' today, which is what makes the new Talabat exclusion logic
// change nothing about existing reports' numbers (requirement 11).
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
  const { data, error } = await supabase.from("orders").select("id, payment");
  if (error) throw new Error(error.message);
  const methodCounts = {};
  for (const o of data) {
    const m = o.payment?.method ?? "unknown";
    methodCounts[m] = (methodCounts[m] ?? 0) + 1;
  }
  console.log(`Total orders: ${data.length}`);
  console.log("Breakdown by payment method:", JSON.stringify(methodCounts, null, 2));
  console.log(`\nExisting orders with payment_method = 'talabat': ${methodCounts.talabat ?? 0}`);
  console.log((methodCounts.talabat ?? 0) === 0 ? "CONFIRMED: zero existing Talabat orders — new exclusion logic changes nothing for current data." : "WARNING: existing Talabat orders found — review impact.");
})().catch((err) => {
  console.error("CHECK FAILED:", err.message);
  process.exit(1);
});
