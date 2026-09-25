"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import type { InventoryItem } from "@/lib/types";

export function AdjustStockDialog({
  item,
  open,
  onOpenChange,
}: {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const adjustStock = useDataStore((s) => s.adjustStock);

  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<"waste" | "stock_count">("waste");

  useEffect(() => {
    if (open) {
      setDelta("");
      setReason("waste");
    }
  }, [open]);

  if (!item) return null;

  const handleSave = () => {
    const parsed = parseFloat(delta);
    if (!delta || Number.isNaN(parsed) || parsed === 0) {
      toast(t.common.required, "error");
      return;
    }
    adjustStock(item.id, parsed, reason);
    toast(t.common.save, "success");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t.inventory.adjustStock} — {bilingual(item.name, locale)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t.inventory.currentQuantity}: {item.quantity} {item.unit ?? t.inventory.pieceUnit}
          </p>
          <div>
            <Label>{t.inventory.adjustAmount}</Label>
            <Input
              className="mt-1.5"
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder={t.inventory.adjustAmountHint}
            />
          </div>
          <div>
            <Label>{t.inventory.reason}</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as "waste" | "stock_count")}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="waste">{t.inventory.reasonWaste}</SelectItem>
                <SelectItem value="stock_count">{t.inventory.reasonStockCount}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleSave}>{t.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
