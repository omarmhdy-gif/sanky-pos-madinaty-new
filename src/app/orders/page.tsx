"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt, Banknote, CreditCard, Wallet, Search, Trash2, Smartphone, PackageCheck, Boxes, FileText, Download, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrderDetailsDialog } from "@/components/orders/OrderDetailsDialog";
import { DateFilterBar } from "@/components/shared/DateFilterBar";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, formatNumber, formatDateTime, cn } from "@/lib/utils";
import { recipeCost } from "@/lib/inventory";
import { dateRangeForFilter, isTalabatOrder, type DateFilterKey } from "@/lib/analytics";
import { hasPermission } from "@/lib/permissions";
import { externalPaymentLabel, externalPaymentMethodById, externalPaymentMethods } from "@/lib/externalPayment";
import type { Order, PaymentMethod } from "@/lib/types";

type OrdersPaymentFilter = Exclude<PaymentMethod, "split" | "wallet"> | "all" | `external:${string}`;
const PAGE_SIZE = 50;

function calculateOrderCost(order: Order, products: ReturnType<typeof useDataStore.getState>["products"], inventoryItems: ReturnType<typeof useDataStore.getState>["inventoryItems"]) {
  return Math.round(order.lines.reduce((sum, line) => {
    const product = products.find((item) => item.id === line.productId);
    return sum + (product ? recipeCost(product, inventoryItems) * line.qty : 0);
  }, 0) * 100) / 100;
}

function filterOrderList(options: {
  source: Order[];
  range: { from: Date; to: Date } | null;
  paymentFilter: OrdersPaymentFilter;
  search: string;
  minimumCostPercent: string;
  canSeeTotals: boolean;
  products: ReturnType<typeof useDataStore.getState>["products"];
  inventoryItems: ReturnType<typeof useDataStore.getState>["inventoryItems"];
}) {
  const { source, range, paymentFilter, search, minimumCostPercent, canSeeTotals, products, inventoryItems } = options;
  let list = [...source].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (range) {
    list = list.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return createdAt >= range.from && createdAt <= range.to;
    });
  }

  if (paymentFilter !== "all") {
    list = list.filter((order) => {
      if (paymentFilter.startsWith("external:")) {
        return order.payment.externalMethodId === paymentFilter.slice("external:".length);
      }
      if (paymentFilter === "talabat") return isTalabatOrder(order);
      if (paymentFilter === "cash" || paymentFilter === "card") {
        return order.payment.method === paymentFilter || (
          order.payment.method === "split" &&
          (order.payment.splitParts ?? []).some((part) => part.method === paymentFilter)
        );
      }
      return order.payment.method === paymentFilter;
    });
  }

  const query = search.trim().toLowerCase();
  if (query) {
    list = list.filter((order) =>
      String(order.orderNumber).includes(query) ||
      order.lines.some((line) => line.name.en.toLowerCase().includes(query) || line.name.ar.includes(query))
    );
  }

  const costThreshold = minimumCostPercent.trim() ? Number(minimumCostPercent) : null;
  if (canSeeTotals && costThreshold !== null && Number.isFinite(costThreshold)) {
    list = list.filter((order) => order.total > 0 && (calculateOrderCost(order, products, inventoryItems) / order.total) * 100 > costThreshold);
  }
  return list;
}

