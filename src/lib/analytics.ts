import type { Order, Product, Expense, Purchase, InventoryItem } from "@/lib/types";
import { isSameDay, daysAgo, startOfDay, endOfDay } from "@/lib/utils";
import { recipeCost } from "@/lib/inventory";

export type DateFilterKey = "today" | "yesterday" | "week" | "month" | "all" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

/** Resolves a named filter (or a custom from/to pair) into a concrete date
 * range. Returns null for "all" (no bound) or an incomplete custom range. */
export function dateRangeForFilter(
  key: DateFilterKey,
  customFrom?: Date,
  customTo?: Date,
  ref: Date = new Date()
): DateRange | null {
  switch (key) {
    case "today":
      return { from: startOfDay(ref), to: endOfDay(ref) };
    case "yesterday": {
      const y = daysAgo(1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "week": {
      // Calendar week, Monday-Sunday.
      const day = ref.getDay();
      const diffToMonday = (day + 6) % 7;
      const monday = startOfDay(ref);
      monday.setDate(monday.getDate() - diffToMonday);
      return { from: monday, to: endOfDay(ref) };
    }
    case "month": {
      const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
      return { from: startOfDay(first), to: endOfDay(ref) };
    }
    case "custom":
      if (!customFrom || !customTo) return null;
      return { from: startOfDay(customFrom), to: endOfDay(customTo) };
    case "all":
    default:
      return null;
  }
}

export function isThisMonth(iso: string, ref: Date = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export function completedOrders(orders: Order[]): Order[] {
  return orders.filter((o) => o.status === "completed");
}

export function isTalabatOrder(o: Order): boolean {
  return o.payment.method === "talabat";
}

/** Discarded product, not revenue — see PaymentMethod's "waste" doc comment
 * in types.ts. Requires o.wasteReason, collects no payment. */
export function isWasteOrder(o: Order): boolean {
  return o.payment.method === "waste";
}

/** Every POS revenue/cash figure (Dashboard, Reports KPIs, shift totals,
 * cash reconciliation, payment-method totals) must be computed from this,
 * never from completedOrders() directly — Talabat is external marketplace
 * revenue and Waste is discarded product, both tracked completely
 * separately (see talabatOrders()/wasteOrders() below), neither part of
 * till sales. Inventory/recipe/product-stat consumers (topProducts, stock
 * deduction) are unaffected and keep using completedOrders(). */
export function posOrders(orders: Order[]): Order[] {
  return completedOrders(orders).filter((o) => !isTalabatOrder(o) && !isWasteOrder(o));
}

/** Talabat-only completed orders — external marketplace revenue, reported
 * in its own separate section everywhere (Dashboard, Reports, Shift Report). */
export function talabatOrders(orders: Order[]): Order[] {
  return completedOrders(orders).filter(isTalabatOrder);
}

/** Waste-only completed orders — discarded product, reported in its own
 * separate Waste Report (see wasteSummary()) everywhere else excluded. */
export function wasteOrders(orders: Order[]): Order[] {
  return completedOrders(orders).filter(isWasteOrder);
}

/** All completed orders except Waste — used where Talabat should still be
 * included (e.g. Top Selling Products, matching existing precedent that
 * product-level stats include Talabat) but discarded product must not be
 * counted as "sold" at all. */
export function nonWasteOrders(orders: Order[]): Order[] {
  return orders.filter((o) => !isWasteOrder(o));
}

/** Orders Count / Total Revenue / Average Order for Talabat, over the same
 * date range as the main reports (pass the same `range` used elsewhere on
 * the page). */
export function talabatSummary(orders: Order[], range: DateRange | null) {
  const list = ordersInDateRange(talabatOrders(orders), range);
  const revenue = sumTotal(list);
  const count = list.length;
  const avgOrder = count > 0 ? Math.round((revenue / count) * 100) / 100 : 0;
  return { count, revenue, avgOrder };
}

export interface WasteProductStat {
  productId: string;
  name: string;
  qty: number;
  cost: number;
  sellingValue: number;
}

export interface WasteReasonStat {
  reason: string;
  count: number;
  cost: number;
}

export interface WasteEmployeeStat {
  employeeName: string;
  count: number;
  cost: number;
}

export interface WasteSummary {
  count: number;
  cost: number;
  sellingValue: number;
  byProduct: WasteProductStat[];
  byReason: WasteReasonStat[];
  byEmployee: WasteEmployeeStat[];
}

/** Waste Report — quantity/cost/selling-value per product, per reason, and
 * per employee, over the given date range. Cost uses recipeCost() (last
 * purchase cost per ingredient), the same valuation used everywhere else in
 * the app — never duplicated/reimplemented here. */
export function wasteSummary(
  orders: Order[],
  products: Product[],
  inventoryItems: InventoryItem[],
  range: DateRange | null,
  locale: "en" | "ar" = "en"
): WasteSummary {
  const list = ordersInDateRange(wasteOrders(orders), range);
  let cost = 0;
  let sellingValue = 0;
  const byProductMap = new Map<string, WasteProductStat>();
  const byReasonMap = new Map<string, WasteReasonStat>();
  const byEmployeeMap = new Map<string, WasteEmployeeStat>();

  list.forEach((o) => {
    let orderCost = 0;
    o.lines.forEach((line) => {
      const product = products.find((p) => p.id === line.productId);
      const lineCost = product ? recipeCost(product, inventoryItems) * line.qty : 0;
      const lineRevenue = (line.unitPrice + line.modifiers.reduce((s, m) => s + m.priceDelta, 0)) * line.qty;
      cost += lineCost;
      sellingValue += lineRevenue;
      orderCost += lineCost;

      const existing = byProductMap.get(line.productId) ?? {
        productId: line.productId,
        name: product ? product.name[locale] || product.name.en : "Unknown",
        qty: 0,
        cost: 0,
        sellingValue: 0,
      };
      existing.qty += line.qty;
      existing.cost += lineCost;
      existing.sellingValue += lineRevenue;
      byProductMap.set(line.productId, existing);
    });

    const reason = o.wasteReason?.trim() || "—";
    const r = byReasonMap.get(reason) ?? { reason, count: 0, cost: 0 };
    r.count += 1;
    r.cost += orderCost;
    byReasonMap.set(reason, r);

    const e = byEmployeeMap.get(o.cashierName) ?? { employeeName: o.cashierName, count: 0, cost: 0 };
    e.count += 1;
    e.cost += orderCost;
    byEmployeeMap.set(o.cashierName, e);
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    count: list.length,
    cost: round2(cost),
    sellingValue: round2(sellingValue),
    byProduct: Array.from(byProductMap.values())
      .map((s) => ({ ...s, cost: round2(s.cost), sellingValue: round2(s.sellingValue) }))
      .sort((a, b) => b.qty - a.qty),
    byReason: Array.from(byReasonMap.values())
      .map((s) => ({ ...s, cost: round2(s.cost) }))
      .sort((a, b) => b.count - a.count),
    byEmployee: Array.from(byEmployeeMap.values())
      .map((s) => ({ ...s, cost: round2(s.cost) }))
      .sort((a, b) => b.count - a.count),
  };
}

export interface ProductSalesRow {
  productId: string;
  name: string;
  image: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
}

/** Daily Product Sales Report — per-product qty/revenue/cost/profit for
 * whatever order set/date range the caller passes (pass POS-only,
 * date-filtered orders, e.g. reports/page.tsx's `rangeOrders`). Mirrors
 * topProducts()'s exact qty/revenue math (kept as a separate function
 * instead of modifying topProducts, since that function's two existing call
 * sites don't need cost/profit and must keep behaving exactly as before). */
export function productSalesReport(
  orders: Order[],
  products: Product[],
  inventoryItems: InventoryItem[],
  locale: "en" | "ar" = "en"
): ProductSalesRow[] {
  const counts = new Map<string, { qty: number; revenue: number }>();
  completedOrders(orders).forEach((o) => {
    o.lines.forEach((line) => {
      const existing = counts.get(line.productId) ?? { qty: 0, revenue: 0 };
      const lineRevenue = (line.unitPrice + line.modifiers.reduce((s, m) => s + m.priceDelta, 0)) * line.qty;
      counts.set(line.productId, { qty: existing.qty + line.qty, revenue: existing.revenue + lineRevenue });
    });
  });
  return Array.from(counts.entries())
    .map(([productId, stats]) => {
      const product = products.find((p) => p.id === productId);
      const unitCost = product ? recipeCost(product, inventoryItems) : 0;
      const revenue = Math.round(stats.revenue * 100) / 100;
      const cost = Math.round(unitCost * stats.qty * 100) / 100;
      return {
        productId,
        name: product ? product.name[locale] || product.name.en : "Unknown",
        image: product?.image ?? "☕",
        qty: stats.qty,
        revenue,
        cost,
        profit: Math.round((revenue - cost) * 100) / 100,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export interface InventoryConsumptionSummary {
  inventoryCost: number;
  salesTotal: number;
  grossProfit: number;
}

/** Inventory Consumption Report — recipe-based COGS against actual sales,
 * for whatever order set the caller passes (pass POS-only, date-filtered
 * orders so both figures line up — e.g. reports/page.tsx's `rangeOrders`).
 * Gross Profit = Sales - Inventory Cost, using live recipeCost() (last
 * purchase cost), not the separate purchases-based monthlySummary(). */
export function inventoryConsumptionSummary(
  orders: Order[],
  products: Product[],
  inventoryItems: InventoryItem[]
): InventoryConsumptionSummary {
  let inventoryCost = 0;
  completedOrders(orders).forEach((o) => {
    o.lines.forEach((line) => {
      const product = products.find((p) => p.id === line.productId);
      if (product) inventoryCost += recipeCost(product, inventoryItems) * line.qty;
    });
  });
  inventoryCost = Math.round(inventoryCost * 100) / 100;
  const salesTotal = sumTotal(orders);
  return {
    inventoryCost,
    salesTotal,
    grossProfit: Math.round((salesTotal - inventoryCost) * 100) / 100,
  };
}

export interface AverageOrderSummary {
  avgOrderValue: number;
  avgProfitPerOrder: number;
}

/** Average Order Report — Average Order Value = Total Sales / Number of POS
 * Orders; Average Profit Per Order = Gross Profit / Number of POS Orders.
 * Caller must pass POS-only orders (e.g. reports/page.tsx's `rangeOrders`,
 * already excluding Talabat/Waste/Voided via posOrders()). */
export function averageOrderSummary(
  orders: Order[],
  products: Product[],
  inventoryItems: InventoryItem[]
): AverageOrderSummary {
  const count = orders.length;
  if (count === 0) return { avgOrderValue: 0, avgProfitPerOrder: 0 };
  const { salesTotal, grossProfit } = inventoryConsumptionSummary(orders, products, inventoryItems);
  return {
    avgOrderValue: Math.round((salesTotal / count) * 100) / 100,
    avgProfitPerOrder: Math.round((grossProfit / count) * 100) / 100,
  };
}

export function todayOrders(orders: Order[]): Order[] {
  return completedOrders(orders).filter((o) => isSameDay(o.createdAt));
}

export function ordersInRange(orders: Order[], days: number): Order[] {
  const cutoff = startOfDay(daysAgo(days - 1));
  return completedOrders(orders).filter((o) => new Date(o.createdAt) >= cutoff);
}

/** Generalized version of ordersInRange for the named/custom filter set
 * (today/yesterday/week/month/all/custom) shared by Orders and Reports. */
export function ordersInDateRange(orders: Order[], range: DateRange | null): Order[] {
  const list = completedOrders(orders);
  if (!range) return list;
  return list.filter((o) => {
    const t = new Date(o.createdAt);
    return t >= range.from && t <= range.to;
  });
}

export function expensesInDateRange(expenses: Expense[], range: DateRange | null): Expense[] {
  if (!range) return expenses;
  return expenses.filter((e) => {
    const t = new Date(e.createdAt);
    return t >= range.from && t <= range.to;
  });
}

export function sumTotal(orders: Order[]): number {
  return Math.round(orders.reduce((sum, o) => sum + o.total, 0) * 100) / 100;
}

export function sumExpenses(expenses: Expense[], days?: number): number {
  const list = days
    ? expenses.filter((e) => new Date(e.createdAt) >= startOfDay(daysAgo(days - 1)))
    : expenses;
  return Math.round(list.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
}

export function last7DaysSeries(orders: Order[], locale: "en" | "ar" = "en") {
  const days: { label: string; total: number; date: Date }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgo(i);
    const dayOrders = completedOrders(orders).filter((o) => isSameDay(o.createdAt, d));
    days.push({
      label: d.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { weekday: "short" }),
      total: sumTotal(dayOrders),
      date: d,
    });
  }
  return days;
}

export function last30DaysSeries(orders: Order[], locale: "en" | "ar" = "en") {
  const days: { label: string; total: number; date: Date }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i);
    const dayOrders = completedOrders(orders).filter((o) => isSameDay(o.createdAt, d));
    days.push({
      label: d.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short" }),
      total: sumTotal(dayOrders),
      date: d,
    });
  }
  return days;
}

/** Day-bucketed bar series for an arbitrary date range (used by Reports'
 * filter set instead of the fixed 7/30-day series above). "All" has no lower
 * bound, so it's capped to the last 60 days for chart purposes — an
 * unbounded bar-per-day chart isn't useful once a shop has months of history. */
export function seriesForRange(orders: Order[], range: DateRange | null, locale: "en" | "ar" = "en") {
  const to = range?.to ?? new Date();
  const from = range?.from ?? startOfDay(daysAgo(59));
  const days: { label: string; total: number; date: Date }[] = [];
  const cursor = startOfDay(from);
  const maxBars = 62;
  let i = 0;
  while (cursor <= to && i < maxBars) {
    const dayOrders = completedOrders(orders).filter((o) => isSameDay(o.createdAt, cursor));
    days.push({
      label: cursor.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short" }),
      total: sumTotal(dayOrders),
      date: new Date(cursor),
    });
    cursor.setDate(cursor.getDate() + 1);
    i++;
  }
  return days;
}

export function topProducts(orders: Order[], products: Product[], limit = 5, locale: "en" | "ar" = "en") {
  const counts = new Map<string, { qty: number; revenue: number }>();
  completedOrders(orders).forEach((o) => {
    o.lines.forEach((line) => {
      const existing = counts.get(line.productId) ?? { qty: 0, revenue: 0 };
      const lineRevenue = (line.unitPrice + line.modifiers.reduce((s, m) => s + m.priceDelta, 0)) * line.qty;
      counts.set(line.productId, { qty: existing.qty + line.qty, revenue: existing.revenue + lineRevenue });
    });
  });
  return Array.from(counts.entries())
    .map(([productId, stats]) => {
      const product = products.find((p) => p.id === productId);
      return {
        productId,
        name: product ? product.name[locale] || product.name.en : "Unknown",
        image: product?.image ?? "☕",
        ...stats,
      };
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function revenueByCategory(orders: Order[], products: Product[], categories: { id: string; name: { en: string; ar: string } }[], locale: "en" | "ar" = "en") {
  const map = new Map<string, number>();
  completedOrders(orders).forEach((o) => {
    o.lines.forEach((line) => {
      const product = products.find((p) => p.id === line.productId);
      const catId = product?.categoryId ?? "unknown";
      const lineRevenue = (line.unitPrice + line.modifiers.reduce((s, m) => s + m.priceDelta, 0)) * line.qty;
      map.set(catId, (map.get(catId) ?? 0) + lineRevenue);
    });
  });
  return Array.from(map.entries()).map(([catId, revenue]) => {
    const cat = categories.find((c) => c.id === catId);
    return { categoryId: catId, name: cat ? cat.name[locale] || cat.name.en : "Other", revenue: Math.round(revenue * 100) / 100 };
  }).sort((a, b) => b.revenue - a.revenue);
}

/** Cash vs. card/wallet split for a shift's sales — mirrors close_shift's SQL logic
 * (wallet counts toward card, split orders divide by their splitParts).
 * Talabat and Waste are deliberately skipped here too (not just by callers
 * filtering first with posOrders) — external marketplace revenue and
 * discarded product must never be folded into cash or card sales,
 * defense-in-depth against a future caller forgetting to pre-filter. */
export function shiftSalesSplit(orders: Order[]): { cashSales: number; cardSales: number } {
  let cashSales = 0;
  let cardSales = 0;
  completedOrders(orders).forEach((o) => {
    if (isTalabatOrder(o) || isWasteOrder(o)) return;
    if (o.payment.method === "cash") {
      cashSales += o.total;
    } else if (o.payment.method === "split") {
      (o.payment.splitParts ?? []).forEach((part) => {
        if (part.method === "cash") cashSales += part.amount;
        else cardSales += part.amount;
      });
    } else {
      cardSales += o.total;
    }
  });
  return { cashSales: Math.round(cashSales * 100) / 100, cardSales: Math.round(cardSales * 100) / 100 };
}

/** This-month Sales/Purchases/Expenses and the simple cash-flow "gross profit"
 * (Sales - Purchases - Expenses) — not true COGS accounting, per the spec's
 * "keep everything simple" instruction. `sales` is POS-only (excludes
 * Talabat) — this is the "Gross Sales" figure referenced elsewhere
 * (Dashboard's Estimated Gross Profit, Reports' Monthly Summary), and it
 * must keep representing POS sales only. */
export function monthlySummary(orders: Order[], purchases: Purchase[], expenses: Expense[]) {
  const sales = sumTotal(posOrders(orders).filter((o) => isThisMonth(o.createdAt)));
  const purchasesTotal =
    Math.round(purchases.filter((p) => isThisMonth(p.createdAt)).reduce((s, p) => s + p.totalCost, 0) * 100) / 100;
  const expensesTotal = sumExpenses(expenses.filter((e) => isThisMonth(e.createdAt)));
  const grossProfit = Math.round((sales - purchasesTotal - expensesTotal) * 100) / 100;
  return { sales, purchasesTotal, expensesTotal, grossProfit };
}

export function paymentBreakdown(orders: Order[]) {
  const map = new Map<string, { total: number; count: number }>();
  completedOrders(orders).forEach((o) => {
    const existing = map.get(o.payment.method) ?? { total: 0, count: 0 };
    existing.total += o.total;
    existing.count += 1;
    map.set(o.payment.method, existing);
  });
  return Array.from(map.entries()).map(([method, stats]) => ({
    method,
    total: Math.round(stats.total * 100) / 100,
    count: stats.count,
  }));
}
