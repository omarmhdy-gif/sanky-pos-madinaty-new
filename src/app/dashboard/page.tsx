"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DollarSign, ShoppingBag, ShoppingBasket, Wallet, PiggyBank, AlertTriangle, Users, Trash2, Banknote, CreditCard, Split } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateFilterBar } from "@/components/shared/DateFilterBar";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, formatNumber } from "@/lib/utils";
import { getExternalPaymentIcon, externalPaymentName } from "@/lib/externalPayment";
import {
  dateRangeForFilter,
  ordersInDateRange,
  posOrders,
  sumTotal,
  seriesForRange,
  monthlySummary,
  talabatSummary,
  wasteSummary,
  paymentBreakdown,
  type DateFilterKey,
} from "@/lib/analytics";
import { stockLevel } from "@/lib/inventory";

const PAYMENT_ICONS: Record<string, typeof Banknote> = { cash: Banknote, card: CreditCard, wallet: Wallet, split: Split };

// Lazy-loaded: recharts is a heavy dependency that shouldn't block first
// paint of the stat cards above it.
const SalesTrendChart = dynamic(
  () => import("@/components/dashboard/SalesTrendChart").then((m) => m.SalesTrendChart),
  { ssr: false, loading: () => <div className="h-[260px]" /> }
);

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const orders = useDataStore((s) => s.orders);
  const products = useDataStore((s) => s.products);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const purchases = useDataStore((s) => s.purchases);
  const expenses = useDataStore((s) => s.expenses);
  const attendance = useDataStore((s) => s.attendance);
  const settings = useDataStore((s) => s.settings);
  const currentUser = useAuthStore((s) => s.currentUser);
  const fetchOrdersInRange = useDataStore((s) => s.fetchOrdersInRange);

  const [filter, setFilter] = useState<DateFilterKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = dateRangeForFilter(
    filter,
    customFrom ? new Date(customFrom) : undefined,
    customTo ? new Date(customTo) : undefined
  );

  // fetchAll() no longer preloads any order history (see api.ts's fetchAll
  // doc comment) — this page fetches exactly what its own stat cards/chart
  // need instead: the current calendar month always (monthlySummary below
  // depends on it regardless of the filter), plus whatever date range is
  // currently selected. "All" is an explicit, owner-initiated epoch-to-now
  // fetch — never automatic on login.
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

  // POS revenue/orders — deliberately excludes Talabat (external
  // marketplace revenue, tracked in its own separate cards below).
  const rangeOrders = ordersInDateRange(posOrders(orders), range);
  const rangeTotal = sumTotal(rangeOrders);
  const chartData = seriesForRange(posOrders(orders), range, locale);
  const lowStockCount = inventoryItems.filter((i) => stockLevel(i) !== "good").length;
  const monthly = monthlySummary(orders, purchases, expenses);
  const workingCount = attendance.filter((a) => !a.checkOutAt).length;
  const talabat = talabatSummary(orders, range);
  const waste = wasteSummary(orders, products, inventoryItems, range, locale);
  // Every payment method together (unlike rangeOrders above, deliberately
  // NOT filtered to POS-only) — this widget is meant to show the full
  // picture including the external-marketplace method and Waste, per the
  // requested "Cash / Card / Split / Talabat / Waste" breakdown.
  const paymentSummary = paymentBreakdown(ordersInDateRange(orders, range));
  const paymentSummaryTotal = sumTotal(ordersInDateRange(orders, range));
  const ExternalIcon = getExternalPaymentIcon(settings.externalPaymentIcon);
  const externalName = bilingual(externalPaymentName(settings), locale);

  return (
    <AppShell title={t.dashboard.title}>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">
            {t.dashboard.welcome}, {currentUser?.name.split(" ")[0]} 👋
          </h2>
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
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <StatCard
            icon={DollarSign}
            label={t.dashboard.todaySales}
            value={formatMoney(rangeTotal, settings.currencySymbol)}
            accent="primary"
          />
          <StatCard
            icon={ShoppingBag}
            label={t.dashboard.todayOrders}
            value={formatNumber(rangeOrders.length)}
            accent="success"
          />
          <StatCard
            icon={ShoppingBasket}
            label={t.dashboard.monthlyPurchases}
            value={formatMoney(monthly.purchasesTotal, settings.currencySymbol)}
            accent="amber"
          />
          <StatCard
            icon={Wallet}
            label={t.dashboard.monthlyExpenses}
            value={formatMoney(monthly.expensesTotal, settings.currencySymbol)}
            accent="sky"
          />
          <StatCard
            icon={PiggyBank}
            label={t.dashboard.estimatedGrossProfit}
            value={formatMoney(monthly.grossProfit, settings.currencySymbol)}
            accent={monthly.grossProfit >= 0 ? "success" : "primary"}
          />
          <StatCard
            icon={AlertTriangle}
            label={t.dashboard.lowStock}
            value={formatNumber(lowStockCount)}
            accent={lowStockCount > 0 ? "amber" : "success"}
          />
          <StatCard
            icon={Users}
            label={t.dashboard.employeesWorking}
            value={formatNumber(workingCount)}
            accent="sky"
          />
        </div>

        {/* The configurable external-marketplace payment method (Talabat by
            default), tracked completely separately from POS sales above —
            its own section, never mixed into the main stat grid or the
            Sales Trend chart. */}
        <Card className="border-[#FF5A00]/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalIcon className="h-4 w-4 text-[#FF5A00]" />
              {t.dashboard.externalSection.replace("{name}", externalName)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatCard icon={ShoppingBag} label={t.dashboard.externalOrders.replace("{name}", externalName)} value={formatNumber(talabat.count)} accent="amber" />
            <StatCard
              icon={DollarSign}
              label={t.dashboard.externalRevenue.replace("{name}", externalName)}
              value={formatMoney(talabat.revenue, settings.currencySymbol)}
              accent="amber"
            />
          </CardContent>
        </Card>

        {/* Waste is discarded product, not revenue — its own section, never
            mixed into the main stat grid or the Sales Trend chart. */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              {t.dashboard.wasteSection}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 sm:gap-4">
            <StatCard icon={ShoppingBag} label={t.dashboard.wasteCount} value={formatNumber(waste.count)} accent="primary" />
            <StatCard icon={DollarSign} label={t.dashboard.wasteCost} value={formatMoney(waste.cost, settings.currencySymbol)} accent="primary" />
            <StatCard
              icon={DollarSign}
              label={t.dashboard.wasteSellingValue}
              value={formatMoney(waste.sellingValue, settings.currencySymbol)}
              accent="primary"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.paymentBreakdown}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {paymentSummary.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
            ) : (
              paymentSummary.map((p) => {
                const Icon =
                  p.method === "talabat" ? ExternalIcon : p.method === "waste" ? Trash2 : PAYMENT_ICONS[p.method] ?? DollarSign;
                const label =
                  p.method === "talabat"
                    ? externalName
                    : p.method === "waste"
                    ? t.pos.waste
                    : p.method === "cash"
                    ? t.pos.cash
                    : p.method === "card"
                    ? t.pos.card
                    : p.method === "wallet"
                    ? t.pos.wallet
                    : p.method === "split"
                    ? t.pos.split
                    : p.method;
                const pct = paymentSummaryTotal > 0 ? Math.round((p.total / paymentSummaryTotal) * 1000) / 10 : 0;
                return (
                  <div key={p.method} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(p.count)} {t.dashboard.paymentBreakdownOrders}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="text-sm font-bold text-primary">{formatMoney(p.total, settings.currencySymbol)}</p>
                      <p className="text-xs text-muted-foreground">{pct}%</p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.salesTrend}</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={chartData} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
