"use client";

import { useMemo, useState } from "react";
import { ChefHat } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, cn, isImageUrl } from "@/lib/utils";
import { recipeCost, estimatedProfit, estimatedMargin } from "@/lib/inventory";
import type { Product } from "@/lib/types";

export default function RecipesPage() {
  const { t, locale } = useI18n();
  const products = useDataStore((s) => s.products);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const settings = useDataStore((s) => s.settings);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const rows = useMemo(() => {
    return products
      .filter((p) => p.isActive)
      .map((p) => ({
        product: p,
        cost: recipeCost(p, inventoryItems),
        profit: estimatedProfit(p, inventoryItems),
        margin: estimatedMargin(p, inventoryItems),
      }))
      .sort((a, b) => a.margin - b.margin);
  }, [products, inventoryItems]);

  const editing = editingIndex !== null ? rows[editingIndex]?.product ?? null : null;

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setFormOpen(true);
  };

  const handleNavigate = (direction: "prev" | "next") => {
    if (editingIndex === null) return;
    const nextIndex = direction === "prev" ? editingIndex - 1 : editingIndex + 1;
    if (nextIndex >= 0 && nextIndex < rows.length) setEditingIndex(nextIndex);
  };

  return (
    <AppShell title={t.recipes.title}>
      <div className="space-y-4 p-4 sm:p-6 pb-10">
        <p className="text-sm text-muted-foreground">{t.recipes.subtitle}</p>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <ChefHat className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t.common.noResults}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
            {rows.map(({ product, cost, profit, margin }, index) => (
              <button
                key={product.id}
                onClick={() => handleEdit(index)}
                className="flex w-full items-center justify-between gap-3 bg-card px-4 py-3.5 text-start hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isImageUrl(product.image) ? (
                    <img src={product.image} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="text-lg shrink-0">{product.image}</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{bilingual(product.name, locale)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.products.recipeCost}: {formatMoney(cost, settings.currencySymbol)} · {t.common.price}:{" "}
                      {formatMoney(product.price, settings.currencySymbol)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <p className={cn("text-sm font-bold", profit >= 0 ? "text-success" : "text-destructive")}>
                    {formatMoney(profit, settings.currencySymbol)}
                  </p>
                  <p className={cn("text-xs", margin >= 0 ? "text-muted-foreground" : "text-destructive")}>
                    {margin.toFixed(1)}%
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <ProductFormDialog
        product={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
        onNavigate={handleNavigate}
        hasPrev={editingIndex !== null && editingIndex > 0}
        hasNext={editingIndex !== null && editingIndex < rows.length - 1}
      />
    </AppShell>
  );
}
