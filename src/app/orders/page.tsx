"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt, Banknote, CreditCard, Wallet, Split, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrderDetailsDialog } from "@/components/orders/OrderDetailsDialog";
import { DateFilterBar } from "@/components/shared/DateFilterBar";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, formatNumber, formatDateTime, cn } from "@/lib/utils";
import { dateRangeForFilter, type DateFilterKey } from "@/lib/analytics";
import { hasPermission } from "@/lib/permissions";
import { getExternalPaymentIcon, externalPaymentName } from "@/lib/externalPayment";
import type { Order, PaymentMethod } from "@/lib/types";

const PAYMENT_FILTERS: (PaymentMethod | "all")[] = ["all", "cash", "card", "split", "talabat", "waste"];
const PAGE_SIZE = 50;

export default function OrdersPage() {
  const { t, locale } = useI18n();
  const orders = useDataStore((s) => s.orders);
  const settings = useDataStore((s) => s.settings);
  const fetchOrdersPage = useDataStore((s) => s.fetchOrdersPage);
  const currentUser = useAuthStore((s) => s.currentUser);
  // "Cashiers should not see total sales" — only Reports/Finance access
  // unlocks money figures on this page; order number/date/status/payment
  // method/items always stay visible regardless.
  const canSeeTotals = hasPermission(currentUser, "reports") || hasPermission(currentUser, "finance");
  const ExternalIcon = getExternalPaymentIcon(settings.externalPaymentIcon);
  const externalName = bilingual(externalPaymentName(settings), locale);
  const paymentIcons = { cash: Banknote, card: CreditCard, wallet: Wallet, split: Split, talabat: ExternalIcon, waste: Trash2 };

  const [filter, setFilter] = useState<DateFilterKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod | "all">("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const filteredOrders = useMemo(() => {
    // Orders page shows every status (not just completed), unlike the
    // analytics helpers elsewhere — so filter the full list by date here
    // rather than reusing ordersInDateRange's completed-only behavior.
    let list = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (range) {
      list = list.filter((o) => {
        const t = new Date(o.createdAt);
        return t >= range.from && t <= range.to;
      });
    }

    if (paymentFilter !== "all") {
      list = list.filter((o) => o.payment.method === paymentFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          String(o.orderNumber).includes(q) ||
          o.lines.some((l) => l.name.en.toLowerCase().includes(q) || l.name.ar.includes(q))
      );
    }
    return list;
  }, [orders, filter, customFrom, customTo, search, paymentFilter]);

  const totalRevenue = filteredOrders
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + o.total, 0);

  const handleOpen = (order: Order) => {
    setSelectedOrder(order);
    setDetailsOpen(true);
  };

  return (
    <AppShell title={t.orders.title}>
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t.orders.subtitle}</p>
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

        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.orders.searchPlaceholder}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {PAYMENT_FILTERS.map((m) => (
            <button
              key={m}
              onClick={() => setPaymentFilter(m)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium",
                paymentFilter === m ? "border-primary bg-primary text-primary-foreground" : "border-border"
              )}
            >
              {m === "all" ? t.orders.filterAll : m === "talabat" ? externalName : m === "waste" ? t.pos.waste : t.pos[m]}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{formatNumber(filteredOrders.length)} {t.orders.title.toLowerCase()}</span>
          {canSeeTotals && (
            <span className="text-lg font-bold text-primary">{formatMoney(totalRevenue, settings.currencySymbol)}</span>
          )}
        </div>

        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <Receipt className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t.orders.noOrders}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="divide-y divide-border">
              {filteredOrders.map((order) => {
                const Icon = paymentIcons[order.payment.method];
                return (
                  <button
                    key={order.id}
                    onClick={() => handleOpen(order)}
                    className="flex w-full items-center justify-between gap-3 bg-card px-4 py-3.5 text-start hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-4.5 w-4.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          #{formatNumber(order.orderNumber)}{" "}
                          <span className="font-normal text-muted-foreground">
                            · {order.lines.length} {t.orders.items.toLowerCase()}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(order.createdAt, locale)} · {order.cashierName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.payment.method === "talabat" && (
                        <Badge className="border-[#FF5A00]/40 bg-[#FF5A00]/10 text-[#FF5A00]" variant="outline">
                          <ExternalIcon className="h-3 w-3" />
                          {externalName}
                        </Badge>
                      )}
                      {order.payment.method === "waste" && (
                        <Badge
                          className="border-destructive/40 bg-destructive/10 text-destructive"
                          variant="outline"
                          title={order.wasteReason}
                        >
                          <Trash2 className="h-3 w-3" />
                          {t.pos.waste}
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
                        className="hidden sm:inline-flex"
                      >
                        {order.status}
                      </Badge>
                      {canSeeTotals && (
                        <span className="text-sm font-bold text-primary">
                          {formatMoney(order.total, settings.currencySymbol)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
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
    </AppShell>
  );
}
