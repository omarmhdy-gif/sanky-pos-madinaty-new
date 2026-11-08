"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Banknote,
  CreditCard,
  DollarSign,
  Split,
  Trash2,
  Wallet,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { DateFilterBar } from "@/components/shared/DateFilterBar";
import { PaymentBrandMark } from "@/components/shared/PaymentBrandMark";
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
    label: string;
    value: string;
    dot: string;
    surface: string;
    border: string;
    hoverBorder: string;
    hoverShadow: string;
  }
> = {
  brown: {
    label: "group-hover:text-[#704522] dark:group-hover:text-[#d9b58e]",
    value: "text-[#704522] dark:text-[#d9b58e]",
    dot: "bg-[#b99674] dark:bg-[#d9b58e]",
    surface: "from-[#f0deca]/95 dark:from-[#392b20]/65",
    border: "border-[#d2bea6] dark:border-[#4a3727]/80",
    hoverBorder: "hover:border-[#b99674] dark:hover:border-[#8c6848]",
    hoverShadow: "hover:shadow-[0_14px_30px_rgba(112,69,34,0.15)] dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.30)]",
  },

  green: {
    label: "group-hover:text-[#628044] dark:group-hover:text-[#a8c487]",
    value: "text-[#628044] dark:text-[#a8c487]",
    dot: "bg-[#82a460] dark:bg-[#a8c487]",
    surface: "from-[#dfead3]/95 dark:from-[#303a28]/70",
    border: "border-[#c1d2ad] dark:border-[#455438]/80",
    hoverBorder: "hover:border-[#82a460] dark:hover:border-[#6f8d52]",
    hoverShadow: "hover:shadow-[0_14px_30px_rgba(98,128,68,0.15)] dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.30)]",
  },

  orange: {
    label: "group-hover:text-[#b16c08] dark:group-hover:text-[#f0ad55]",
    value: "text-[#b16c08] dark:text-[#f0ad55]",
    dot: "bg-[#dd8711] dark:bg-[#f0ad55]",
    surface: "from-[#ffebc9]/95 dark:from-[#403521]/70",
    border: "border-[#ebd4a9] dark:border-[#5a482a]/80",
    hoverBorder: "hover:border-[#e8b15e] dark:hover:border-[#a9783c]",
    hoverShadow: "hover:shadow-[0_14px_30px_rgba(221,135,17,0.15)] dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.30)]",
  },

  blue: {
    label: "group-hover:text-[#138bc9] dark:group-hover:text-[#65b9e3]",
    value: "text-[#138bc9] dark:text-[#65b9e3]",
    dot: "bg-[#138bc9] dark:bg-[#65b9e3]",
    surface: "from-[#d9edf7]/95 dark:from-[#263943]/70",
    border: "border-[#bfdeed] dark:border-[#3d5662]/80",
    hoverBorder: "hover:border-[#82c5e5] dark:hover:border-[#467d99]",
    hoverShadow: "hover:shadow-[0_14px_30px_rgba(19,139,201,0.15)] dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.30)]",
  },

  olive: {
    label: "group-hover:text-[#668044] dark:group-hover:text-[#adc58a]",
    value: "text-[#668044] dark:text-[#adc58a]",
    dot: "bg-[#839e60] dark:bg-[#adc58a]",
    surface: "from-[#e3ebd2]/95 dark:from-[#303829]/70",
    border: "border-[#cbd9b2] dark:border-[#48533a]/80",
    hoverBorder: "hover:border-[#a9bd82] dark:hover:border-[#718c52]",
    hoverShadow: "hover:shadow-[0_14px_30px_rgba(102,128,68,0.15)] dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.30)]",
  },

  red: {
    label: "group-hover:text-[#c64141] dark:group-hover:text-[#ef8989]",
    value: "text-[#c64141] dark:text-[#ef8989]",
    dot: "bg-[#d84b4b] dark:bg-[#ef8989]",
    surface: "from-[#f8dfdf]/95 dark:from-[#402727]/70",
    border: "border-[#ecc3c3] dark:border-[#583737]/80",
    hoverBorder: "hover:border-[#e6a0a0] dark:hover:border-[#955858]",
    hoverShadow: "hover:shadow-[0_14px_30px_rgba(216,75,75,0.15)] dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.30)]",
  },

  purple: {
    label: "group-hover:text-[#7a49b5] dark:group-hover:text-[#b58bdd]",
    value: "text-[#7a49b5] dark:text-[#b58bdd]",
    dot: "bg-[#7a49b5] dark:bg-[#b58bdd]",
    surface: "from-[#ecdef7]/95 dark:from-[#352b40]/70",
    border: "border-[#d8c3eb] dark:border-[#4f405c]/80",
    hoverBorder: "hover:border-[#b99add] dark:hover:border-[#795d93]",
    hoverShadow: "hover:shadow-[0_14px_30px_rgba(122,73,181,0.15)] dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.30)]",
  },
};

