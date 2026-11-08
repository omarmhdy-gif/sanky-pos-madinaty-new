"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import type { Order } from "@/lib/types";
import { Printer } from "lucide-react";
import { printOrderReceipt } from "@/lib/printing/printReceipt";
import { hasPermission } from "@/lib/permissions";

export function OrderDetailsDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const refundOrder = useDataStore((s) => s.refundOrder);
  const settings = useDataStore((s) => s.settings);
  const currentUser = useAuthStore((s) => s.currentUser);
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const [printing, setPrinting] = useState(false);

  if (!order) return null;

  const canRefund = hasPermission(currentUser, "orders.refund");
  const handleRefund = async () => {
    if (order.status !== "completed" || order.payment.method === "waste" || !canRefund) return;
    if (await refundOrder(order.id)) {
      toast(t.orders.refund, "success");
      onOpenChange(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printOrderReceipt({
        order,
        settings,
        branchName: bilingual(branches.find((b) => b.id === currentBranchId)?.name ?? { en: "", ar: "" }, locale),
        locale,
        openDrawer: false,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to print receipt", "error");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t.orders.orderNumber} #{order.orderNumber}
            <Badge
              variant={
                order.status === "completed" ? "success" : order.status === "refunded" ? "outline" : "destructive"
              }
            >
              {order.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {order.status === "voided" && order.voidReason && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <p className="font-semibold text-destructive">{t.orders.voidReason}</p>
            <p className="mt-1 text-foreground">{order.voidReason}</p>
          </div>
        )}

        <ReceiptView order={order} />

        <DialogFooter className="flex-row justify-center gap-3 sm:justify-center">
          <Button variant="outline" size="sm" className="h-11 w-36 shrink-0 justify-center" disabled={printing} onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            {t.pos.printReceipt}
          </Button>
          {order.status === "completed" && order.payment.method !== "waste" && canRefund && <Button variant="outline" size="sm" className="h-11 w-36 shrink-0 justify-center" onClick={() => void handleRefund()}>
            {t.orders.refund}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
