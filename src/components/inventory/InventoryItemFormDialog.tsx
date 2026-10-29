"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n } from "@/lib/i18n";
import { bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { formatMoney, formatNumber } from "@/lib/utils";
import { ingredientCost } from "@/lib/inventory";
import type { InventoryItem, InventoryItemType, MeasuredUnit, RecipeIngredient } from "@/lib/types";

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
  const { t, locale } = useI18n();
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const currencySymbol = useDataStore((s) => s.settings.currencySymbol);
  const addInventoryItem = useDataStore((s) => s.addInventoryItem);
  const updateInventoryItem = useDataStore((s) => s.updateInventoryItem);

  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [sourcingType, setSourcingType] = useState<"purchased" | "manufactured">("purchased");
  const [type, setType] = useState<InventoryItemType>("piece");
  const [unit, setUnit] = useState<MeasuredUnit>("g");
  const [purchaseUnit, setPurchaseUnit] = useState("piece");
  const [conversionFactor, setConversionFactor] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [criticalThreshold, setCriticalThreshold] = useState("");
  const [lowThreshold, setLowThreshold] = useState("");
  const [packSize, setPackSize] = useState("");
  const [manufacturingRecipe, setManufacturingRecipe] = useState<RecipeIngredient[]>([]);
  const [autoManufactureOnSale, setAutoManufactureOnSale] = useState(false);

  useEffect(() => {
    if (open) {
      setNameEn(item?.name.en ?? "");
      setNameAr(item?.name.ar ?? "");
      setSourcingType(item?.sourcingType ?? "purchased");
      setType(item?.type ?? "piece");
      setUnit(item?.unit ?? "g");
      setPurchaseUnit(item?.purchaseUnit ?? (item?.type !== "measured" ? "piece" : item.unit ?? "g"));
      setConversionFactor(String(item?.conversionFactor ?? 1));
      setQuantity(item ? String(item.quantity) : "0");
      setCriticalThreshold(item?.criticalThreshold !== undefined ? String(item.criticalThreshold) : "");
      setLowThreshold(item?.lowThreshold !== undefined ? String(item.lowThreshold) : "");
      setPackSize(item?.packSize !== undefined ? String(item.packSize) : "");
      setManufacturingRecipe(item?.manufacturingRecipe ?? []);
      setAutoManufactureOnSale(item?.autoManufactureOnSale ?? false);
    }
  }, [open, item]);

  const purchaseUnitOptions = useMemo(() => {
    if (type === "piece") return ["piece", "box"];
    return unit === "g" ? ["g", "kg"] : ["ml", "l"];
  }, [type, unit]);

  const addManufacturingIngredient = () => {
    const available = inventoryItems.find((candidate) =>
      candidate.id !== item?.id && !manufacturingRecipe.some((ingredient) => ingredient.inventoryItemId === candidate.id)
    );
    if (!available) {
      toast(t.inventory.noUnusedInventoryMaterials, "error");
      return;
    }
    setManufacturingRecipe((current) => [...current, { inventoryItemId: available.id, qty: 1 }]);
  };

  const updateManufacturingIngredient = (index: number, patch: Partial<RecipeIngredient>) => {
    setManufacturingRecipe((current) => current.map((ingredient, rowIndex) => rowIndex === index ? { ...ingredient, ...patch } : ingredient));
  };

  const handleSave = async () => {
    if (!nameEn.trim()) {
      toast(t.common.required, "error");
      return;
    }
    const factor = sourcingType === "manufactured" ? 1 : type === "measured"
      ? (purchaseUnit === "kg" || purchaseUnit === "l" ? 1000 : 1)
      : (purchaseUnit === "box" ? Number(conversionFactor) : 1);
    if ((sourcingType === "purchased" && !purchaseUnit) || !Number.isFinite(factor) || factor <= 0) {
      toast(t.common.required, "error");
      return;
    }
    const finalManufacturingRecipe = sourcingType === "manufactured"
      ? manufacturingRecipe.filter((ingredient) => ingredient.inventoryItemId && ingredient.qty > 0)
      : [];
    if (sourcingType === "manufactured" && autoManufactureOnSale && finalManufacturingRecipe.length === 0) {
      toast(t.inventory.manufacturingRecipe, "error");
      return;
    }
    const patch = {
      name: { en: nameEn.trim(), ar: nameAr.trim() || nameEn.trim() },
      sourcingType,
      type,
      unit: type === "measured" ? unit : undefined,
      purchaseUnit,
      conversionFactor: factor,
      criticalThreshold: criticalThreshold ? parseFloat(criticalThreshold) : undefined,
      lowThreshold: lowThreshold ? parseFloat(lowThreshold) : undefined,
      // Piece-type items only — if the type isn't piece, or the field was
      // left blank, this stays unset ("nothing changes" per requirement).
      packSize: type === "piece" && packSize ? parseFloat(packSize) || undefined : undefined,
      manufacturingRecipe: finalManufacturingRecipe,
      autoManufactureOnSale: sourcingType === "manufactured" && autoManufactureOnSale,
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
      <DialogContent className="max-w-2xl" preventOutsideClose>
        <DialogHeader>
          <DialogTitle>{item ? t.inventory.editItem : t.inventory.addItem}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pe-1 no-scrollbar">
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

          <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
            <div>
              <Label>{t.inventory.sourcingType}</Label>
              <p className="mt-1 text-xs text-muted-foreground">{sourcingType === "purchased" ? t.inventory.purchasedHint : t.inventory.manufacturedHint}</p>
            </div>
            <Select value={sourcingType} onValueChange={(value) => setSourcingType(value as "purchased" | "manufactured")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchased">{t.inventory.purchased}</SelectItem>
                <SelectItem value="manufactured">{t.inventory.manufactured}</SelectItem>
              </SelectContent>
            </Select>
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
            {type === "piece" && sourcingType === "purchased" && (
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
          {sourcingType === "purchased" && (
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
          {type === "piece" && sourcingType === "purchased" && <p className="text-xs text-muted-foreground">{t.inventory.packSizeHint}</p>}

          {sourcingType === "manufactured" && <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Label className="text-sm font-semibold">{t.inventory.manufacturingRecipe}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t.inventory.manufacturingRecipeHint}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addManufacturingIngredient} disabled={inventoryItems.length <= (item ? 1 : 0)}>
                <Plus className="h-3.5 w-3.5" />{t.inventory.addManufacturingIngredient}
              </Button>
            </div>

            {manufacturingRecipe.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-background/70 p-4 text-center text-xs text-muted-foreground">{t.inventory.noRecipeComponents}</p>
            ) : (
              <div className="space-y-2">
                {manufacturingRecipe.map((ingredient, index) => {
                  const component = inventoryItems.find((candidate) => candidate.id === ingredient.inventoryItemId);
                  const options = inventoryItems.filter((candidate) => candidate.id !== item?.id && (!manufacturingRecipe.some((other, otherIndex) => otherIndex !== index && other.inventoryItemId === candidate.id)));
                  return (
                    <div key={`${ingredient.inventoryItemId}-${index}`} className="grid gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-[minmax(0,1fr)_120px_36px] sm:items-start">
                      <div className="min-w-0">
                        <Select value={ingredient.inventoryItemId} onValueChange={(value) => updateManufacturingIngredient(index, { inventoryItemId: value })}>
                          <SelectTrigger><SelectValue placeholder={t.inventory.addManufacturingIngredient} /></SelectTrigger>
                          <SelectContent>{options.map((option) => <SelectItem key={option.id} value={option.id}>{bilingual(option.name, locale)}</SelectItem>)}</SelectContent>
                        </Select>
                        {component && <p className="mt-1.5 text-[11px] text-muted-foreground">{formatNumber(component.quantity, 0, 3)} {component.unit ?? t.inventory.pieceUnit} · {formatMoney(ingredientCost({ ...ingredient, qty: 1 }, inventoryItems), currencySymbol)} / {component.unit ?? t.inventory.pieceUnit}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input type="number" min="0.001" step="0.001" value={ingredient.qty || ""} onChange={(event) => updateManufacturingIngredient(index, { qty: Number(event.target.value) || 0 })} aria-label={t.inventory.manufacturingRecipe} />
                        <span className="shrink-0 text-xs text-muted-foreground">{component?.unit ?? t.inventory.pieceUnit}</span>
                      </div>
                      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => setManufacturingRecipe((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label={t.common.delete}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{t.inventory.estimatedUnitCost}</span>
                  <span className="font-semibold tabular-nums">{formatMoney(manufacturingRecipe.reduce((sum, ingredient) => sum + ingredientCost(ingredient, inventoryItems), 0), currencySymbol)}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="min-w-0">
                <Label>{t.inventory.autoManufactureOnSale}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t.inventory.autoManufactureOnSaleHint}</p>
              </div>
              <Switch checked={autoManufactureOnSale} onCheckedChange={setAutoManufactureOnSale} disabled={manufacturingRecipe.length === 0} />
            </div>
          </section>}

          {!item && (
            <div>
              <Label>{t.inventory.startingQuantity} ({sourcingType === "purchased" ? purchaseUnit : type === "piece" ? t.inventory.pieceUnit : unit})</Label>
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
