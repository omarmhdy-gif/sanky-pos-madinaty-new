"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import type { InventoryItem, InventoryItemType, MeasuredUnit } from "@/lib/types";

const UNITS: MeasuredUnit[] = ["g", "ml"];

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
  const [purchaseUnit, setPurchaseUnit] = useState("piece");
  const [conversionFactor, setConversionFactor] = useState("1");
  const [submitting, setSubmitting] = useState(false);
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
      setPurchaseUnit(item?.purchaseUnit ?? (item?.type !== "measured" ? "piece" : item.unit ?? "g"));
      setConversionFactor(String(item?.conversionFactor ?? 1));
      setQuantity(item ? String(item.quantity) : "0");
      setCriticalThreshold(item?.criticalThreshold !== undefined ? String(item.criticalThreshold) : "");
      setLowThreshold(item?.lowThreshold !== undefined ? String(item.lowThreshold) : "");
      setPackSize(item?.packSize !== undefined ? String(item.packSize) : "");
    }
  }, [open, item]);

  const purchaseUnitOptions = useMemo(() => {
    if (type === "piece") return ["piece", "box"];
    return unit === "g" ? ["g", "kg"] : ["ml", "l"];
  }, [type, unit]);

  const handleSave = async () => {
    if (!nameEn.trim()) {
      toast(t.common.required, "error");
      return;
    }
    const factor = type === "measured"
      ? (purchaseUnit === "kg" || purchaseUnit === "l" ? 1000 : 1)
      : (purchaseUnit === "box" ? Number(conversionFactor) : 1);
    if (!purchaseUnit || !Number.isFinite(factor) || factor <= 0) {
      toast(t.common.required, "error");
      return;
    }
    const patch = {
      name: { en: nameEn.trim(), ar: nameAr.trim() || nameEn.trim() },
      type,
      unit: type === "measured" ? unit : undefined,
      purchaseUnit,
      conversionFactor: factor,
      criticalThreshold: criticalThreshold ? parseFloat(criticalThreshold) : undefined,
      lowThreshold: lowThreshold ? parseFloat(lowThreshold) : undefined,
      // Piece-type items only — if the type isn't piece, or the field was
      // left blank, this stays unset ("nothing changes" per requirement).
      packSize: type === "piece" && packSize ? parseFloat(packSize) || undefined : undefined,
    };
    setSubmitting(true);
    try {
      if (item) {
        const updated = await updateInventoryItem(item.id, patch);
        if (!updated) return;
        toast(t.common.save, "success");
      } else {
        const startingPurchaseQuantity = Number(quantity) || 0;
        const created = await addInventoryItem({
          ...patch,
          quantity: startingPurchaseQuantity * factor,
        });
        if (!created) return;
        toast(t.common.add, "success");
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" preventOutsideClose>
        <DialogHeader>
          <DialogTitle>{item ? t.inventory.editItem : t.inventory.addItem}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Item name</Label>
              <Input className="mt-1.5" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div>
              <Label>Item name (Arabic)</Label>
              <Input className="mt-1.5" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.inventory.itemType}</Label>
              <Select value={type} onValueChange={(v) => {
                const nextType = v as InventoryItemType;
                setType(nextType);
                setPurchaseUnit(nextType === "piece" ? "piece" : unit);
                setConversionFactor("1");
              }}>
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
                <Select value={unit} onValueChange={(v) => {
                  const nextUnit = v as MeasuredUnit;
                  setUnit(nextUnit);
                  setPurchaseUnit(nextUnit);
                  setConversionFactor("1");
                }}>
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
          {(
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
              <div>
                <Label>Purchase unit</Label>
                <Select value={purchaseUnit} onValueChange={setPurchaseUnit}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {purchaseUnitOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {type === "piece" && purchaseUnit === "box" ? (
                <div>
                  <Label>Pieces per box</Label>
                  <Input className="mt-1.5" type="number" min="1" step="1" value={conversionFactor} onChange={(e) => setConversionFactor(e.target.value)} placeholder="For example, 12" />
                </div>
              ) : (
                <div className="flex items-end text-sm text-muted-foreground">
                  {type === "measured" && (purchaseUnit === "kg" || purchaseUnit === "l")
                    ? `1 ${purchaseUnit} = 1,000 ${unit}`
                    : `1 ${purchaseUnit} = 1 ${type === "piece" ? "piece" : unit}`}
                </div>
              )}
              <p className="col-span-2 text-xs text-muted-foreground">
                {type === "measured"
                  ? `Purchases use ${purchaseUnit}; stock and recipes use ${unit}.`
                  : `Purchases use ${purchaseUnit}; stock is counted in pieces.`}
              </p>
            </div>
          )}
          {type === "piece" && <p className="text-xs text-muted-foreground">{t.inventory.packSizeHint}</p>}

          {!item && (
            <div>
              <Label>{t.inventory.startingQuantity} ({purchaseUnit})</Label>
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
          <Button onClick={handleSave} disabled={submitting}>{submitting ? "Saving…" : t.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
