"use client";

import type { Product } from "@/lib/types";
import { useI18n, bilingual } from "@/lib/i18n";
import { useDataStore } from "@/lib/store/useDataStore";
import { formatMoney, cn, isImageUrl } from "@/lib/utils";
import { productAvailableQty } from "@/lib/inventory";
import { PackageX, Star } from "lucide-react";

export function ProductGrid({
  products,
  onSelect,
  favoriteIds = [],
  onToggleFavorite,
}: {
  products: Product[];
  onSelect: (p: Product) => void;
  favoriteIds?: string[];
  onToggleFavorite?: (productId: string) => void;
}) {
  const { t, locale } = useI18n();
  const currencySymbol = useDataStore((s) => s.settings.currencySymbol);
  const inventoryItems = useDataStore((s) => s.inventoryItems);

  if (products.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
        <PackageX className="h-10 w-10 opacity-40" />
        <p className="text-sm">{t.common.noResults}</p>
      </div>
    );
  }

  return (
    // lg is the primary target here (iPad landscape, ~1024-1280px) — it
    // deliberately gets FEWER columns than a naive "more space = more
    // columns" scaling would give it (4, not 5+), because the point of
    // freeing up width from the sidebar/cart is bigger, more comfortable
    // cards on the device cashiers actually use, not just more of them.
    <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:gap-4 sm:p-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6 lg:p-5 xl:grid-cols-5">
      {products.map((p) => {
        const availableQty = productAvailableQty(p, inventoryItems);
        // Informational only — selling out-of-stock ingredients is allowed
        // and expected (inventory is permitted to go negative), so the
        // product card is never disabled, just labeled.
        const outOfStock = availableQty !== null && availableQty <= 0;
        const isFav = favoriteIds.includes(p.id);
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="group relative flex flex-col items-start gap-1.5 overflow-hidden rounded-2xl border border-border bg-card p-3.5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.96] md:p-4 lg:gap-2 lg:rounded-3xl lg:p-5"
          >
            {onToggleFavorite && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(p.id);
                }}
                className="absolute end-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm lg:end-3 lg:top-3 lg:h-9 lg:w-9"
              >
                <Star className={cn("h-4 w-4 lg:h-4.5 lg:w-4.5", isFav ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              </span>
            )}
            <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-md bg-muted text-4xl sm:h-20 sm:text-5xl lg:h-28 lg:rounded-xl lg:text-6xl">
              {isImageUrl(p.image) ? (
                <img src={p.image} alt="" className="h-full w-full object-cover" />
              ) : (
                p.image || "☕"
              )}
            </div>
            <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight lg:min-h-[2.75rem] lg:text-base">
              {bilingual(p.name, locale)}
            </p>
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-bold text-primary lg:text-lg">
                {formatMoney(p.price, currencySymbol)}
              </span>
              {availableQty !== null && (
                <span className={cn("text-[10px] lg:text-xs", outOfStock ? "font-semibold text-destructive" : "text-muted-foreground")}>
                  {outOfStock ? "Out of stock" : `${availableQty} left`}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