function MetricCard({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: string;
  accent: MetricAccent;
  note?: string;
}) {
  const style = metricStyles[accent];

  return (
    <div
      className={`group relative flex min-h-[144px] flex-col justify-between overflow-hidden rounded-[22px]
        border bg-gradient-to-br ${style.surface} via-card to-card px-5 py-5
        shadow-[0_5px_18px_rgba(76,61,41,0.10)] dark:shadow-[0_3px_14px_hsl(var(--foreground)/0.045)]
        transition-[transform,border-color,box-shadow] duration-200 ease-out
        hover:-translate-y-1 hover:scale-[1.015] ${style.border} ${style.hoverBorder} ${style.hoverShadow}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className={`truncate text-[13px] font-semibold tracking-wide text-[#62584d] transition-colors duration-200 dark:text-muted-foreground ${style.label}`}>
          {label}
        </p>
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white/40 dark:ring-white/[0.06] ${style.dot}`} />
      </div>

      <div className="relative mt-5 min-w-0">
        <p className={`truncate text-[28px] font-bold leading-none tracking-[-0.04em] transition-transform duration-200 group-hover:translate-y-[-1px] ${style.value}`}>
          {value}
        </p>
        {note && (
          <p className="mt-2 truncate text-xs font-medium text-muted-foreground">
            {note}
          </p>
        )}
      </div>
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
                {currentUser?.name.split(" ")[0]}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={t.dashboard.todaySales}
              value={formatMoney(
                rangeTotal,
                settings.currencySymbol
              )}
              accent="brown"
            />

            <MetricCard
              label={t.dashboard.todayOrders}
              value={formatNumber(rangeOrders.length)}
              accent="green"
            />

            <MetricCard
              label={t.dashboard.monthlyPurchases}
              value={formatMoney(
                monthly.purchasesTotal,
                settings.currencySymbol
              )}
              accent="orange"
            />

            <MetricCard
              label={t.dashboard.monthlyExpenses}
              value={formatMoney(
                monthly.expensesTotal,
                settings.currencySymbol
              )}
              accent="blue"
            />

            <MetricCard
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
            />

            <MetricCard
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
              label={t.dashboard.employeesWorking}
              value={formatNumber(workingCount)}
              accent="purple"
              note="Currently working"
            />
          </div>

          {/* SALES TREND */}
          <section className="overflow-hidden rounded-[22px] border border-border/75 bg-card shadow-[0_4px_18px_hsl(var(--foreground)/0.045)]">
            <div className="flex flex-col gap-4 border-b border-border/70 bg-muted/15 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
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
            <section className="overflow-hidden rounded-[22px] border border-border/75 bg-card shadow-[0_4px_18px_hsl(var(--foreground)/0.045)]">
              <div className="border-b border-border/70 bg-muted/15 px-6 py-5">
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
                  label={t.dashboard.externalOrders.replace(
                    "{name}",
                    externalName
                  )}
                  value={formatNumber(talabat.count)}
                  accent="orange"
                />

                <MetricCard
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
            <section className="overflow-hidden rounded-[22px] border border-border/75 bg-card shadow-[0_4px_18px_hsl(var(--foreground)/0.045)]">
              <div className="border-b border-border/70 bg-muted/15 px-6 py-5">
                <div>
                  <h3 className="font-bold tracking-tight text-foreground">
                    {t.dashboard.wasteSection}
                  </h3>

                  <p className="text-xs text-muted-foreground">
                    {locale === "ar" ? "عدد الطلبات التالفة وتكلفتها" : "Recorded waste orders and their value"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
                <MetricCard
                  label={locale === "ar" ? "طلبات الهالك" : "Waste orders"}
                  value={formatNumber(waste.count)}
                  accent="red"
                />
                <MetricCard
                  label={locale === "ar" ? "تكلفة الهالك" : "Waste cost"}
                  value={formatMoney(waste.cost, settings.currencySymbol)}
                  accent="red"
                />
                <MetricCard
                  label={locale === "ar" ? "قيمة المبيعات" : "Sales value"}
                  value={formatMoney(waste.sellingValue, settings.currencySymbol)}
                  accent="red"
                />
              </div>
            </section>
          </div>

          {/* PAYMENT BREAKDOWN */}
          <section className="overflow-hidden rounded-[22px] border border-border/75 bg-card shadow-[0_4px_18px_hsl(var(--foreground)/0.045)]">
            <div className="border-b border-border/70 bg-muted/15 px-6 py-5">
              <h3 className="text-[21px] font-bold tracking-[-0.02em] text-foreground">
                {t.dashboard.paymentBreakdown}
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                {locale === "ar" ? "توزيع المبيعات حسب طريقة الدفع للفترة المحددة" : "Sales by payment method for the selected period"}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
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
                  const paymentBrand = p.method === "cash"
                    ? "cash"
                    : p.method === "card"
                      ? "visa"
                      : isExternalMethod && (/insta\s*pay/i.test(label) || label.includes("انستا"))
                        ? "instapay"
                        : null;
                  const isInstaPay = paymentBrand === "instapay";
                  const methodStyle = isInstaPay
                    ? "border-orange-200/80 bg-orange-50/70 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300"
                    : p.method === "cash"
                      ? "border-emerald-200/80 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : isExternalMethod
                        ? "border-emerald-200/80 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : p.method === "waste"
                      ? "border-rose-200/80 bg-rose-50/70 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300"
                      : p.method === "card"
                        ? "border-blue-200/80 bg-blue-50/70 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300"
                        : p.method === "wallet"
                          ? "border-violet-200/80 bg-violet-50/70 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/30 dark:text-violet-300"
                          : "border-teal-200/80 bg-teal-50/70 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-300";

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
                      className="group flex min-h-[196px] flex-col rounded-[20px] border border-border/75 bg-card p-4 shadow-[0_3px_14px_hsl(var(--foreground)/0.045)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_8px_22px_hsl(var(--foreground)/0.075)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${methodStyle}`}>
                          {paymentBrand
                            ? <PaymentBrandMark brand={paymentBrand} className={paymentBrand === "instapay" ? "h-5 w-10" : "h-7 w-8"} />
                            : <Icon className="h-5 w-5" strokeWidth={2} />}
                        </div>

                        <div
                          className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full ${methodStyle}`}
                          role="img"
                          aria-label={`${locale === "ar" ? "نسبة الدفع" : "Payment share"}: ${pct}%`}
                          title={`${pct}%`}
                        >
                          <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="3.5" />
                            <circle
                              cx="22"
                              cy="22"
                              r="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 18}`}
                              strokeDashoffset={`${2 * Math.PI * 18 * (1 - Math.min(pct, 100) / 100)}`}
                              className="transition-[stroke-dashoffset] duration-500"
                            />
                          </svg>
                          <span className="relative text-[10px] font-bold leading-none">
                            {formatNumber(pct, 0, 1)}%
                          </span>
                        </div>
                      </div>

                      <p className="mt-4 text-sm font-bold text-foreground">
                        {paymentBrand === "instapay" ? "InstaPay" : label}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatNumber(p.count)}{" "}
                        {t.dashboard.paymentBreakdownOrders}
                      </p>

                      <p className="mt-auto pt-3 text-2xl font-bold leading-tight tracking-[-0.035em] text-foreground">
                        {formatMoney(
                          p.total,
                          settings.currencySymbol
                        )}
                      </p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full transition-all ${isInstaPay ? "bg-orange-500" : p.method === "cash" ? "bg-emerald-500" : isExternalMethod ? "bg-emerald-500" : p.method === "waste" ? "bg-rose-500" : p.method === "card" ? "bg-blue-500" : p.method === "wallet" ? "bg-violet-500" : "bg-teal-500"}`} style={{ width: `${Math.max(pct, p.total > 0 ? 2 : 0)}%` }} />
                      </div>
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
