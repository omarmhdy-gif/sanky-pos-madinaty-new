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

const CASHIER_CANCEL_WINDOW_MS = 5 * 60 * 1000;

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
  const voidOrder = useDataStore((s) => s.voidOrder);
  const refundOrder = useDataStore((s) => s.refundOrder);
  const settings = useDataStore((s) => s.settings);
  const role = useAuthStore((s) => s.currentUser?.role);
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const [printing, setPrinting] = useState(false);

  if (!order) return null;

  const isOwner = role === "owner";
  const withinCancelWindow = Date.now() - new Date(order.createdAt).getTime() < CASHIER_CANCEL_WINDOW_MS;

  const handleVoid = () => {
    voidOrder(order.id);
    toast(t.orders.void, "info");
    onOpenChange(false);
  };

  const handleRefund = () => {
    refundOrder(order.id);
    toast(t.orders.refund, "info");
    onOpenChange(false);
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

        <ReceiptView order={order} />

        <DialogFooter className="grid grid-cols-3 gap-2 sm:grid-cols-3">
          <Button variant="outline" size="sm" disabled={printing} onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            {t.pos.printReceipt}
          </Button>
          {order.status === "completed" && isOwner && (
            <>
              <Button variant="outline" size="sm" onClick={handleRefund}>
                {t.orders.refund}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleVoid}>
                {t.orders.void}
              </Button>
            </>
          )}
          {order.status === "completed" && !isOwner && withinCancelWindow && (
            <Button variant="destructive" size="sm" onClick={handleVoid}>
              {t.orders.cancel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