function downloadOrdersCsv(filename: string, rows: unknown[][]) {
  const csvValue = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    const safeText = typeof value === "string" && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
  };
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function OrdersPage() {
  const { t, locale } = useI18n();
  const orders = useDataStore((s) => s.orders);
  const products = useDataStore((s) => s.products);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const settings = useDataStore((s) => s.settings);
  const fetchOrdersPage = useDataStore((s) => s.fetchOrdersPage);
  const currentUser = useAuthStore((s) => s.currentUser);
  // "Cashiers should not see total sales" — only Reports/Finance access
  // unlocks money figures on this page; order number/date/status/payment
  // method/items always stay visible regardless.
  const canSeeTotals = hasPermission(currentUser, "reports") || hasPermission(currentUser, "finance");
  const paymentIcons: Record<Exclude<PaymentMethod, "split">, typeof Banknote> = { cash: Banknote, card: CreditCard, wallet: Wallet, talabat: CreditCard, waste: Trash2 };
  const configuredExternalMethods = externalPaymentMethods(settings);
  const paymentFilters: OrdersPaymentFilter[] = [
    "all", "cash", "card",
    ...configuredExternalMethods.map((method) => `external:${method.id}` as const),
    "talabat", "waste",
  ];

  const [filter, setFilter] = useState<DateFilterKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<OrdersPaymentFilter>("all");
  const [minimumCostPercent, setMinimumCostPercent] = useState("");
  const [exportingOrders, setExportingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inventoryOrder, setInventoryOrder] = useState<Order | null>(null);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const range = dateRangeForFilter(
    filter,
    customFrom ? new Date(customFrom) : undefined,
    customTo ? new Date(customTo) : undefined
  );

  // fetchAll() no longer preloads any order history (see api.ts's fetchAll
  // doc comment) — this page loads its own data one page at a time instead,
  // scoped to whichever date filter is selected ("all" has no date bound,
  // but is still paginated the same way, never pulled in one shot). Resets
  // to page one whenever the filter/date range changes. The payment-method
  // and text search filters below stay entirely client-side, over whatever
  // pages have been loaded so far — unchanged from before.
  useEffect(() => {
    let cancelled = false;
    setOffset(0);
    setHasMore(true);
    fetchOrdersPage({ from: range?.from, to: range?.to, limit: PAGE_SIZE, offset: 0 }).then((more) => {
      if (cancelled) return;
      setHasMore(more);
      setOffset(PAGE_SIZE);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, customFrom, customTo]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const more = await fetchOrdersPage({ from: range?.from, to: range?.to, limit: PAGE_SIZE, offset });
    setHasMore(more);
    setOffset((o) => o + PAGE_SIZE);
    setLoadingMore(false);
  };

  const filteredOrders = useMemo(
    () => filterOrderList({ source: orders, range, paymentFilter, search, minimumCostPercent, canSeeTotals, products, inventoryItems }),
    [orders, filter, customFrom, customTo, search, paymentFilter, minimumCostPercent, canSeeTotals, products, inventoryItems]
  );

  const handleExportOrders = async () => {
    setExportingOrders(true);
    try {
      let nextOffset = 0;
      let more = true;
      while (more && nextOffset < 100_000) {
        more = await fetchOrdersPage({ from: range?.from, to: range?.to, limit: PAGE_SIZE, offset: nextOffset });
        nextOffset += PAGE_SIZE;
      }
      setOffset(nextOffset);
      setHasMore(more);

      const exportOrders = filterOrderList({
        source: useDataStore.getState().orders,
        range,
        paymentFilter,
        search,
        minimumCostPercent,
        canSeeTotals,
        products,
        inventoryItems,
      });
      const headers = [
        locale === "ar" ? "رقم الطلب" : "Order #",
        locale === "ar" ? "التاريخ والوقت" : "Date and time",
        locale === "ar" ? "الأصناف" : "Items",
        locale === "ar" ? "طريقة الدفع" : "Payment method",
        locale === "ar" ? "الحالة" : "Status",
        locale === "ar" ? "الكاشير" : "Cashier",
        ...(canSeeTotals ? [
          locale === "ar" ? "الإجمالي" : "Total",
          locale === "ar" ? "التكلفة" : "Cost",
          locale === "ar" ? "نسبة التكلفة %" : "Cost %",
          locale === "ar" ? "الخصم" : "Discount",
          locale === "ar" ? "الربح" : "Profit",
        ] : []),
      ];
      const rows: unknown[][] = [headers, ...exportOrders.map((order) => {
        const paymentMethodName = (method: "cash" | "card" | "wallet") =>
          method === "cash" ? t.pos.cash : method === "card" ? t.pos.card : t.pos.wallet;
        const payment = order.payment.method === "split"
          ? (order.payment.splitParts ?? []).map((part) => `${paymentMethodName(part.method)}: ${part.amount}`).join(" | ")
          : order.payment.method === "talabat" && order.payment.externalMethodId
            ? externalPaymentLabel(order.payment, settings, locale)
            : order.payment.method === "talabat"
              ? (locale === "ar" ? "طلب خارجي" : "External order")
              : order.payment.method === "waste"
                ? t.pos.waste
                : paymentMethodName(order.payment.method);
        const base: unknown[] = [
          order.orderNumber,
          new Date(order.createdAt).toLocaleString(locale === "ar" ? "ar-EG" : "en-US"),
          order.lines.map((line) => `${line.name[locale]} × ${line.qty}`).join(" | "),
          payment,
          order.status,
          order.cashierName,
        ];
        if (!canSeeTotals) return base;
        const cost = calculateOrderCost(order, products, inventoryItems);
        return [...base, order.total, cost, order.total > 0 ? Number(((cost / order.total) * 100).toFixed(2)) : 0, order.discountAmount, Number((order.total - cost).toFixed(2))];
      })];
      const dateStamp = new Date().toISOString().slice(0, 10);
      downloadOrdersCsv(`sanky-orders-${filter}-${dateStamp}.csv`, rows);
    } finally {
      setExportingOrders(false);
    }
  };

  const totalRevenue = filteredOrders
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + o.total, 0);
  const completedFilteredOrders = filteredOrders.filter((order) => order.status === "completed");
  const totalCost = Math.round(completedFilteredOrders.reduce(
    (sum, order) => sum + calculateOrderCost(order, products, inventoryItems),
    0
  ) * 100) / 100;
  const totalProfit = Math.round((totalRevenue - totalCost) * 100) / 100;

  const inventoryUsage = useMemo(() => {
    if (!inventoryOrder) return [];
    const usage = new Map<string, { name: string; unit: string; quantity: number; cost: number }>();
    inventoryOrder.lines.forEach((line) => {
      const product = products.find((item) => item.id === line.productId);
      product?.recipe?.forEach((ingredient) => {
        const item = inventoryItems.find((inventoryItem) => inventoryItem.id === ingredient.inventoryItemId);
        const quantity = ingredient.qty * line.qty;
        const existing = usage.get(ingredient.inventoryItemId) ?? {
          name: item ? bilingual(item.name, locale) : t.inventory.unknownItem,
          unit: item?.unit ?? t.inventory.pieceUnit,
          quantity: 0,
          cost: 0,
        };
        existing.quantity += quantity;
        existing.cost += quantity * (item?.lastPurchaseCost ?? 0);
        usage.set(ingredient.inventoryItemId, existing);
      });
    });
    return Array.from(usage.values()).map((item) => ({
      ...item,
      quantity: Math.round(item.quantity * 1000) / 1000,
      cost: Math.round(item.cost * 100) / 100,
    }));
  }, [inventoryOrder, inventoryItems, locale, products, t.inventory.pieceUnit, t.inventory.unknownItem]);

  const handleOpen = (order: Order) => {
    setSelectedOrder(order);
    setDetailsOpen(true);
  };

  return (
    <AppShell title={t.orders.title}>
      <div className="space-y-5 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between lg:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t.orders.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.orders.subtitle}</p>
            </div>
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

        <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 rounded-xl border-border/70 bg-background ps-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.orders.searchPlaceholder}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            {canSeeTotals && (
              <label htmlFor="orders-min-cost-percent" className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span>{t.orders.costPercentFilter}</span>
                <Input
                  id="orders-min-cost-percent"
                  className="h-9 w-24 rounded-lg bg-background text-foreground"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={minimumCostPercent}
                  onChange={(event) => setMinimumCostPercent(event.target.value)}
                  aria-label={t.orders.costPercentFilter}
                />
              </label>
            )}
            <Button type="button" size="sm" variant="outline" className="h-9 gap-2 rounded-lg" onClick={handleExportOrders} disabled={exportingOrders || (filteredOrders.length === 0 && !hasMore)}>
              <Download className="h-4 w-4" />
              {exportingOrders ? t.orders.exportingOrders : t.orders.exportOrders}
            </Button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {paymentFilters.map((m) => (
              <button
                key={m}
                onClick={() => setPaymentFilter(m)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                  paymentFilter === m
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {m === "all"
                  ? t.orders.filterAll
                  : m.startsWith("external:")
                  ? configuredExternalMethods.find((method) => method.id === m.slice("external:".length))?.name[locale] ?? m
                  : m === "talabat"
                  ? (locale === "ar" ? "الطلبات الخارجية" : "External payments")
                  : m === "waste"
                  ? t.pos.waste
                  : m === "cash"
                  ? t.pos.cash
                  : m === "card"
                  ? t.pos.card
                  : m}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/10 via-card to-card p-3 shadow-sm sm:p-4">
          <div className={cn("grid gap-2.5", canSeeTotals ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1")}>
            <div className="min-w-0 rounded-xl bg-background/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-primary">
                <PackageCheck className="h-3.5 w-3.5 shrink-0" />
                <p className="truncate text-[10px] font-medium text-muted-foreground">{t.orders.title}</p>
              </div>
              <p className="mt-1 text-sm font-bold leading-tight">{formatNumber(filteredOrders.length)}</p>
            </div>
            {canSeeTotals && (
              <>
                <div className="min-w-0 rounded-xl bg-background/60 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-primary">
                    <Banknote className="h-3.5 w-3.5 shrink-0" />
                    <p className="truncate text-[10px] font-medium text-muted-foreground">{t.reports.revenue}</p>
                  </div>
                  <p className="mt-1 whitespace-nowrap text-[13px] font-bold leading-tight text-primary sm:text-sm">{formatMoney(totalRevenue, settings.currencySymbol)}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-background/60 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                    <Boxes className="h-3.5 w-3.5 shrink-0" />
                    <p className="truncate text-[10px] font-medium text-muted-foreground">{t.reports.costLabel}</p>
                  </div>
                  <p className="mt-1 whitespace-nowrap text-[13px] font-bold leading-tight sm:text-sm">{formatMoney(totalCost, settings.currencySymbol)}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-background/60 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                    <p className="truncate text-[10px] font-medium text-muted-foreground">{t.reports.profitLabel}</p>
                  </div>
                  <p className={cn("mt-1 whitespace-nowrap text-[13px] font-bold leading-tight sm:text-sm", totalProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-300")}>
                    {formatMoney(totalProfit, settings.currencySymbol)}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <Receipt className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t.orders.noOrders}</p>
          </div>
        ) : (
          <div className="grid gap-3">
              {filteredOrders.map((order) => {
                const splitPaymentParts = order.payment.method === "split" ? order.payment.splitParts ?? [] : [];
                const orderCost = calculateOrderCost(order, products, inventoryItems);
                const orderProfit = Math.round((order.total - orderCost) * 100) / 100;
                const profitPercent = order.total > 0 ? (orderProfit / order.total) * 100 : 0;
                const externalMethod = externalPaymentMethodById(settings, order.payment.externalMethodId);
                const isConfiguredExternalTender = order.payment.method === "talabat" && Boolean(order.payment.externalMethodId);
                const isMarketplaceOrder = isTalabatOrder(order);
                const Icon = isMarketplaceOrder || order.payment.method === "split"
                  ? Receipt
                  : paymentIcons[order.payment.method];
                const paymentLabel = isMarketplaceOrder
                  ? (locale === "ar" ? "طلب خارجي" : "External order")
                  : isConfiguredExternalTender
                    ? externalPaymentLabel(order.payment, settings, locale)
                    : order.payment.method === "waste"
                      ? t.pos.waste
                      : order.payment.method === "cash"
                        ? t.pos.cash
                        : order.payment.method === "card"
                          ? t.pos.card
                          : order.payment.method === "wallet"
                            ? t.pos.wallet
                      : order.payment.method === "split"
                              ? (locale === "ar" ? "تفاصيل الدفع غير متاحة" : "Payment details unavailable")
                              : order.payment.method;
                const isInstaPay = isConfiguredExternalTender && (/insta\s*pay/i.test(paymentLabel) || paymentLabel.includes("انستا"));
                const BadgeIcon = isInstaPay ? Smartphone : isMarketplaceOrder ? Receipt : isConfiguredExternalTender ? CreditCard : Icon;
                const paymentBadgeStyle = isInstaPay
                  ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                  : isMarketplaceOrder
                  ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                  : order.payment.method === "cash"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : order.payment.method === "card"
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                      : order.payment.method === "wallet"
                        ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                        : order.payment.method === "split"
                          ? "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                          : order.payment.method === "waste"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            : "border-primary/30 bg-primary/5 text-primary";
                return (
                  <div
                    key={order.id}
                    className="group flex w-full flex-col gap-2 rounded-xl border border-border/70 bg-card p-2.5 text-start shadow-sm transition-all hover:border-primary/30 hover:shadow-md sm:p-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleOpen(order)}
                      className="flex min-w-0 items-center text-start lg:flex-1"
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                          #{formatNumber(order.orderNumber)}{" "}
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {order.lines.length} {t.orders.items.toLowerCase()}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {formatDateTime(order.createdAt, locale)} <span className="mx-1">·</span> {order.cashierName}
                        </p>
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
                      {order.payment.method === "split" ? (
                          <div
                            role="group"
                            aria-label={locale === "ar" ? "طرق الدفع المستخدمة في الطلب" : "Payment methods used for this order"}
                            className="flex min-w-0 flex-wrap items-center gap-1.5"
                          >
                            {splitPaymentParts.length > 0 ? splitPaymentParts.map((part, index) => {
                              const partLabel = part.method === "cash" ? t.pos.cash : part.method === "card" ? t.pos.card : t.pos.wallet;
                              const PartIcon = part.method === "cash" ? Banknote : part.method === "card" ? CreditCard : Wallet;
                              const partTone = part.method === "cash"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : part.method === "card"
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                  : "bg-violet-500/10 text-violet-700 dark:text-violet-300";
                              return (
                                <span
                                  key={`${part.method}-${index}`}
                                  title={`${partLabel}: ${formatMoney(part.amount, settings.currencySymbol)}`}
                                  className={cn("flex h-9 min-w-[6rem] items-center justify-center gap-2 rounded-lg border border-current/10 px-2.5", partTone)}
                                >
                                  <PartIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                  <span className="flex min-w-0 flex-col items-start leading-3">
                                    <span className="max-w-full truncate text-[10px] font-semibold">{partLabel}</span>
                                    <span className="font-mono text-[11px]">{formatNumber(part.amount, 2, 2)}</span>
                                  </span>
                                </span>
                              );
                            }) : (
                              <span className="flex h-9 items-center justify-center rounded-lg border border-border px-3 text-center text-[11px] font-medium text-muted-foreground">
                                {paymentLabel}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge
                            className={cn("h-9 min-w-36 shrink-0 justify-center gap-2 overflow-hidden rounded-lg px-3 py-0 text-sm font-semibold", paymentBadgeStyle)}
                            variant="outline"
                            title={order.payment.method === "waste" ? order.wasteReason : undefined}
                          >
                            <BadgeIcon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                            <span className="min-w-0 truncate">{isInstaPay ? "InstaPay" : paymentLabel}</span>
                          </Badge>
                        )}
                      <Badge
                        variant={
                          order.status === "completed"
                            ? "success"
                            : order.status === "refunded"
                            ? "outline"
                            : "destructive"
                        }
                        className="h-8 whitespace-nowrap px-2.5 text-xs"
                      >
                        {order.status}
                      </Badge>
                      <div className="ms-auto flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-lg border-border/80 bg-background/70 px-2 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                          aria-label={`${t.orders.viewInvoice} #${formatNumber(order.orderNumber)}`}
                          title={t.orders.viewInvoice}
                          onClick={() => handleOpen(order)}
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <span>{t.orders.viewInvoice}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-lg border-border/80 bg-background/70 px-2 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                          aria-label={`${t.orders.inventoryUsed} #${formatNumber(order.orderNumber)}`}
                          title={t.orders.inventoryUsed}
                          onClick={() => {
                            setInventoryOrder(order);
                            setInventoryDialogOpen(true);
                          }}
                        >
                          <Boxes className="h-4 w-4 shrink-0" />
                          <span>{t.orders.inventoryUsed}</span>
                        </Button>
                      </div>
                      {canSeeTotals && (
                        <div className="grid w-full grid-cols-2 gap-x-3 gap-y-1 border-t border-border/60 pt-2 sm:grid-cols-4">
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-muted-foreground">{t.reports.costLabel}</p>
                            <p className="truncate text-xs font-semibold">{formatMoney(orderCost, settings.currencySymbol)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-muted-foreground">{t.reports.profitLabel}</p>
                            <p className={cn("truncate text-xs font-semibold", orderProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-300")}>
                              {formatMoney(orderProfit, settings.currencySymbol)}
                              <span className="ms-1 text-[10px] font-medium opacity-80">({formatNumber(profitPercent, 0, 1)}%)</span>
                            </p>
                          </div>
                          {order.discountAmount > 0 && (
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium text-muted-foreground">{t.common.discount}</p>
                              <p className="truncate text-xs font-semibold text-amber-700 dark:text-amber-300">
                                −{formatMoney(order.discountAmount, settings.currencySymbol)}
                                {order.discountPercent ? <span className="ms-1 text-[10px] font-medium">({formatNumber(order.discountPercent, 0, 1)}%)</span> : null}
                              </p>
                            </div>
                          )}
                          <div className="min-w-0 text-end">
                            <p className="text-[10px] font-medium text-muted-foreground">{t.orders.total}</p>
                            <p className="truncate text-sm font-bold text-primary">{formatMoney(order.total, settings.currencySymbol)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {hasMore && filteredOrders.length > 0 && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" disabled={loadingMore} onClick={handleLoadMore}>
              {loadingMore ? t.common.loading : t.orders.loadMore}
            </Button>
          </div>
        )}
      </div>

      <OrderDetailsDialog order={selectedOrder} open={detailsOpen} onOpenChange={setDetailsOpen} />
      <Dialog open={inventoryDialogOpen} onOpenChange={setInventoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.orders.inventoryUsed} {inventoryOrder ? `· #${formatNumber(inventoryOrder.orderNumber)}` : ""}</DialogTitle>
            <DialogDescription>{t.reports.inventoryCostConsumed}</DialogDescription>
          </DialogHeader>
          {inventoryUsage.length > 0 ? (
            <div className="space-y-2">
              {inventoryUsage.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-card px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatNumber(item.quantity, 0, 3)} {item.unit}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{formatMoney(item.cost, settings.currencySymbol)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-3 text-sm font-semibold">
                <span>{t.reports.inventoryCostConsumed}</span>
                <span>{formatMoney(inventoryUsage.reduce((sum, item) => sum + item.cost, 0), settings.currencySymbol)}</span>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t.orders.noInventoryUsed}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInventoryDialogOpen(false)}>{t.common.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
