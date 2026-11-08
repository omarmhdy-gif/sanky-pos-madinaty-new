"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, ClipboardList, Clock3, RotateCcw, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OrderDetailsDialog } from "@/components/orders/OrderDetailsDialog";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHeldOrdersStore } from "@/lib/store/useHeldOrdersStore";
import { useCartStore, lineTotal } from "@/lib/store/useCartStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { Order } from "@/lib/types";

const PAGE_SIZE = 40;
type OrderFilter = "all" | "held" | "completed" | "voided" | "refunded";

export function PosOrdersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, locale } = useI18n();
  const orders = useDataStore((state) => state.orders);
  const fetchOrdersPage = useDataStore((state) => state.fetchOrdersPage);
  const currencySymbol = useDataStore((state) => state.settings.currencySymbol);
  const held = useHeldOrdersStore((state) => state.held);
  const removeHeld = useHeldOrdersStore((state) => state.removeHeld);
  const setCartState = useCartStore.setState;
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [orderType, setOrderType] = useState<"all" | "takeaway" | "dine_in">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setOffset(PAGE_SIZE);
    void fetchOrdersPage({ limit: PAGE_SIZE, offset: 0 })
      .then((more) => { if (active) setHasMore(more); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, fetchOrdersPage]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const more = await fetchOrdersPage({ limit: PAGE_SIZE, offset });
      setOffset((current) => current + PAGE_SIZE);
      setHasMore(more);
    } finally {
      setLoading(false);
    }
  };

  const visibleOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return [...orders]
      .filter((order) => order.status !== "held")
      .filter((order) => filter === "all" || filter === "held" || order.status === filter)
      .filter((order) => orderType === "all" || order.type === orderType)
      .filter((order) => !needle || [
        String(order.orderNumber),
        order.customerName ?? "",
        order.cashierName,
        ...order.lines.map((line) => bilingual(line.name, locale)),
      ].some((value) => value.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, filter, orderType, search, locale]);

  const visibleHeld = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return held.filter((order) => !needle || [order.label, ...order.lines.map((line) => bilingual(line.name, locale))]
      .some((value) => value.toLocaleLowerCase().includes(needle)));
  }, [held, search, locale]);

  const handleResume = (id: string) => {
    const heldOrder = held.find((item) => item.id === id);
    if (!heldOrder) return;
    setCartState({
      lines: heldOrder.lines,
      orderType: heldOrder.orderType,
      tableId: heldOrder.tableId,
      tableNumber: heldOrder.tableNumber,
      customerName: heldOrder.customerName,
      customerId: heldOrder.customerId,
      discountPercent: heldOrder.discountPercent,
      discountFixedAmount: heldOrder.discountFixedAmount ?? 0,
      promoCode: heldOrder.promoCode,
    });
    removeHeld(id);
    onOpenChange(false);
    toast(t.pos.resumeSuccess, "success");
  };

  const filters: { key: OrderFilter; label: string; count: number; icon: typeof ClipboardList }[] = [
    { key: "all", label: t.pos.allOrders, count: orders.length + held.length, icon: ClipboardList },
    { key: "held", label: t.pos.heldOrders, count: held.length, icon: Clock3 },
    { key: "completed", label: t.pos.completedOrders, count: orders.filter((order) => order.status === "completed").length, icon: CheckCircle2 },
    { key: "voided", label: t.pos.cancelledOrders, count: orders.filter((order) => order.status === "voided").length, icon: Ban },
    { key: "refunded", label: t.pos.refundedOrders, count: orders.filter((order) => order.status === "refunded").length, icon: RotateCcw },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {t.pos.orderManagement}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {filters.map(({ key, label, count, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${filter === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted/60"}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  <span className={`rounded-full px-1.5 text-xs ${filter === key ? "bg-primary-foreground/15" : "bg-muted"}`}>{count}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.orders.searchPlaceholder} />
              <select
                value={orderType}
                onChange={(event) => setOrderType(event.target.value as typeof orderType)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                aria-label={t.pos.orderTypeAll}
              >
                <option value="all">{t.pos.orderTypeAll}</option>
                <option value="dine_in">{t.pos.dineInOrders}</option>
                <option value="takeaway">{t.pos.takeawayOrders}</option>
              </select>
            </div>

            <div className="max-h-[60vh] space-y-2 overflow-y-auto pe-1 no-scrollbar">
              {filter === "held" ? visibleHeld.map((heldOrder) => {
                const count = heldOrder.lines.reduce((sum, line) => sum + line.qty, 0);
                const total = heldOrder.lines.reduce((sum, line) => sum + lineTotal(line), 0);
                return (
                  <article key={heldOrder.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{heldOrder.label}</p><Badge variant="outline">{t.pos.heldOrders}</Badge></div>
                      <p className="mt-1 text-xs text-muted-foreground">{count} {t.pos.qty.toLowerCase()} · {formatDateTime(heldOrder.createdAt, locale)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{heldOrder.lines.map((line) => bilingual(line.name, locale)).join(", ")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary">{formatMoney(total, currencySymbol)}</span>
                      <Button size="sm" onClick={() => handleResume(heldOrder.id)}>{t.pos.resume}</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeHeld(heldOrder.id)} aria-label={t.common.delete}>×</Button>
                    </div>
                  </article>
                );
              }) : visibleOrders.map((order) => {
                const count = order.lines.reduce((sum, line) => sum + line.qty, 0);
                const statusLabel = order.status === "completed" ? t.pos.completedOrders : order.status === "voided" ? t.pos.cancelledOrders : t.pos.refundedOrders;
                return (
                  <button
                    type="button"
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="grid w-full gap-2 rounded-xl border border-border bg-card p-3 text-start transition-colors hover:border-primary/30 hover:bg-muted/20 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong>#{order.orderNumber}</strong>
                        <Badge variant={order.status === "completed" ? "success" : order.status === "voided" ? "destructive" : "outline"}>{statusLabel}</Badge>
                        <span className="text-xs text-muted-foreground">{order.type === "dine_in" ? t.pos.dineInOrders : t.pos.takeawayOrders}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{count} {t.pos.qty.toLowerCase()} · {formatDateTime(order.createdAt, locale)} · {order.customerName || order.cashierName}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{order.lines.map((line) => bilingual(line.name, locale)).join(", ")}</span>
                    </span>
                    <span className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-sm font-bold text-primary">{formatMoney(order.total, currencySymbol)}</span>
                      {order.status !== "voided" && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShoppingBag className="h-3.5 w-3.5" />{order.payment.method}</span>}
                    </span>
                  </button>
                );
              })}
              {filter === "held" && visibleHeld.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t.pos.noHeldOrders}</p>}
              {filter !== "held" && visibleOrders.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{loading ? t.common.loading : t.pos.noOrders}</p>}
            </div>

            {filter !== "held" && hasMore && (
              <div className="flex justify-center"><Button variant="outline" onClick={() => void loadMore()} disabled={loading}>{loading ? t.common.loading : t.pos.loadMoreOrders}</Button></div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <OrderDetailsDialog order={selectedOrder} open={!!selectedOrder} onOpenChange={(next) => !next && setSelectedOrder(null)} />
    </>
  );
}
