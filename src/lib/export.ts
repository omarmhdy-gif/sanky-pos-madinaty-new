import type { AppData } from "@/lib/types";

// Full-data backup export (Settings -> Data Management). Deliberately plain
// CSV, not a binary .xlsx: the only maintained way to generate real .xlsx
// files client-side is the `xlsx` npm package, whose only registry release
// (0.18.5) has two unpatched HIGH-severity CVEs (prototype pollution +
// ReDoS) with no fix available — SheetJS stopped publishing patched builds
// to npm. Shipping that into a production POS isn't an acceptable
// trade-off for a "nice to have" export format. CSV has no such risk, is
// zero-dependency, and Excel opens it natively (File -> Open, or just
// double-click) — it satisfies "export to Excel" without the CVE.

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/["\n,]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(rows.reduce((set, row) => { Object.keys(row).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  return lines.join("\r\n");
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  // UTF-8 BOM so Excel on Windows correctly detects the encoding instead of
  // mangling non-ASCII text — this app is bilingual (Arabic product/staff
  // names throughout), so this isn't optional.
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Every entity in AppData, exported as one CSV file each — triggered as a
 * staggered sequence of downloads (browsers can silently drop rapid-fire
 * simultaneous downloads as spam) so every non-empty table reliably lands
 * in the Downloads folder. */
export async function exportAllToCsv(data: AppData): Promise<number> {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const entities: [string, Record<string, unknown>[]][] = [
    ["orders", data.orders as unknown as Record<string, unknown>[]],
    [
      "order-lines",
      data.orders.flatMap((o) => o.lines.map((l) => ({ orderId: o.id, orderNumber: o.orderNumber, ...l }))) as unknown as Record<
        string,
        unknown
      >[],
    ],
    ["products", data.products as unknown as Record<string, unknown>[]],
    ["categories", data.categories as unknown as Record<string, unknown>[]],
    ["inventory-items", data.inventoryItems as unknown as Record<string, unknown>[]],
    ["stock-movements", data.stockMovements as unknown as Record<string, unknown>[]],
    ["expenses", data.expenses as unknown as Record<string, unknown>[]],
    ["purchases", data.purchases as unknown as Record<string, unknown>[]],
    ["shifts", data.shifts as unknown as Record<string, unknown>[]],
    ["staff", data.staff as unknown as Record<string, unknown>[]],
    ["attendance", data.attendance as unknown as Record<string, unknown>[]],
  ];

  let count = 0;
  for (const [name, rows] of entities) {
    if (rows.length === 0) continue;
    downloadCsv(`sanky-pos-${name}-${dateStamp}.csv`, rows);
    count++;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return count;
}
