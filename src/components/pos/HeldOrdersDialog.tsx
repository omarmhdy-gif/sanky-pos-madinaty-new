"use client";

import { PauseCircle, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useHeldOrdersStore } from "@/lib/store/useHeldOrdersStore";
import { useCartStore } from "@/lib/store/useCartStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { useDataStore } from "@/lib/store/useDataStore";
import { lineTotal } from "@/lib/store/useCartStore";
import { toast } from "@/components/ui/toast";

export function HeldOrdersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, locale } = useI18n();
  const { held, removeHeld } = useHeldOrdersStore();
  const currencySymbol = useDataStore((s) => s.settings.currencySymbol);
  const setCartState = useCartStore.setState;

  const handleResume = (id: string) => {
    const order = held.find((h) => h.id === id);
    if (!order) return;
    setCartState({
      lines: order.lines,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      discountPercent: order.discountPercent,
      discountFixedAmount: order.discountFixedAmount ?? 0,
    });
    removeHeld(id);
    onOpenChange(false);
    toast(t.pos.resumeSuccess, "success");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-primary" />
            {t.pos.heldOrders}
          </DialogTitle>
        </DialogHeader>

        {held.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <PauseCircle className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t.pos.noHeldOrders}</p>
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2.5 overflow-y-auto scrollbar-thin">
            {held.map((order) => {
              const total = order.lines.reduce((s, l) => s + lineTotal(l), 0);
              const itemCount = order.lines.reduce((s, l) => s + l.qty, 0);
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-background p-3.5"
                >
                  <div>
                    <p className="text-sm font-semibold">{order.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {itemCount} {t.pos.qty.toLowerCase()} · {formatDateTime(order.createdAt, locale)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.lines.map((l) => bilingual(l.name, locale)).join(", ")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm font-bold text-primary">{formatMoney(total, currencySymbol)}</span>
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => handleResume(order.id)}>
                        {t.pos.resume}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeHeld(order.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
