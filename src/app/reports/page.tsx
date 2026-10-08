"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  Download,
  Trash2,
  ChevronDown,
  FileText,
  Users,
  Ban,
  Tag,
  Gift,
  Package,
  WalletCards,
  RefreshCw,
  ClipboardCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateFilterBar } from "@/components/shared/DateFilterBar";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { getExternalPaymentIcon, externalPaymentName } from "@/lib/externalPayment";
import { formatMoney, formatNumber, cn, isImageUrl } from "@/lib/utils";
import {
  dateRangeForFilter,
  ordersInDateRange,
  expensesInDateRange,
  posOrders,
  nonWasteOrders,
  sumTotal,
  seriesForRange,
  topProducts,
  revenueByCategory,
  paymentBreakdown,
  monthlySummary,
  talabatSummary,
  wasteSummary,
  productSalesReport,
  inventoryConsumptionSummary,
  averageOrderSummary,
  isThisMonth,
  type DateFilterKey,
} from "@/lib/analytics";
import { stockLevel } from "@/lib/inventory";
import { supabase } from "@/lib/supabase/client";

const SalesOverviewChart = dynamic(
  () => import("@/components/reports/SalesOverviewChart").then((m) => m.SalesOverviewChart),
  { ssr: false, loading: () => <div className="h-[280px]" /> }
);

const RevenuePieChart = dynamic(
  () => import("@/components/reports/RevenuePieChart").then((m) => m.RevenuePieChart),
  { ssr: false, loading: () => <div className="h-[260px]" /> }
);

function downloadCsv(filename: string, rows: unknown[][]) {
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function dateLabel(date: string) {
  return new Date(date).toLocaleString();
}

function ReportExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Download className="h-3.5 w-3.5" />
      Export
    </Button>
  );
}

