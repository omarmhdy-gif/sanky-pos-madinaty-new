"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n, bilingual } from "@/lib/i18n";
import { useDataStore } from "@/lib/store/useDataStore";
import { useCartStore } from "@/lib/store/useCartStore";
import { formatMoney, cn, isImageUrl } from "@/lib/utils";
import type { Product, CartLineModifier } from "@/lib/types";
import { Check, Minus, Plus } from "lucide-react";

export function ModifierDialog({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const modifierGroups = useDataStore((s) => s.modifierGroups);
  const currencySymbol = useDataStore((s) => s.settings.currencySymbol);
  const addLine = useCartStore((s) => s.addLine);

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);

  const groups = useMemo(
    () => (product?.modifierGroupIds ?? []).map((id) => modifierGroups.find((g) => g.id === id)).filter(Boolean),
    [product, modifierGroups]
  ) as NonNullable<ReturnType<typeof modifierGroups.find>>[];

  useEffect(() => {
    if (open && product) {
      const initial: Record<string, string[]> = {};
      groups.forEach((g) => {
        if (g.required && g.options.length > 0) initial[g.id] = [g.options[0].id];
      });
      setSelections(initial);
      setQty(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  if (!product) return null;

  const toggleOption = (groupId: string, optionId: string, multi: boolean) => {
    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      if (multi) {
        const next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, [groupId]: next };
      }
      return { ...prev, [groupId]: [optionId] };
    });
  };

  const selectedModifiers: CartLineModifier[] = groups.flatMap((g) =>
    (selections[g.id] ?? []).map((optId) => {
      const opt = g.options.find((o) => o.id === optId)!;
      return { groupId: g.id, optionId: opt.id, name: opt.name, priceDelta: opt.priceDelta };
    })
  );

  const unitTotal = product.price + selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);
  const canAdd = groups.filter((g) => g.required).every((g) => (selections[g.id] ?? []).length > 0);

  const handleAdd = () => {
    if (!canAdd) return;
    addLine({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      qty,
      modifiers: selectedModifiers,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {isImageUrl(product.image) ? (
              <img src={product.image} alt="" className="h-9 w-9 rounded-md object-cover" />
            ) : (
              <span className="text-3xl">{product.image}</span>
            )}
            {bilingual(product.name, locale)}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-5 overflow-y-auto scrollbar-thin -mx-1 px-1">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {bilingual(g.name, locale)}
                  {g.required && <span className="text-destructive"> *</span>}
                </p>
                {g.multiSelect && (
                  <span className="text-xs text-muted-foreground">{t.common.optional}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {g.options.map((opt) => {
                  const active = (selections[g.id] ?? []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleOption(g.id, opt.id, g.multiSelect)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:bg-accent"
                      )}
                    >
                      {active && <Check className="h-3.5 w-3.5" />}
                      {bilingual(opt.name, locale)}
                      {opt.priceDelta > 0 && (
                        <span className="opacity-75">+{opt.priceDelta}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border active:scale-90"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center text-lg font-semibold">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border active:scale-90"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="text-lg font-bold text-primary">
            {formatMoney(unitTotal * qty, currencySymbol)}
          </p>
        </div>

        <DialogFooter>
          <Button size="lg" className="w-full" onClick={handleAdd} disabled={!canAdd}>
            {t.common.add} — {formatMoney(unitTotal * qty, currencySymbol)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
