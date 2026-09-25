"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils";
import type { InventoryItem } from "@/lib/types";

export function ReceiveStockDialog({
  item,
  open,
  onOpenChange,
}: {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const settings = useDataStore((s) => s.settings);
  const receiveStock = useDataStore((s) => s.receiveStock);
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setQty("");
      setUnitCost(item?.lastPurchaseCost != null ? String(item.lastPurchaseCost) : "");
      setSupplier("");
    }
  }, [open, item]);

  const totalCost = useMemo(() => {
    const q = parseFloat(qty) || 0;
    const c = parseFloat(unitCost) || 0;
    return Math.round(q * c * 100) / 100;
  }, [qty, unitCost]);

  if (!item) return null;

  const handleSave = async () => {
    const parsedQty = parseFloat(qty);
    const parsedCost = parseFloat(unitCost);
    if (!qty || Number.isNaN(parsedQty) || parsedQty <= 0 || !unitCost || Number.isNaN(parsedCost) || parsedCost < 0) {
      toast(t.common.required, "error");
      return;
    }
    setSubmitting(true);
    try {
      await receiveStock(item.id, parsedQty, parsedCost, supplier.trim() || undefined);
      toast(t.receiveStock.received, "success");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t.receiveStock.title} — {bilingual(item.name, locale)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t.inventory.currentQuantity}: {item.quantity} {item.unit ?? t.inventory.pieceUnit}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.receiveStock.quantityToAdd}</Label>
              <Input
                className="mt-1.5"
                type="number"
                autoFocus
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>{t.receiveStock.unit}</Label>
              <Input className="mt-1.5" value={item.unit ?? t.inventory.pieceUnit} disabled />
            </div>
          </div>

          {/* Piece-type items only — a faster way to build up the quantity
              above instead of typing it out. Each tap just adds to the same
              `qty` field the owner can still type into directly; nothing
              about "packs" is ever saved anywhere. */}
          {item.type === "piece" && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setQty((prev) => String((parseFloat(prev) || 0) + 1))}
              >
                {t.receiveStock.addPiece}
              </Button>
              {item.packSize && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setQty((prev) => String((parseFloat(prev) || 0) + item.packSize!))}
                >
                  {t.receiveStock.addPack.replace("{size}", String(item.packSize))}
                </Button>
              )}
            </div>
          )}
          <div>
            <Label>{t.receiveStock.unitCost}</Label>
            <Input
              className="mt-1.5"
              type="number"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>{t.receiveStock.supplier}</Label>
            <Input
              className="mt-1.5"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder={t.common.optional}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-2.5">
            <span className="text-sm font-medium text-muted-foreground">{t.receiveStock.totalCost}</span>
            <span className="text-lg font-bold text-primary">{formatMoney(totalCost, settings.currencySymbol)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button disabled={submitting} onClick={handleSave}>
            {t.receiveStock.receiveButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
