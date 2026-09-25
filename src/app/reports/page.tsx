"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Trash2, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateFilterBar } from "@/components/shared/DateFilterBar";
import { useDataStore } from "@/lib/store/useDataStore";
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

// Lazy-loaded: recharts is a heavy dependency that shouldn't block first
// paint of the summary cards above these charts.
const SalesOverviewChart = dynamic(
  () => import("@/components/reports/SalesOverviewChart").then((m) => m.SalesOverviewChart),
  { ssr: false, loading: () => <div className="h-[280px]" /> }
);
const RevenuePieChart = dynamic(
  () => import("@/components/reports/RevenuePieChart").then((m) => m.RevenuePieChart),
  { ssr: false, loading: () => <div className="h-[260px]" /> }
);

export default function ReportsPage() {
  const { t, locale } = useI18n();
  const orders = useDataStore((s) => s.orders);
  const products = useDataStore((s) => s.products);
  const categories = useDataStore((s) => s.categories);
  const expenses = useDataStore((s) => s.expenses);
  const purchases = useDataStore((s) => s.purchases);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const settings = useDataStore((s) => s.settings);
  const fetchOrdersInRange = useDataStore((s) => s.fetchOrdersInRange);

  const [filter, setFilter] = useState<DateFilterKey>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [topExpanded, setTopExpanded] = useState(false);
  const [productSalesExpanded, setProductSalesExpanded] = useState(false);
  const [wasteExpanded, setWasteExpanded] = useState(false);

  const range = dateRangeForFilter(
    filter,
    customFrom ? new Date(customFrom) : undefined,
    customTo ? new Date(customTo) : undefined
  );

  // fetchAll() no longer preloads any order history (see api.ts's fetchAll
  // doc comment) — this page fetches exactly what it needs instead: the
  // current calendar month always (Monthly Summary below depends on it
  // regardless of the filter), plus whatever date range is currently
  // selected. "All" is an explicit, owner-initiated epoch-to-now fetch —
  // never automatic on login, satisfying "Reports load only when requested."
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

  // Main sales reports/KPIs — deliberately POS-only (excludes Talabat and
  // Waste, which get their own separate summary cards below using the same
  // date range). Product-level stats (Top Products) are the one exception —
  // those include Talabat (since "which products sold" is a product
  // statistic, not a revenue KPI) but still exclude Waste (discarded
  // product was never "sold" — see rangeOrdersAll below).
  const rangeOrders = ordersInDateRange(posOrders(orders), range);
  const rangeOrdersAll = ordersInDateRange(nonWasteOrders(orders), range);
  const revenue = sumTotal(rangeOrders);
  const expensesTotal = Math.round(expensesInDateRange(expenses, range).reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
  const netProfit = Math.round((revenue - expensesTotal) * 100) / 100;

  const chartData = seriesForRange(posOrders(orders), range, locale);
  // Fetched deep enough to cover the whole catalog — "See More" below just
  // reveals more of this same already-computed list, never a new query.
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

  // Monthly Summary — always the current calendar month, independent of the 7/30-day toggle above.
  const monthly = monthlySummary(orders, purchases, expenses);
  const monthOrders = nonWasteOrders(orders).filter((o) => isThisMonth(o.createdAt));
  const monthTopProducts = topProducts(monthOrders, products, 5, locale);
  const lowestStock = [...inventoryItems].sort((a, b) => a.quantity - b.quantity).slice(0, 5);

  const handleExport = () => {
    const rows = [
      ["Order #", "Date", "Items", "Subtotal", "Discount", "Tax", "Total", "Payment", "Cashier", "Status"],
      ...rangeOrders.map((o) => [
        o.orderNumber,
        new Date(o.createdAt).toISOString(),
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
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sanky-pos-report-${filter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              {t.reports.exportCsv}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label={t.reports.revenue} value={formatMoney(revenue, settings.currencySymbol)} positive />
          <SummaryCard label={t.reports.expensesLabel} value={formatMoney(expensesTotal, settings.currencySymbol)} />
          <SummaryCard
            label={t.reports.netProfit}
            value={formatMoney(netProfit, settings.currencySymbol)}
            positive={netProfit >= 0}
          />
          <SummaryCard label={t.orders.title} value={formatNumber(rangeOrders.length)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t.reports.salesOverview}</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesOverviewChart data={chartData} currencySymbol={settings.currencySymbol} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.reports.revenueByCategory}</CardTitle>
            </CardHeader>
            <CardContent>
              {catRevenue.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
              ) : (
                <RevenuePieChart data={catRevenue} currencySymbol={settings.currencySymbol} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.reports.topProducts}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {top.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
              ) : (
                <>
                  {(topExpanded ? top : top.slice(0, 5)).map((p, i) => (
                    <div key={p.productId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                          {i + 1}
                        </span>
                        {isImageUrl(p.image) ? (
                          <img src={p.image} alt="" className="h-7 w-7 rounded-md object-cover" />
                        ) : (
                          <span className="text-lg">{p.image}</span>
                        )}
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{formatNumber(p.qty)} sold</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-primary">
                        {formatMoney(p.revenue, settings.currencySymbol)}
                      </span>
                    </div>
                  ))}
                  <SeeMoreButton total={top.length} expanded={topExpanded} onToggle={() => setTopExpanded((v) => !v)} />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t.reports.paymentBreakdown}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {payments.length === 0 ? (
                <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
              ) : (
                payments.map((p) => (
                  <div key={p.method} className="rounded-xl border border-border p-4">
                    <p className="text-xs capitalize text-muted-foreground">{p.method}</p>
                    <p className="mt-1 text-lg font-bold">{formatMoney(p.total, settings.currencySymbol)}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* The configurable external-marketplace payment method (Talabat by
            default) — completely separate from the POS revenue KPIs above,
            using the same date filter. */}
        <Card className="border-[#FF5A00]/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalIcon className="h-4 w-4 text-[#FF5A00]" />
              {t.reports.externalSummary.replace("{name}", externalName)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard label={t.reports.talabatOrdersCount} value={formatNumber(talabat.count)} />
              <SummaryCard label={t.reports.talabatTotalRevenue} value={formatMoney(talabat.revenue, settings.currencySymbol)} positive />
              <SummaryCard label={t.reports.talabatAverageOrder} value={formatMoney(talabat.avgOrder, settings.currencySymbol)} />
            </div>
          </CardContent>
        </Card>

        {/* Waste is discarded product, not revenue — completely separate
            from the POS revenue KPIs above, using the same date filter. */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              {t.reports.wasteReport}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard label={t.reports.wasteOrdersCount} value={formatNumber(waste.count)} />
              <SummaryCard label={t.reports.wasteCost} value={formatMoney(waste.cost, settings.currencySymbol)} />
              <SummaryCard label={t.reports.wasteSellingValue} value={formatMoney(waste.sellingValue, settings.currencySymbol)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <p className="mb-2 text-sm font-semibold">{t.reports.wasteByProduct}</p>
                <div className="space-y-2">
                  {waste.byProduct.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.common.noResults}</p>
                  ) : (
                    (wasteExpanded ? waste.byProduct : waste.byProduct.slice(0, 5)).map((p) => (
                      <div key={p.productId} className="flex items-center justify-between text-sm">
                        <span>{p.name}</span>
                        <span className="font-medium">{formatNumber(p.qty)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">{t.reports.wasteByReason}</p>
                <div className="space-y-2">
                  {waste.byReason.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.common.noResults}</p>
                  ) : (
                    (wasteExpanded ? waste.byReason : waste.byReason.slice(0, 5)).map((r) => (
                      <div key={r.reason} className="flex items-center justify-between text-sm">
                        <span className="truncate pe-2" title={r.reason}>{r.reason}</span>
                        <span className="font-medium">{formatNumber(r.count)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">{t.reports.wasteByEmployee}</p>
                <div className="space-y-2">
                  {waste.byEmployee.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.common.noResults}</p>
                  ) : (
                    (wasteExpanded ? waste.byEmployee : waste.byEmployee.slice(0, 5)).map((e) => (
                      <div key={e.employeeName} className="flex items-center justify-between text-sm">
                        <span>{e.employeeName}</span>
                        <span className="font-medium">{formatNumber(e.count)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            {(waste.byProduct.length > 5 || waste.byReason.length > 5 || waste.byEmployee.length > 5) && (
              <SeeMoreButton
                total={Math.max(waste.byProduct.length, waste.byReason.length, waste.byEmployee.length)}
                expanded={wasteExpanded}
                onToggle={() => setWasteExpanded((v) => !v)}
              />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.reports.inventoryConsumption}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <SummaryCard label={t.reports.inventoryCostConsumed} value={formatMoney(inventoryConsumption.inventoryCost, settings.currencySymbol)} />
              <SummaryCard label={t.reports.totalSalesToday} value={formatMoney(inventoryConsumption.salesTotal, settings.currencySymbol)} positive />
              <SummaryCard
                label={t.reports.grossProfitToday}
                value={formatMoney(inventoryConsumption.grossProfit, settings.currencySymbol)}
                positive={inventoryConsumption.grossProfit >= 0}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.reports.averageOrderReport}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <SummaryCard label={t.reports.avgOrderValue} value={formatMoney(averageOrder.avgOrderValue, settings.currencySymbol)} positive />
              <SummaryCard
                label={t.reports.avgProfitPerOrder}
                value={formatMoney(averageOrder.avgProfitPerOrder, settings.currencySymbol)}
                positive={averageOrder.avgProfitPerOrder >= 0}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t.reports.dailyProductSales}</CardTitle>
          </CardHeader>
          <CardContent>
            {productSales.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-xs text-muted-foreground">
                      <th className="py-2 text-start font-medium">{t.products.title}</th>
                      <th className="py-2 text-end font-medium">{t.reports.qtySold}</th>
                      <th className="py-2 text-end font-medium">{t.reports.revenue}</th>
                      <th className="py-2 text-end font-medium">{t.reports.costLabel}</th>
                      <th className="py-2 text-end font-medium">{t.reports.profitLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(productSalesExpanded ? productSales : productSales.slice(0, 5)).map((p) => (
                      <tr key={p.productId} className="border-b border-border/50 last:border-0">
                        <td className="py-2">{p.name}</td>
                        <td className="py-2 text-end">{formatNumber(p.qty)}</td>
                        <td className="py-2 text-end">{formatMoney(p.revenue, settings.currencySymbol)}</td>
                        <td className="py-2 text-end">{formatMoney(p.cost, settings.currencySymbol)}</td>
                        <td className={cn("py-2 text-end font-medium", p.profit >= 0 ? "text-success" : "text-destructive")}>
                          {formatMoney(p.profit, settings.currencySymbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <SeeMoreButton
                  total={productSales.length}
                  expanded={productSalesExpanded}
                  onToggle={() => setProductSalesExpanded((v) => !v)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.reports.monthlySummary}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard label={t.reports.revenue} value={formatMoney(monthly.sales, settings.currencySymbol)} positive />
              <SummaryCard
                label={t.purchases.title}
                value={formatMoney(monthly.purchasesTotal, settings.currencySymbol)}
              />
              <SummaryCard
                label={t.reports.expensesLabel}
                value={formatMoney(monthly.expensesTotal, settings.currencySymbol)}
              />
              <SummaryCard
                label={t.reports.grossProfit}
                value={formatMoney(monthly.grossProfit, settings.currencySymbol)}
                positive={monthly.grossProfit >= 0}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">{t.reports.bestSelling}</p>
                <div className="space-y-2">
                  {monthTopProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.common.noResults}</p>
                  ) : (
                    monthTopProducts.map((p, i) => (
                      <div key={p.productId} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          {i + 1}.
                          {isImageUrl(p.image) ? (
                            <img src={p.image} alt="" className="h-4 w-4 rounded object-cover" />
                          ) : (
                            p.image
                          )}
                          {p.name}
                        </span>
                        <span className="font-medium">{formatNumber(p.qty)} sold</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">{t.reports.lowestStock}</p>
                <div className="space-y-2">
                  {lowestStock.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.common.noResults}</p>
                  ) : (
                    lowestStock.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span>{bilingual(item.name, locale)}</span>
                        <span
                          className={cn(
                            "font-medium",
                            stockLevel(item) === "critical" ? "text-destructive" : "text-muted-foreground"
                          )}
                        >
                          {formatNumber(item.quantity, 0, 3)} {item.unit ?? t.inventory.pieceUnit}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", positive === undefined ? "" : positive ? "text-success" : "text-destructive")}>
        {value}
      </p>
    </div>
  );
}

// Shared by every long-list report section (Top Products, Waste's three
// lists, Product Sales) — shows only the first 5 rows until toggled, per
// "Reports page is becoming very long" — never changes what those rows
// actually contain or how they're computed, only how many render at once.
function SeeMoreButton({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  if (total <= 5) return null;
  return (
    <button
      onClick={onToggle}
      className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
    >
      {expanded ? t.common.seeLess : t.common.seeMore}
      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
    </button>
  );
}
