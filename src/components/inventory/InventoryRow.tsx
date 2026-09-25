"use client";

import type { InventoryItem, Locale } from "@/lib/types";
import { bilingual, useI18n } from "@/lib/i18n";
import { stockLevel, STOCK_LEVEL_DOT } from "@/lib/inventory";
import { useDataStore } from "@/lib/store/useDataStore";
import { cn, formatMoney, formatNumber } from "@/lib/utils";

export function InventoryRow({
  item,
  locale,
  showCost,
  children,
}: {
  item: InventoryItem;
  locale: Locale;
  showCost?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const settings = useDataStore((s) => s.settings);
  const level = stockLevel(item);
  return (
    <div className="flex items-center justify-between gap-3 p-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STOCK_LEVEL_DOT[level])} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{bilingual(item.name, locale)}</p>
          <p className="text-xs text-muted-foreground">
            {formatNumber(item.quantity, 0, 3)} {item.unit ?? "pc"}
          </p>
          {showCost && item.lastPurchaseCost != null && (
            <p className="text-xs text-muted-foreground">
              {t.inventory.lastPurchaseCost}: {formatMoney(item.lastPurchaseCost, settings.currencySymbol)}
            </p>
          )}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  );
}
