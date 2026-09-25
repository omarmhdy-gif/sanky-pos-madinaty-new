"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import type { InventoryItem, InventoryItemType, MeasuredUnit } from "@/lib/types";

const UNITS: MeasuredUnit[] = ["g", "ml", "l", "kg"];

export function InventoryItemFormDialog({
  item,
  open,
  onOpenChange,
}: {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const addInventoryItem = useDataStore((s) => s.addInventoryItem);
  const updateInventoryItem = useDataStore((s) => s.updateInventoryItem);

  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [type, setType] = useState<InventoryItemType>("piece");
  const [unit, setUnit] = useState<MeasuredUnit>("g");
  const [quantity, setQuantity] = useState("");
  const [criticalThreshold, setCriticalThreshold] = useState("");
  const [lowThreshold, setLowThreshold] = useState("");
  const [packSize, setPackSize] = useState("");

  useEffect(() => {
    if (open) {
      setNameEn(item?.name.en ?? "");
      setNameAr(item?.name.ar ?? "");
      setType(item?.type ?? "piece");
      setUnit(item?.unit ?? "g");
      setQuantity(item ? String(item.quantity) : "0");
      setCriticalThreshold(item?.criticalThreshold !== undefined ? String(item.criticalThreshold) : "");
      setLowThreshold(item?.lowThreshold !== undefined ? String(item.lowThreshold) : "");
      setPackSize(item?.packSize !== undefined ? String(item.packSize) : "");
    }
  }, [open, item]);

  const handleSave = () => {
    if (!nameEn.trim()) {
      toast(t.common.required, "error");
      return;
    }
    const patch = {
      name: { en: nameEn.trim(), ar: nameAr.trim() || nameEn.trim() },
      type,
      unit: type === "measured" ? unit : undefined,
      criticalThreshold: criticalThreshold ? parseFloat(criticalThreshold) : undefined,
      lowThreshold: lowThreshold ? parseFloat(lowThreshold) : undefined,
      // Piece-type items only — if the type isn't piece, or the field was
      // left blank, this stays unset ("nothing changes" per requirement).
      packSize: type === "piece" && packSize ? parseFloat(packSize) || undefined : undefined,
    };
    if (item) {
      updateInventoryItem(item.id, patch);
      toast(t.common.save, "success");
    } else {
      addInventoryItem({ ...patch, quantity: parseFloat(quantity) || 0 });
      toast(t.common.add, "success");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? t.inventory.editItem : t.inventory.addItem}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.products.productName}</Label>
              <Input className="mt-1.5" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div>
              <Label>{t.products.productNameAr}</Label>
              <Input className="mt-1.5" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.inventory.itemType}</Label>
              <Select value={type} onValueChange={(v) => setType(v as InventoryItemType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="piece">{t.inventory.piece}</SelectItem>
                  <SelectItem value="measured">{t.inventory.measured}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === "measured" && (
              <div>
                <Label>{t.inventory.unit}</Label>
                <Select value={unit} onValueChange={(v) => setUnit(v as MeasuredUnit)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {type === "piece" && (
              <div>
                <Label>{t.inventory.packSize}</Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                  placeholder={t.common.optional}
                />
              </div>
            )}
          </div>
          {type === "piece" && <p className="text-xs text-muted-foreground">{t.inventory.packSizeHint}</p>}

          {!item && (
            <div>
              <Label>{t.inventory.startingQuantity}</Label>
              <Input
                className="mt-1.5"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.inventory.criticalThreshold}</Label>
              <Input
                className="mt-1.5"
                type="number"
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(e.target.value)}
                placeholder={t.common.optional}
              />
            </div>
            <div>
              <Label>{t.inventory.lowThreshold}</Label>
              <Input
                className="mt-1.5"
                type="number"
                value={lowThreshold}
                onChange={(e) => setLowThreshold(e.target.value)}
                placeholder={t.common.optional}
              />
            </div>
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