export default function ReportsPage() {
  const { t, locale } = useI18n();
  const orders = useDataStore((s) => s.orders);
  const products = useDataStore((s) => s.products);
  const categories = useDataStore((s) => s.categories);
  const expenses = useDataStore((s) => s.expenses);
  const purchases = useDataStore((s) => s.purchases);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const inventoryQualityChecks = useDataStore((s) => s.inventoryQualityChecks);
  const stockMovements = useDataStore((s) => s.stockMovements);
  const shifts = useDataStore((s) => s.shifts);
  const attendance = useDataStore((s) => s.attendance);
  const settings = useDataStore((s) => s.settings);
  const fetchOrdersInRange = useDataStore((s) => s.fetchOrdersInRange);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);

  const [filter, setFilter] = useState<DateFilterKey>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [topExpanded, setTopExpanded] = useState(false);
  const [productSalesExpanded, setProductSalesExpanded] = useState(false);
  const [wasteExpanded, setWasteExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [loyaltyRows, setLoyaltyRows] = useState<any[]>([]);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);

  const range = dateRangeForFilter(
    filter,
    customFrom ? new Date(customFrom) : undefined,
    customTo ? new Date(customTo) : undefined
  );

  useEffect(() => {
    const now = new Date();
    fetchOrdersInRange(new Date(now.getFullYear(), now.getMonth(), 1), now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (filter === "all") {
      fetchOrdersInRange(new Date(0), new Date());
    } else if (range) {
      fetchOrdersInRange(range.from, range.to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, customFrom, customTo]);

  useEffect(() => {
    if (!currentBranchId || !range) return;
    let cancelled = false;
    setLoyaltyLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("loyalty_transactions")
        .select("*")
        .eq("branch_id", currentBranchId)
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false });

      if (!cancelled) {
        setLoyaltyRows(error ? [] : data ?? []);
        setLoyaltyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentBranchId, range?.from?.getTime(), range?.to?.getTime()]);

  const rangeOrders = ordersInDateRange(posOrders(orders), range);
  const rangeOrdersAll = ordersInDateRange(nonWasteOrders(orders), range);
  const revenue = sumTotal(rangeOrders);
  const expensesTotal = Math.round(expensesInDateRange(expenses, range).reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
  const netProfit = Math.round((revenue - expensesTotal) * 100) / 100;
  const chartData = seriesForRange(posOrders(orders), range, locale);
  const top = topProducts(rangeOrdersAll, products, 100, locale);
  const catRevenue = revenueByCategory(rangeOrders, products, categories, locale);
  const payments = paymentBreakdown(rangeOrders);
  const talabat = talabatSummary(orders, range);
  const waste = wasteSummary(orders, products, inventoryItems, range, locale);
  const productSales = productSalesReport(rangeOrders, products, inventoryItems, locale);
  const inventoryConsumption = inventoryConsumptionSummary(rangeOrders, products, inventoryItems);
  const averageOrder = averageOrderSummary(rangeOrders, products, inventoryItems);
  const externalIconKey = settings.externalPaymentIcon;
  const ExternalIcon = getExternalPaymentIcon(externalIconKey);
  const externalName = bilingual(externalPaymentName(settings), locale);
  const monthly = monthlySummary(orders, purchases, expenses);
  const monthOrders = nonWasteOrders(orders).filter((o) => isThisMonth(o.createdAt));
  const monthTopProducts = topProducts(monthOrders, products, 5, locale);
  const lowestStock = [...inventoryItems].sort((a, b) => a.quantity - b.quantity).slice(0, 5);

  const voidedOrders = ordersInDateRange(orders.filter((o) => o.status === "voided" || o.status === "refunded"), range);
  const discountedOrders = rangeOrders.filter((o) => o.discountAmount > 0);
  const promoOrders = rangeOrders.filter((o) => o.status === "completed" && Boolean(o.promoCode && o.customerId));
  const promoCodeSummary = Array.from(
    promoOrders.reduce((map, order) => {
      const code = order.promoCode!;
      const row = map.get(code) ?? { code, uses: 0, customers: new Set<string>(), discount: 0 };
      row.uses += 1;
      row.customers.add(order.customerId!);
      row.discount += order.discountAmount;
      map.set(code, row);
      return map;
    }, new Map<string, { code: string; uses: number; customers: Set<string>; discount: number }>()).values()
  ).sort((a, b) => b.uses - a.uses);
  const promoDiscountTotal = promoOrders.reduce((sum, order) => sum + order.discountAmount, 0);
  const promoCustomerCount = new Set(promoOrders.map((order) => order.customerId)).size;

  const userSales = useMemo(() => {
    const map = new Map<string, { cashierId: string; cashierName: string; orders: number; revenue: number; discounts: number; tax: number }>();
    for (const order of rangeOrders) {
      const key = order.cashierId || order.cashierName || "unknown";
      const current = map.get(key) ?? { cashierId: order.cashierId, cashierName: order.cashierName || "Unknown", orders: 0, revenue: 0, discounts: 0, tax: 0 };
      current.orders += 1;
      current.revenue += order.total;
      current.discounts += order.discountAmount;
      current.tax += order.taxAmount;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [rangeOrders]);

  const discountSummary = useMemo(() => ({
    orders: discountedOrders.length,
    amount: discountedOrders.reduce((sum, o) => sum + o.discountAmount, 0),
    average: discountedOrders.length ? discountedOrders.reduce((sum, o) => sum + o.discountAmount, 0) / discountedOrders.length : 0,
  }), [discountedOrders]);

  const loyaltySummary = useMemo(() => {
    const earned = loyaltyRows.filter((r) => r.type === "earn");
    const redeemed = loyaltyRows.filter((r) => r.type === "redeem");
    const pointsEarned = earned.reduce((sum, r) => sum + Number(r.points || 0), 0);
    const pointsRedeemed = Math.abs(redeemed.reduce((sum, r) => sum + Number(r.points || 0), 0));
    const rewardValue = redeemed.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const customers = new Set(loyaltyRows.map((r) => r.customer_id).filter(Boolean));
    return { earned, redeemed, pointsEarned, pointsRedeemed, rewardValue, customers: customers.size };
  }, [loyaltyRows]);

  const movementRows = useMemo(() => {
    return stockMovements
      .filter((m) => !range || (new Date(m.createdAt) >= range.from && new Date(m.createdAt) <= range.to))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [stockMovements, range]);

  const movementSummary = useMemo(() => {
    const result = new Map<string, { item: string; received: number; sold: number; waste: number; count: number }>();
    for (const m of movementRows) {
      const key = m.inventoryItemId;
      const item = m.itemName ? bilingual(m.itemName, locale) : key;
      const row = result.get(key) ?? { item, received: 0, sold: 0, waste: 0, count: 0 };
      row.count += 1;
      if (m.reason === "manual_receive") row.received += Math.max(0, m.quantityDelta);
      if (m.reason === "sale") row.sold += Math.abs(m.quantityDelta);
      if (m.reason === "waste") row.waste += Math.abs(m.quantityDelta);
      result.set(key, row);
    }
    return Array.from(result.values()).sort((a, b) => b.count - a.count);
  }, [movementRows, locale]);

  const reconciliation = useMemo(() => {
    const cash = rangeOrders.filter((o) => o.payment.method === "cash").reduce((s, o) => s + o.total, 0);
    const card = rangeOrders.filter((o) => o.payment.method === "card").reduce((s, o) => s + o.total, 0);
    const wallet = rangeOrders.filter((o) => o.payment.method === "wallet").reduce((s, o) => s + o.total, 0);
    const split = rangeOrders.filter((o) => o.payment.method === "split").reduce((s, o) => s + o.total, 0);
    const shiftRows = shifts.filter((s) => !range || (new Date(s.startedAt) >= range.from && new Date(s.startedAt) <= range.to));
    const actual = shiftRows.reduce((s, sh) => s + Number(sh.actualCash ?? 0), 0);
    const expected = shiftRows.reduce((s, sh) => s + Number(sh.expectedCash ?? 0), 0);
    const difference = shiftRows.reduce((s, sh) => s + Number(sh.difference ?? 0), 0);
    return { cash, card, wallet, split, shiftRows, actual, expected, difference };
  }, [rangeOrders, shifts, range]);

  const attendanceRows = attendance.filter((record) =>
    !range || (new Date(record.checkInAt) >= range.from && new Date(record.checkInAt) <= range.to)
  );
  const attendanceMinutes = attendanceRows.reduce((sum, record) => {
    const end = record.checkOutAt ? new Date(record.checkOutAt).getTime() : Date.now();
    return sum + Math.max(0, Math.round((end - new Date(record.checkInAt).getTime()) / 60000));
  }, 0);
  const qualityCheckRows = inventoryQualityChecks.filter((record) =>
    !range || (new Date(record.checkedAt) >= range.from && new Date(record.checkedAt) <= range.to)
  );
  const qualityGoodCount = qualityCheckRows.filter((record) => record.result === "good").length;
  const qualityAttentionCount = qualityCheckRows.length - qualityGoodCount;

  const salesRows = [
    ["Order #", "Date", "Items", "Subtotal", "Discount", "Tax", "Total", "Payment", "Cashier", "Status"],
    ...rangeOrders.map((o) => [
      o.orderNumber,
      o.createdAt,
      o.lines.reduce((s, l) => s + l.qty, 0),
      o.subtotal,
      o.discountAmount,
      o.taxAmount,
      o.total,
      o.payment.method,
      o.cashierName,
      o.status,
    ]),
  ];

  const exportSales = () => downloadCsv(`sanky-sales-${filter}.csv`, salesRows);
  const exportProducts = () => downloadCsv(`sanky-product-sales-${filter}.csv`, [
    ["Product", "Qty Sold", "Revenue", "Cost", "Profit"],
    ...productSales.map((p) => [p.name, p.qty, p.revenue, p.cost, p.profit]),
  ]);
  const exportPayments = () => downloadCsv(`sanky-payment-methods-${filter}.csv`, [
    ["Payment Method", "Total"],
    ...payments.map((p) => [p.method, p.total]),
  ]);
  const exportUsers = () => downloadCsv(`sanky-user-sales-${filter}.csv`, [
    ["User", "Orders", "Revenue", "Discounts", "Tax"],
    ...userSales.map((u) => [u.cashierName, u.orders, u.revenue, u.discounts, u.tax]),
  ]);
  const exportVoids = () => downloadCsv(`sanky-void-cancelled-${filter}.csv`, [
    ["Order #", "Date", "Status", "Total", "Payment", "Cashier"],
    ...voidedOrders.map((o) => [o.orderNumber, o.createdAt, o.status, o.total, o.payment.method, o.cashierName]),
  ]);
  const exportDiscounts = () => downloadCsv(`sanky-discounts-${filter}.csv`, [
    ["Order #", "Date", "Cashier", "Discount %", "Discount Amount", "Subtotal", "Total"],
    ...discountedOrders.map((o) => [o.orderNumber, o.createdAt, o.cashierName, o.discountPercent ?? "", o.discountAmount, o.subtotal, o.total]),
  ]);
  const exportPromoUsage = () => downloadCsv(`sanky-promo-code-usage-${filter}.csv`, [
    ["Order #", "Date", "Promo Code", "Customer", "Customer ID", "Cashier", "Discount Amount"],
    ...promoOrders.map((order) => [order.orderNumber, order.createdAt, order.promoCode, order.customerName ?? "", order.customerId, order.cashierName, order.discountAmount]),
  ]);
  const exportLoyalty = () => downloadCsv(`sanky-loyalty-${filter}.csv`, [
    ["Date", "Type", "Customer ID", "Order ID", "Points", "Amount", "Description"],
    ...loyaltyRows.map((r) => [r.created_at, r.type, r.customer_id, r.order_id, r.points, r.amount, r.description]),
  ]);
  const exportInventory = () => downloadCsv(`sanky-inventory-movement-${filter}.csv`, [
    ["Date", "Item", "Reason", "Quantity Delta", "Employee", "Order ID"],
    ...movementRows.map((m) => [m.createdAt, m.itemName ? bilingual(m.itemName, locale) : m.inventoryItemId, m.reason, m.quantityDelta, m.employeeName, m.orderId ?? ""]),
  ]);
  const exportCash = () => downloadCsv(`sanky-cash-reconciliation-${filter}.csv`, [
    ["Shift", "Cashier", "Started", "Closed", "Opening Cash", "Expected Cash", "Actual Cash", "Difference", "Status"],
    ...reconciliation.shiftRows.map((s) => [s.id, s.cashierName, s.startedAt, s.closedAt ?? "", s.openingCash, s.expectedCash ?? "", s.actualCash ?? "", s.difference ?? "", s.status]),
  ]);
  const exportAttendance = () => downloadCsv(`sanky-attendance-${filter}.csv`, [
    ["Employee", "Check In", "Check Out", "Worked Minutes", "Status"],
    ...attendanceRows.map((record) => {
      const end = record.checkOutAt ? new Date(record.checkOutAt).getTime() : Date.now();
      const minutes = Math.max(0, Math.round((end - new Date(record.checkInAt).getTime()) / 60000));
      return [record.employeeName, record.checkInAt, record.checkOutAt ?? "", minutes, record.checkOutAt ? "Completed" : "Open"];
    }),
  ]);
  const exportInventoryQuality = () => downloadCsv(`sanky-inventory-quality-${filter}.csv`, [
    ["Date", "Inventory Item", "Result", "Note", "Cashier"],
    ...qualityCheckRows.map((record) => [record.checkedAt, bilingual(record.inventoryItemName, locale), record.result, record.note ?? "", record.checkedByName]),
  ]);

  const exportAll = () => {
    exportSales();
    setTimeout(exportProducts, 150);
  };

  return (
    <AppShell title={t.reports.title}>
      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t.reports.subtitle}</p>
          <div className="flex flex-wrap items-center gap-2">
            <DateFilterBar
              filter={filter}
              onFilterChange={setFilter}
              customFrom={customFrom}
              customTo={customTo}
              onCustomChange={(from, to) => {
                setCustomFrom(from);
                setCustomTo(to);
              }}
            />
            <Button variant="outline" size="sm" onClick={exportAll}>
              <Download className="h-3.5 w-3.5" />
              Export Reports
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label={t.reports.revenue} value={formatMoney(revenue, settings.currencySymbol)} positive />
          <SummaryCard label={t.reports.expensesLabel} value={formatMoney(expensesTotal, settings.currencySymbol)} />
          <SummaryCard label={t.reports.netProfit} value={formatMoney(netProfit, settings.currencySymbol)} positive={netProfit >= 0} />
          <SummaryCard label={t.orders.title} value={formatNumber(rangeOrders.length)} />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t.reports.salesOverview}</CardTitle>
            <ReportExportButton onClick={exportSales} />
          </CardHeader>
          <CardContent><SalesOverviewChart data={chartData} currencySymbol={settings.currencySymbol} /></CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t.reports.revenueByCategory}</CardTitle>
              <ReportExportButton onClick={() => downloadCsv(`sanky-category-sales-${filter}.csv`, [["Category", "Revenue"], ...catRevenue.map((x) => [x.name, x.revenue])])} />
            </CardHeader>
            <CardContent>{catRevenue.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t.common.noResults}</p> : <RevenuePieChart data={catRevenue} currencySymbol={settings.currencySymbol} />}</CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t.reports.topProducts}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {top.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t.common.noResults}</p> : <>
                {(topExpanded ? top : top.slice(0, 5)).map((p, i) => (
                  <div key={p.productId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                      {isImageUrl(p.image) ? <img src={p.image} alt="" className="h-7 w-7 rounded-md object-cover" /> : <span className="text-lg">{p.image}</span>}
                      <div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{formatNumber(p.qty)} sold</p></div>
                    </div>
                    <span className="text-sm font-bold text-primary">{formatMoney(p.revenue, settings.currencySymbol)}</span>
                  </div>
                ))}
                <SeeMoreButton total={top.length} expanded={topExpanded} onToggle={() => setTopExpanded((v) => !v)} />
              </>}
            </CardContent>
          </Card>
        </div>

        <ReportSection title="Sales Report" icon={<FileText className="h-4 w-4" />} exportAction={exportSales}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SummaryCard label="Orders" value={formatNumber(rangeOrders.length)} />
            <SummaryCard label="Gross Sales" value={formatMoney(rangeOrders.reduce((s, o) => s + o.subtotal, 0), settings.currencySymbol)} positive />
            <SummaryCard label="Discounts" value={formatMoney(rangeOrders.reduce((s, o) => s + o.discountAmount, 0), settings.currencySymbol)} />
            <SummaryCard label="Tax" value={formatMoney(rangeOrders.reduce((s, o) => s + o.taxAmount, 0), settings.currencySymbol)} />
            <SummaryCard label="Net Sales" value={formatMoney(revenue, settings.currencySymbol)} positive />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 text-start">Order</th><th className="py-2 text-start">Date</th><th className="py-2 text-end">Subtotal</th><th className="py-2 text-end">Discount</th><th className="py-2 text-end">Tax</th><th className="py-2 text-end">Total</th><th className="py-2 text-start">Payment</th></tr></thead><tbody>
              {(detailsExpanded ? rangeOrders : rangeOrders.slice(0, 10)).map((o) => <tr key={o.id} className="border-b border-border/50"><td className="py-2">#{o.orderNumber}</td><td className="py-2">{dateLabel(o.createdAt)}</td><td className="py-2 text-end">{formatMoney(o.subtotal, settings.currencySymbol)}</td><td className="py-2 text-end">{formatMoney(o.discountAmount, settings.currencySymbol)}</td><td className="py-2 text-end">{formatMoney(o.taxAmount, settings.currencySymbol)}</td><td className="py-2 text-end font-medium">{formatMoney(o.total, settings.currencySymbol)}</td><td className="py-2 capitalize">{o.payment.method}</td></tr>)}
            </tbody></table>
          </div>
          {rangeOrders.length > 10 && <SeeMoreButton total={rangeOrders.length} expanded={detailsExpanded} onToggle={() => setDetailsExpanded((v) => !v)} />}
        </ReportSection>

        <ReportSection title="Payment Method Report" icon={<WalletCards className="h-4 w-4" />} exportAction={exportPayments}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {payments.map((p) => <div key={p.method} className="rounded-xl border border-border p-4"><p className="text-xs capitalize text-muted-foreground">{p.method}</p><p className="mt-1 text-lg font-bold">{formatMoney(p.total, settings.currencySymbol)}</p></div>)}
          </div>
        </ReportSection>

        <ReportSection title="Barista / User Sales Report" icon={<Users className="h-4 w-4" />} exportAction={exportUsers}>
          <SimpleTable headers={["User", "Orders", "Revenue", "Discounts", "Tax"]} rows={userSales.map((u) => [u.cashierName, formatNumber(u.orders), formatMoney(u.revenue, settings.currencySymbol), formatMoney(u.discounts, settings.currencySymbol), formatMoney(u.tax, settings.currencySymbol)])} />
        </ReportSection>

        <ReportSection title="Void / Cancelled Orders Report" icon={<Ban className="h-4 w-4" />} exportAction={exportVoids}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><SummaryCard label="Voided / Refunded" value={formatNumber(voidedOrders.length)} /><SummaryCard label="Value" value={formatMoney(voidedOrders.reduce((s, o) => s + o.total, 0), settings.currencySymbol)} /></div>
          <div className="mt-4"><SimpleTable headers={["Order", "Date", "Status", "Total", "Payment", "Cashier"]} rows={voidedOrders.map((o) => [`#${o.orderNumber}`, dateLabel(o.createdAt), o.status, formatMoney(o.total, settings.currencySymbol), o.payment.method, o.cashierName])} /></div>
        </ReportSection>

        <ReportSection title="Discounts Report" icon={<Tag className="h-4 w-4" />} exportAction={exportDiscounts}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><SummaryCard label="Discounted Orders" value={formatNumber(discountSummary.orders)} /><SummaryCard label="Discount Value" value={formatMoney(discountSummary.amount, settings.currencySymbol)} /><SummaryCard label="Average Discount" value={formatMoney(discountSummary.average, settings.currencySymbol)} /></div>
          <div className="mt-4"><SimpleTable headers={["Order", "Date", "Cashier", "Discount %", "Amount", "Total"]} rows={discountedOrders.map((o) => [`#${o.orderNumber}`, dateLabel(o.createdAt), o.cashierName, o.discountPercent != null ? `${o.discountPercent}%` : "Fixed", formatMoney(o.discountAmount, settings.currencySymbol), formatMoney(o.total, settings.currencySymbol)])} /></div>
        </ReportSection>

        <ReportSection title={t.reports.promoCodeUsage} icon={<Tag className="h-4 w-4" />} exportAction={exportPromoUsage}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryCard label={t.reports.promoCodeUses} value={formatNumber(promoOrders.length)} />
            <SummaryCard label={t.reports.promoCodeCustomers} value={formatNumber(promoCustomerCount)} />
            <SummaryCard label={t.reports.promoCodeDiscountTotal} value={formatMoney(promoDiscountTotal, settings.currencySymbol)} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold">{t.reports.promoCodeSummary}</p>
            <SimpleTable headers={[t.reports.promoCode, t.reports.promoCodeUses, t.reports.promoCodeCustomers, t.reports.promoCodeDiscountTotal]} rows={promoCodeSummary.map((row) => [row.code, formatNumber(row.uses), formatNumber(row.customers.size), formatMoney(row.discount, settings.currencySymbol)])} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold">{t.reports.promoCodeTransactions}</p>
            <SimpleTable headers={["Order", "Date", t.reports.promoCode, t.reports.promoCustomer, "Cashier", t.reports.promoCodeDiscountTotal]} rows={promoOrders.map((order) => [`#${order.orderNumber}`, dateLabel(order.createdAt), order.promoCode ?? "", order.customerName || order.customerId || "", order.cashierName, formatMoney(order.discountAmount, settings.currencySymbol)])} />
          </div>
        </ReportSection>

        <ReportSection title="Loyalty Report" icon={<Gift className="h-4 w-4" />} exportAction={exportLoyalty}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SummaryCard label="Customers" value={formatNumber(loyaltySummary.customers)} />
            <SummaryCard label="Points Earned" value={formatNumber(loyaltySummary.pointsEarned)} positive />
            <SummaryCard label="Points Redeemed" value={formatNumber(loyaltySummary.pointsRedeemed)} />
            <SummaryCard label="Rewards Value" value={formatMoney(loyaltySummary.rewardValue, settings.currencySymbol)} />
            <SummaryCard label="Transactions" value={formatNumber(loyaltyRows.length)} />
          </div>
          <div className="mt-4">{loyaltyLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading loyalty data...</p> : <SimpleTable headers={["Date", "Type", "Customer", "Points", "Amount", "Description"]} rows={loyaltyRows.map((r) => [dateLabel(r.created_at), r.type, r.customer_id, formatNumber(Number(r.points || 0)), formatMoney(Number(r.amount || 0), settings.currencySymbol), r.description || ""])} />}</div>
        </ReportSection>

        <ReportSection title="Inventory Movement Report" icon={<Package className="h-4 w-4" />} exportAction={exportInventory}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><SummaryCard label="Movements" value={formatNumber(movementRows.length)} /><SummaryCard label="Received" value={formatNumber(movementRows.filter((m) => m.reason === "manual_receive").reduce((s, m) => s + Math.max(0, m.quantityDelta), 0))} positive /><SummaryCard label="Sold" value={formatNumber(movementRows.filter((m) => m.reason === "sale").reduce((s, m) => s + Math.abs(m.quantityDelta), 0))} /><SummaryCard label="Waste" value={formatNumber(movementRows.filter((m) => m.reason === "waste").reduce((s, m) => s + Math.abs(m.quantityDelta), 0))} /></div>
          <div className="mt-4"><SimpleTable headers={["Item", "Movements", "Received", "Sold", "Waste"]} rows={movementSummary.map((m) => [m.item, formatNumber(m.count), formatNumber(m.received), formatNumber(m.sold), formatNumber(m.waste)])} /></div>
        </ReportSection>

        <ReportSection title={locale === "ar" ? "تقرير العهدات" : "Cash Till Report"} icon={<RefreshCw className="h-4 w-4" />} exportAction={exportCash}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SummaryCard label="Cash Sales" value={formatMoney(reconciliation.cash, settings.currencySymbol)} positive />
            <SummaryCard label="Card Sales" value={formatMoney(reconciliation.card, settings.currencySymbol)} />
            <SummaryCard label="Expected Cash" value={formatMoney(reconciliation.expected, settings.currencySymbol)} />
            <SummaryCard label="Actual Cash" value={formatMoney(reconciliation.actual, settings.currencySymbol)} />
            <SummaryCard label="Difference" value={formatMoney(reconciliation.difference, settings.currencySymbol)} positive={reconciliation.difference >= 0} />
          </div>
          <div className="mt-4"><SimpleTable headers={["Cashier", "Started", "Closed", "Opening", "Expected", "Actual", "Difference", "Status"]} rows={reconciliation.shiftRows.map((s) => {
            const difference = Number(s.difference ?? 0);
            const balance = s.status === "open" ? (locale === "ar" ? "مفتوحة" : "Open") : difference === 0 ? t.shifts.balanced : difference > 0 ? t.shifts.over : t.shifts.short;
            return [s.cashierName, dateLabel(s.startedAt), s.closedAt ? dateLabel(s.closedAt) : "—", formatMoney(s.openingCash, settings.currencySymbol), formatMoney(s.expectedCash ?? 0, settings.currencySymbol), formatMoney(s.actualCash ?? 0, settings.currencySymbol), formatMoney(difference, settings.currencySymbol), balance];
          })} /></div>
        </ReportSection>

        <ReportSection title={locale === "ar" ? "تقرير الحضور والانصراف" : "Attendance Report"} icon={<Users className="h-4 w-4" />} exportAction={exportAttendance}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryCard label={locale === "ar" ? "عدد سجلات الحضور" : "Attendance Records"} value={formatNumber(attendanceRows.length)} />
            <SummaryCard label={locale === "ar" ? "ساعات العمل" : "Hours Worked"} value={formatNumber(Math.round((attendanceMinutes / 60) * 100) / 100)} positive />
            <SummaryCard label={locale === "ar" ? "لم يسجلوا انصرافًا" : "Still Clocked In"} value={formatNumber(attendanceRows.filter((record) => !record.checkOutAt).length)} />
          </div>
          <div className="mt-4"><SimpleTable
            headers={locale === "ar" ? ["المستخدم", "وقت الحضور", "وقت الانصراف", "مدة العمل", "الحالة"] : ["User", "Check In", "Check Out", "Worked", "Status"]}
            rows={attendanceRows.map((record) => {
              const end = record.checkOutAt ? new Date(record.checkOutAt).getTime() : Date.now();
              const minutes = Math.max(0, Math.round((end - new Date(record.checkInAt).getTime()) / 60000));
              const worked = `${Math.floor(minutes / 60)} ${locale === "ar" ? "س" : "h"} ${minutes % 60} ${locale === "ar" ? "د" : "m"}`;
              return [record.employeeName, dateLabel(record.checkInAt), record.checkOutAt ? dateLabel(record.checkOutAt) : "—", worked, record.checkOutAt ? (locale === "ar" ? "انصرف" : "Clocked Out") : (locale === "ar" ? "موجود" : "Clocked In")];
            })}
          /></div>
        </ReportSection>

        <ReportSection title={locale === "ar" ? "تقرير فحص مواد المخزون" : "Inventory Quality Checks"} icon={<ClipboardCheck className="h-4 w-4" />} exportAction={exportInventoryQuality}>
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label={locale === "ar" ? "إجمالي الفحوصات" : "Total checks"} value={formatNumber(qualityCheckRows.length)} />
            <SummaryCard label={locale === "ar" ? "مواد جيدة" : "Good"} value={formatNumber(qualityGoodCount)} positive />
            <SummaryCard label={locale === "ar" ? "تحتاج متابعة" : "Needs attention"} value={formatNumber(qualityAttentionCount)} />
          </div>
          <div className="mt-4"><SimpleTable
            headers={locale === "ar" ? ["المادة", "الحالة", "الملاحظة", "الكاشير", "وقت الفحص"] : ["Item", "Result", "Note", "Cashier", "Checked at"]}
            rows={qualityCheckRows.map((record) => [bilingual(record.inventoryItemName, locale), record.result === "good" ? (locale === "ar" ? "جيدة" : "Good") : (locale === "ar" ? "تحتاج متابعة" : "Needs attention"), record.note || "—", record.checkedByName, dateLabel(record.checkedAt)])}
          /></div>
        </ReportSection>

        <ReportSection title="Product Sales Report" icon={<FileText className="h-4 w-4" />} exportAction={exportProducts}>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 text-start">Product</th><th className="py-2 text-end">Qty</th><th className="py-2 text-end">Revenue</th><th className="py-2 text-end">Cost</th><th className="py-2 text-end">Profit</th></tr></thead><tbody>{(productSalesExpanded ? productSales : productSales.slice(0, 10)).map((p) => <tr key={p.productId} className="border-b border-border/50"><td className="py-2">{p.name}</td><td className="py-2 text-end">{formatNumber(p.qty)}</td><td className="py-2 text-end">{formatMoney(p.revenue, settings.currencySymbol)}</td><td className="py-2 text-end">{formatMoney(p.cost, settings.currencySymbol)}</td><td className={cn("py-2 text-end font-medium", p.profit >= 0 ? "text-success" : "text-destructive")}>{formatMoney(p.profit, settings.currencySymbol)}</td></tr>)}</tbody></table></div>
          <SeeMoreButton total={productSales.length} expanded={productSalesExpanded} onToggle={() => setProductSalesExpanded((v) => !v)} />
        </ReportSection>

        <Card className="border-[#FF5A00]/30">
          <CardHeader><CardTitle className="flex items-center gap-2"><ExternalIcon className="h-4 w-4 text-[#FF5A00]" />{t.reports.externalSummary.replace("{name}", externalName)}</CardTitle></CardHeader>
          <CardContent><div className="grid grid-cols-3 gap-3"><SummaryCard label={t.reports.talabatOrdersCount} value={formatNumber(talabat.count)} /><SummaryCard label={t.reports.talabatTotalRevenue} value={formatMoney(talabat.revenue, settings.currencySymbol)} positive /><SummaryCard label={t.reports.talabatAverageOrder} value={formatMoney(talabat.avgOrder, settings.currencySymbol)} /></div></CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-destructive" />{t.reports.wasteReport}</CardTitle></CardHeader>
          <CardContent className="space-y-5"><div className="grid grid-cols-3 gap-3"><SummaryCard label={t.reports.wasteOrdersCount} value={formatNumber(waste.count)} /><SummaryCard label={t.reports.wasteCost} value={formatMoney(waste.cost, settings.currencySymbol)} /><SummaryCard label={t.reports.wasteSellingValue} value={formatMoney(waste.sellingValue, settings.currencySymbol)} /></div>
            <div className="grid gap-4 lg:grid-cols-3">{[
              [t.reports.wasteByProduct, waste.byProduct, "productId", "name", "qty"],
              [t.reports.wasteByReason, waste.byReason, "reason", "reason", "count"],
              [t.reports.wasteByEmployee, waste.byEmployee, "employeeName", "employeeName", "count"],
            ].map(([title, rows, key, labelKey, valueKey]: any) => <div key={title}><p className="mb-2 text-sm font-semibold">{title}</p><div className="space-y-2">{rows.length === 0 ? <p className="text-sm text-muted-foreground">{t.common.noResults}</p> : (wasteExpanded ? rows : rows.slice(0, 5)).map((r: any) => <div key={r[key]} className="flex items-center justify-between text-sm"><span className="truncate pe-2">{r[labelKey]}</span><span className="font-medium">{formatNumber(r[valueKey])}</span></div>)}</div></div>)}</div>
            {(waste.byProduct.length > 5 || waste.byReason.length > 5 || waste.byEmployee.length > 5) && <SeeMoreButton total={Math.max(waste.byProduct.length, waste.byReason.length, waste.byEmployee.length)} expanded={wasteExpanded} onToggle={() => setWasteExpanded((v) => !v)} />}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>{t.reports.inventoryConsumption}</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3"><SummaryCard label={t.reports.inventoryCostConsumed} value={formatMoney(inventoryConsumption.inventoryCost, settings.currencySymbol)} /><SummaryCard label={t.reports.totalSalesToday} value={formatMoney(inventoryConsumption.salesTotal, settings.currencySymbol)} positive /><SummaryCard label={t.reports.grossProfitToday} value={formatMoney(inventoryConsumption.grossProfit, settings.currencySymbol)} positive={inventoryConsumption.grossProfit >= 0} /></CardContent></Card>
          <Card><CardHeader><CardTitle>{t.reports.averageOrderReport}</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3"><SummaryCard label={t.reports.avgOrderValue} value={formatMoney(averageOrder.avgOrderValue, settings.currencySymbol)} positive /><SummaryCard label={t.reports.avgProfitPerOrder} value={formatMoney(averageOrder.avgProfitPerOrder, settings.currencySymbol)} positive={averageOrder.avgProfitPerOrder >= 0} /></CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle>{t.reports.monthlySummary}</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><SummaryCard label={t.reports.revenue} value={formatMoney(monthly.sales, settings.currencySymbol)} positive /><SummaryCard label={t.purchases.title} value={formatMoney(monthly.purchasesTotal, settings.currencySymbol)} /><SummaryCard label={t.reports.expensesLabel} value={formatMoney(monthly.expensesTotal, settings.currencySymbol)} /><SummaryCard label={t.reports.grossProfit} value={formatMoney(monthly.grossProfit, settings.currencySymbol)} positive={monthly.grossProfit >= 0} /></div><div className="grid gap-4 lg:grid-cols-2"><div><p className="mb-2 text-sm font-semibold">{t.reports.bestSelling}</p><div className="space-y-2">{monthTopProducts.map((p, i) => <div key={p.productId} className="flex items-center justify-between text-sm"><span>{i + 1}. {p.name}</span><span className="font-medium">{formatNumber(p.qty)} sold</span></div>)}</div></div><div><p className="mb-2 text-sm font-semibold">{t.reports.lowestStock}</p><div className="space-y-2">{lowestStock.map((item) => <div key={item.id} className="flex items-center justify-between text-sm"><span>{bilingual(item.name, locale)}</span><span className={cn("font-medium", stockLevel(item) === "critical" ? "text-destructive" : "text-muted-foreground")}>{formatNumber(item.quantity, 0, 3)} {item.unit ?? t.inventory.pieceUnit}</span></div>)}</div></div></div></CardContent></Card>
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-1 text-xl font-bold", positive === undefined ? "" : positive ? "text-success" : "text-destructive")}>{value}</p></div>;
}

function ReportSection({ title, icon, exportAction, children }: { title: string; icon: ReactNode; exportAction: () => void; children: ReactNode }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle><ReportExportButton onClick={exportAction} /></CardHeader><CardContent>{children}</CardContent></Card>;
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: unknown[][] }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No results</p>;
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground">{headers.map((h) => <th key={h} className="px-2 py-2 text-start font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-b border-border/50 last:border-0">{row.map((cell, j) => <td key={j} className="px-2 py-2">{String(cell ?? "")}</td>)}</tr>)}</tbody></table></div>;
}

function SeeMoreButton({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  if (total <= 5) return null;
  return <button onClick={onToggle} className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-muted-foreground hover:bg-accent">{expanded ? t.common.seeLess : t.common.seeMore}<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} /></button>;
}
