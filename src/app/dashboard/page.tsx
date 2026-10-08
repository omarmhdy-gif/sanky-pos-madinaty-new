"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  DollarSign,
  ClipboardList,
  ShoppingBasket,
  WalletCards,
  PiggyBank,
  TriangleAlert,
  UsersRound,
  Trash2,
  Banknote,
  CreditCard,
  Wallet,
  Split,
  MoreHorizontal,
  ArrowUpRight,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { DateFilterBar } from "@/components/shared/DateFilterBar";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, formatNumber } from "@/lib/utils";
import {
  getExternalPaymentIcon,
  externalPaymentName,
  externalPaymentMethodById,
} from "@/lib/externalPayment";

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

const PAYMENT_ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  wallet: Wallet,
  split: Split,
};

const SalesTrendChart = dynamic(
  () =>
    import("@/components/dashboard/SalesTrendChart").then(
      (m) => m.SalesTrendChart
    ),
  {
    ssr: false,
    loading: () => <div className="h-[300px] w-full" />,
  }
);

type MetricAccent =
  | "brown"
  | "green"
  | "orange"
  | "blue"
  | "olive"
  | "red"
  | "purple";

const metricStyles: Record<
  MetricAccent,
  {
    icon: string;
    iconColor: string;
    glow: string;
    border: string;
    shadow: string;
    bottom: string;
  }
