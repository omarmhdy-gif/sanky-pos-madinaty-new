"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Factory, PackageCheck } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { ingredientCost, inventoryItemUnitCost } from "@/lib/inventory";
import { formatMoney, formatNumber } from "@/lib/utils";
import type { InventoryItem } from "@/lib/types";

export function ManufactureInventoryDialog({
  item,
  open,
  onOpenChange,
}: {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const inventoryItems = useDataStore((state) => state.inventoryItems);
  const settings = useDataStore((state) => state.settings);
  const manufactureInventoryItem = useDataStore((state) => state.manufactureInventoryItem);
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setQuantity("1");
      setSaving(false);
    }
  }, [open, item]);

  const unitsToMake = Math.max(0, Number(quantity) || 0);
  const components = useMemo(() => (item?.manufacturingRecipe ?? []).map((ingredient) => {
    const material = inventoryItems.find((candidate) => candidate.id === ingredient.inventoryItemId);
    const required = ingredient.qty * unitsToMake;
    return {
      ingredient,
      material,
      required,
      shortage: Math.max(0, required - (material?.quantity ?? 0)),
      lineCost: ingredientCost({ ...ingredient, qty: required }, inventoryItems),
    };
  }), [inventoryItems, item, unitsToMake]);

  const blockers = components.filter(({ material, shortage }) => shortage > 0 && (
    !material
    || material.sourcingType !== "manufactured"
    || !material.autoManufactureOnSale
    || !material.manufacturingRecipe?.length
  ));
  const estimatedCost = components.reduce((sum, component) => sum + component.lineCost, 0);
  const unitCost = inventoryItemUnitCost(item ?? undefined, inventoryItems);

  const handleManufacture = async () => {
    if (!item || !Number.isFinite(unitsToMake) || unitsToMake <= 0 || !item.manufacturingRecipe?.length) return;
    if (blockers.length > 0) {
      toast(t.inventory.manufacturingStockShortage, "error");
      return;
    }
    setSaving(true);
    const completed = await manufactureInventoryItem(item.id, unitsToMake);
    setSaving(false);
    if (completed) {
      toast(t.inventory.manufactureSuccess, "success");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Factory className="h-5 w-5 text-primary" />{t.inventory.manufacture}: {item ? bilingual(item.name, locale) : ""}</DialogTitle>
        </DialogHeader>

        {item && (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto no-scrollbar">
            <div className="grid gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">{t.inventory.currentStock}</p><p className="mt-1 text-lg font-bold tabular-nums">{formatNumber(item.quantity, 0, 3)} {item.unit ?? t.inventory.pieceUnit}</p></div>
              <div><p className="text-xs text-muted-foreground">{t.inventory.estimatedUnitCost}</p><p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(unitCost, settings.currencySymbol)} / {item.unit ?? t.inventory.pieceUnit}</p></div>
              <div><p className="text-xs text-muted-foreground">{t.inventory.manufacture}</p><div className="mt-1 flex items-center gap-2"><PackageCheck className="h-4 w-4 text-emerald-600" /><span className="text-sm font-semibold">{formatNumber(unitsToMake, 0, 3)} {item.unit ?? t.inventory.pieceUnit}</span></div></div>
            </div>

            <div>
              <Label htmlFor="manufacturing-quantity">{t.inventory.quantityToManufacture} ({item.unit ?? t.inventory.pieceUnit})</Label>
              <Input id="manufacturing-quantity" className="mt-1.5" type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>

            <section className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3.5 py-3 text-sm font-semibold"><Boxes className="h-4 w-4 text-primary" />{t.inventory.requiredComponents}</div>
              <div className="divide-y divide-border">
                {components.map(({ ingredient, material, required, shortage, lineCost }) => (
                  <div key={ingredient.inventoryItemId} className="grid gap-2 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{material ? bilingual(material.name, locale) : t.inventory.unknownItem}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatNumber(ingredient.qty, 0, 3)} {material?.unit ?? t.inventory.pieceUnit} / {item.unit ?? t.inventory.pieceUnit}</p></div>
                    <div className="text-start sm:text-end"><p className="text-xs text-muted-foreground">{t.inventory.currentStock}</p><p className="text-sm tabular-nums">{formatNumber(material?.quantity ?? 0, 0, 3)} {material?.unit ?? t.inventory.pieceUnit}</p>{shortage > 0 && <p className={`text-xs ${blockers.some((blocker) => blocker.ingredient.inventoryItemId === ingredient.inventoryItemId) ? "text-destructive" : "text-primary"}`}>{blockers.some((blocker) => blocker.ingredient.inventoryItemId === ingredient.inventoryItemId) ? t.inventory.shortage : t.inventory.autoManufactureOnSale}</p>}</div>
                    <div className="text-start sm:text-end"><p className="text-xs text-muted-foreground">{t.inventory.requiredComponents}</p><p className="text-sm font-semibold tabular-nums">{formatNumber(required, 0, 3)} {material?.unit ?? t.inventory.pieceUnit}</p><p className="text-xs text-muted-foreground">{formatMoney(lineCost, settings.currencySymbol)}</p></div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-3 text-sm"><span className="text-muted-foreground">{t.inventory.estimatedUnitCost} × {formatNumber(unitsToMake, 0, 3)}</span><span className="font-bold tabular-nums">{formatMoney(estimatedCost, settings.currencySymbol)}</span></div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.common.cancel}</Button>
          <Button onClick={() => void handleManufacture()} disabled={!item?.manufacturingRecipe?.length || unitsToMake <= 0 || saving || blockers.length > 0}>
            <Factory className="h-4 w-4" />{saving ? t.common.loading : t.inventory.manufacture}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