> = {
  brown: {
    icon: "bg-[#eadfd3] dark:bg-[#3b3027]",
    iconColor: "text-[#704522] dark:text-[#d9b58e]",
    glow: "bg-[#704522]/10 dark:bg-[#d9b58e]/10",
    border: "hover:border-[#b99674] dark:hover:border-[#8c6848]",
    shadow:
      "hover:shadow-[0_14px_32px_rgba(112,69,34,0.14)] dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.30)]",
    bottom: "bg-[#704522] dark:bg-[#d9b58e]",
  },

  green: {
    icon: "bg-[#e3ecd9] dark:bg-[#303a28]",
    iconColor: "text-[#628044] dark:text-[#a8c487]",
    glow: "bg-[#628044]/10 dark:bg-[#a8c487]/10",
    border: "hover:border-[#9dbb80] dark:hover:border-[#6f8d52]",
    shadow:
      "hover:shadow-[0_14px_32px_rgba(98,128,68,0.13)] dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.30)]",
    bottom: "bg-[#628044] dark:bg-[#a8c487]",
  },

  orange: {
    icon: "bg-[#fff0d8] dark:bg-[#403521]",
    iconColor: "text-[#dd8711] dark:text-[#f0ad55]",
    glow: "bg-[#dd8711]/10 dark:bg-[#f0ad55]/10",
    border: "hover:border-[#e8b15e] dark:hover:border-[#a9783c]",
    shadow:
      "hover:shadow-[0_14px_32px_rgba(221,135,17,0.13)] dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.30)]",
    bottom: "bg-[#dd8711] dark:bg-[#f0ad55]",
  },

  blue: {
    icon: "bg-[#dff1fa] dark:bg-[#263943]",
    iconColor: "text-[#138bc9] dark:text-[#65b9e3]",
    glow: "bg-[#138bc9]/10 dark:bg-[#65b9e3]/10",
    border: "hover:border-[#82c5e5] dark:hover:border-[#467d99]",
    shadow:
      "hover:shadow-[0_14px_32px_rgba(19,139,201,0.13)] dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.30)]",
    bottom: "bg-[#138bc9] dark:bg-[#65b9e3]",
  },

  olive: {
    icon: "bg-[#e6ecd9] dark:bg-[#303829]",
    iconColor: "text-[#668044] dark:text-[#adc58a]",
    glow: "bg-[#668044]/10 dark:bg-[#adc58a]/10",
    border: "hover:border-[#a9bd82] dark:hover:border-[#718c52]",
    shadow:
      "hover:shadow-[0_14px_32px_rgba(102,128,68,0.13)] dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.30)]",
    bottom: "bg-[#668044] dark:bg-[#adc58a]",
  },

  red: {
    icon: "bg-[#fde3e3] dark:bg-[#402727]",
    iconColor: "text-[#d84b4b] dark:text-[#ef8989]",
    glow: "bg-[#d84b4b]/10 dark:bg-[#ef8989]/10",
    border: "hover:border-[#e6a0a0] dark:hover:border-[#955858]",
    shadow:
      "hover:shadow-[0_14px_32px_rgba(216,75,75,0.13)] dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.30)]",
    bottom: "bg-[#d84b4b] dark:bg-[#ef8989]",
  },

  purple: {
    icon: "bg-[#eee4fa] dark:bg-[#352b40]",
    iconColor: "text-[#7a49b5] dark:text-[#b58bdd]",
    glow: "bg-[#7a49b5]/10 dark:bg-[#b58bdd]/10",
    border: "hover:border-[#b99add] dark:hover:border-[#795d93]",
    shadow:
      "hover:shadow-[0_14px_32px_rgba(122,73,181,0.13)] dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.30)]",
    bottom: "bg-[#7a49b5] dark:bg-[#b58bdd]",
  },
};

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
  note,
  className = "",
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  accent: MetricAccent;
  note?: string;
  className?: string;
}) {
  const style = metricStyles[accent];

  return (
    <div
      className={`group relative overflow-hidden rounded-[22px]
        border border-border
        bg-card p-5
        shadow-[0_3px_18px_hsl(var(--foreground)/0.055)]
        transition-all duration-200 ease-out
        hover:-translate-y-1
        ${style.border}
        ${style.shadow}
        ${className}`}
    >
      {/* Hover glow */}
      <div
        className={`pointer-events-none absolute -bottom-10 -right-8 h-28 w-28 rounded-full blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${style.glow}`}
      />

      <div className="relative flex items-start gap-4">
        {/* Icon */}
        <div
          className={`flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[19px]
            transition-all duration-200 ease-out
            group-hover:scale-105
            group-hover:-translate-y-0.5
            ${style.icon}`}
        >
          <Icon
            className={`h-[34px] w-[34px] transition-transform duration-200 group-hover:scale-110 ${style.iconColor}`}
            strokeWidth={1.9}
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-medium text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
              {label}
            </p>

            <MoreHorizontal className="h-5 w-5 shrink-0 text-muted-foreground/60 transition-all duration-200 group-hover:scale-110 group-hover:text-foreground" />
          </div>

          <p className="mt-1.5 truncate text-[30px] font-bold leading-none tracking-[-0.035em] text-foreground transition-transform duration-200 group-hover:translate-x-0.5">
            {value}
          </p>

          {note && (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-success transition-transform duration-200 group-hover:translate-x-0.5">
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              {note}
            </p>
          )}
        </div>
      </div>

      {/* Bottom hover accent */}
      <div
        className={`absolute bottom-0 left-7 right-7 h-[3px] origin-center scale-x-0 rounded-full transition-transform duration-300 group-hover:scale-x-100 ${style.bottom}`}
      />
    </div>
  );
}

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
  const fetchOrdersInRange = useDataStore(
    (s) => s.fetchOrdersInRange
  );

  const [filter, setFilter] =
    useState<DateFilterKey>("today");

  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = dateRangeForFilter(
    filter,
    customFrom ? new Date(customFrom) : undefined,
    customTo ? new Date(customTo) : undefined
  );

  useEffect(() => {
    const now = new Date();

    fetchOrdersInRange(
      new Date(now.getFullYear(), now.getMonth(), 1),
      now
    );

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

  const rangeOrders = ordersInDateRange(
    posOrders(orders),
    range
  );

  const rangeTotal = sumTotal(rangeOrders);

  const chartData = seriesForRange(
    posOrders(orders),
    range,
    locale
  );

  const lowStockCount = inventoryItems.filter(
    (i) => stockLevel(i) !== "good"
  ).length;

  const monthly = monthlySummary(
    orders,
    purchases,
    expenses
  );

  const workingCount = attendance.filter(
    (a) => !a.checkOutAt
  ).length;

  const talabat = talabatSummary(orders, range);

  const waste = wasteSummary(
    orders,
    products,
    inventoryItems,
    range,
    locale
  );

  const paymentSummary = paymentBreakdown(
    ordersInDateRange(orders, range)
  );

  const paymentSummaryTotal = sumTotal(
    ordersInDateRange(orders, range)
  );

  const ExternalIcon = getExternalPaymentIcon(
    settings.externalPaymentIcon
  );

  const externalName = locale === "ar" ? "المدفوعات الخارجية" : "External payments";

  return (
    <AppShell title={t.dashboard.title}>
      <div className="min-h-full bg-[#f8f5ef] dark:bg-background">
        <div className="space-y-7 p-5 sm:p-7 lg:p-8">

          {/* HEADER */}
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-[28px] font-bold tracking-[-0.035em] text-[#241b15] dark:text-foreground sm:text-[32px]">
                {t.dashboard.welcome},{" "}
                {currentUser?.name.split(" ")[0]} 👋
              </h2>

              <p className="mt-1 text-sm text-[#81766b] dark:text-muted-foreground">
                Here&apos;s what&apos;s happening with your business today.
              </p>
            </div>

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

          {/* MAIN METRICS */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              icon={DollarSign}
              label={t.dashboard.todaySales}
              value={formatMoney(
                rangeTotal,
                settings.currencySymbol
              )}
              accent="brown"
              note="0% from yesterday"
            />

            <MetricCard
              icon={ClipboardList}
              label={t.dashboard.todayOrders}
              value={formatNumber(rangeOrders.length)}
              accent="green"
              note="0% from yesterday"
            />

            <MetricCard
              icon={ShoppingBasket}
              label={t.dashboard.monthlyPurchases}
              value={formatMoney(
                monthly.purchasesTotal,
                settings.currencySymbol
              )}
              accent="orange"
              note="0% from last month"
            />

            <MetricCard
              icon={WalletCards}
              label={t.dashboard.monthlyExpenses}
              value={formatMoney(
                monthly.expensesTotal,
                settings.currencySymbol
              )}
              accent="blue"
              note="0% from last month"
            />

            <MetricCard
              icon={PiggyBank}
              label={t.dashboard.estimatedGrossProfit}
              value={formatMoney(
                monthly.grossProfit,
                settings.currencySymbol
              )}
              accent={
                monthly.grossProfit >= 0
                  ? "olive"
                  : "brown"
              }
              note="0% from yesterday"
            />

            <MetricCard
              icon={TriangleAlert}
              label={t.dashboard.lowStock}
              value={formatNumber(lowStockCount)}
              accent={
                lowStockCount > 0 ? "red" : "olive"
              }
              note={
                lowStockCount > 0
                  ? "Needs attention"
                  : "All stock looks good"
              }
            />

            <MetricCard
              icon={UsersRound}
              label={t.dashboard.employeesWorking}
              value={formatNumber(workingCount)}
              accent="purple"
              note="Currently working"
              className="lg:col-start-2"
            />
          </div>

          {/* SALES TREND */}
          <section className="overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_4px_20px_hsl(var(--foreground)/0.055)]">
            <div className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[22px] font-bold tracking-[-0.025em] text-foreground">
                  {t.dashboard.salesTrend}
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Total sales over the selected period
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground">
                  Daily
                </div>

                <div className="rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground">
                  Sales
                </div>
              </div>
            </div>

            <div className="px-4 pb-5 pt-4 sm:px-6">
              <SalesTrendChart data={chartData} />
            </div>
          </section>

          {/* SECONDARY INFORMATION */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

            {/* EXTERNAL MARKETPLACE */}
            <section className="overflow-hidden rounded-[24px] border border-[#f0dcca] dark:border-[#4a3727] bg-card shadow-[0_4px_18px_hsl(var(--foreground)/0.045)]">
              <div className="flex items-center gap-4 border-b border-border px-6 py-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0df] dark:bg-[#403024]">
                  <ExternalIcon className="h-6 w-6 text-[#f05a16] dark:text-[#ff8a55]" />
                </div>

                <div>
                  <h3 className="font-bold text-foreground">
                    {t.dashboard.externalSection.replace(
                      "{name}",
                      externalName
                    )}
                  </h3>

                  <p className="text-xs text-muted-foreground">
                    Marketplace performance
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                <MetricCard
                  icon={ClipboardList}
                  label={t.dashboard.externalOrders.replace(
                    "{name}",
                    externalName
                  )}
                  value={formatNumber(talabat.count)}
                  accent="orange"
                />

                <MetricCard
                  icon={DollarSign}
                  label={t.dashboard.externalRevenue.replace(
                    "{name}",
                    externalName
                  )}
                  value={formatMoney(
                    talabat.revenue,
                    settings.currencySymbol
                  )}
                  accent="orange"
                />
              </div>
            </section>

            {/* WASTE */}
            <section className="overflow-hidden rounded-[24px] border border-[#eadede] dark:border-[#472e2e] bg-card shadow-[0_4px_18px_hsl(var(--foreground)/0.045)]">
              <div className="flex items-center gap-4 border-b border-border px-6 py-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fde5e5] dark:bg-[#402727]">
                  <Trash2 className="h-6 w-6 text-[#d84b4b] dark:text-[#ef8989]" />
                </div>

                <div>
                  <h3 className="font-bold text-foreground">
                    {t.dashboard.wasteSection}
                  </h3>

                  <p className="text-xs text-muted-foreground">
                    Discarded products and value
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
                <MetricCard
                  icon={ClipboardList}
                  label={t.dashboard.wasteCount}
                  value={formatNumber(waste.count)}
                  accent="red"
                />

                <MetricCard
                  icon={DollarSign}
                  label={t.dashboard.wasteCost}
                  value={formatMoney(
                    waste.cost,
                    settings.currencySymbol
                  )}
                  accent="red"
                />

                <MetricCard
                  icon={DollarSign}
                  label={t.dashboard.wasteSellingValue}
                  value={formatMoney(
                    waste.sellingValue,
                    settings.currencySymbol
                  )}
                  accent="red"
                />
              </div>
            </section>
          </div>

          {/* PAYMENT BREAKDOWN */}
          <section className="overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_4px_20px_hsl(var(--foreground)/0.05)]">
            <div className="px-6 py-5">
              <h3 className="text-[21px] font-bold tracking-[-0.02em] text-foreground">
                {t.dashboard.paymentBreakdown}
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Payment methods for the selected period
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
              {paymentSummary.length === 0 ? (
                <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                  {t.common.noResults}
                </p>
              ) : (
                paymentSummary.map((p) => {
                  const configuredExternal = externalPaymentMethodById(settings, p.externalMethodId);
                  const isExternalMethod = p.method === "talabat" || p.method.startsWith("external:");
                  const Icon =
                    isExternalMethod
                      ? getExternalPaymentIcon(configuredExternal?.icon ?? settings.externalPaymentIcon)
                      : p.method === "waste"
                        ? Trash2
                        : PAYMENT_ICONS[p.method] ??
                          DollarSign;

                  const label =
                    isExternalMethod
                      ? bilingual(p.externalMethodName ?? configuredExternal?.name ?? externalPaymentName(settings), locale)
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

                  const pct =
                    paymentSummaryTotal > 0
                      ? Math.round(
                          (p.total /
                            paymentSummaryTotal) *
                            1000
                        ) / 10
                      : 0;

                  return (
                    <div
                      key={p.method}
                      className="rounded-[18px] border border-border bg-muted/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-[0_8px_20px_hsl(var(--foreground)/0.08)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon
                            className="h-5 w-5"
                            strokeWidth={2}
                          />
                        </div>

                        <span className="text-xs font-semibold text-muted-foreground">
                          {pct}%
                        </span>
                      </div>

                      <p className="mt-4 text-sm font-semibold text-foreground">
                        {label}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatNumber(p.count)}{" "}
                        {t.dashboard.paymentBreakdownOrders}
                      </p>

                      <p className="mt-3 text-[20px] font-bold tracking-tight text-primary">
                        {formatMoney(
                          p.total,
                          settings.currencySymbol
                        )}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
