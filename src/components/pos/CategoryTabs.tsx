"use client";

import { Search, PauseCircle, Star, History } from "lucide-react";
import type { Category } from "@/lib/types";
import { useI18n, bilingual } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useHeldOrdersStore } from "@/lib/store/useHeldOrdersStore";

export function CategoryTabs({
  categories,
  activeId,
  onSelect,
  search,
  onSearchChange,
  onOpenHeld,
}: {
  categories: Category[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onOpenHeld: () => void;
}) {
  const { t, locale } = useI18n();
  const heldCount = useHeldOrdersStore((s) => s.held.length);

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-card/50 p-3 sm:p-4 lg:gap-4 lg:p-5">
      <div className="flex gap-2 lg:gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground lg:start-4 lg:h-5 lg:w-5" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t.pos.searchProducts}
            className="ps-9 h-12 text-base lg:h-14 lg:ps-11 lg:text-base"
          />
        </div>
        <button
          onClick={onOpenHeld}
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card hover:bg-accent lg:h-14 lg:w-14 lg:rounded-xl"
          title={t.pos.heldOrders}
        >
          <PauseCircle className="h-5 w-5 text-muted-foreground lg:h-6 lg:w-6" />
          {heldCount > 0 && (
            <span className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {heldCount}
            </span>
          )}
        </button>
      </div>
      <div className="grid grid-flow-col grid-rows-2 auto-cols-max gap-2 lg:gap-3 overflow-x-auto no-scrollbar pb-0.5">
        <button
          onClick={() => onSelect("all")}
          className={cn(
            "shrink-0 rounded-full px-4.5 py-2.5 lg:px-7 lg:py-3.5 text-sm font-medium transition-colors border lg:text-base",
            activeId === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:bg-accent"
          )}
        >
          {t.common.all}
        </button>
        <button
          onClick={() => onSelect("favorites")}
          className={cn(
            "shrink-0 flex items-center gap-1.5 rounded-full px-4.5 py-2.5 lg:gap-2 lg:px-7 lg:py-3.5 text-sm font-medium transition-colors border lg:text-base",
            activeId === "favorites"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:bg-accent"
          )}
        >
          <Star className="h-3.5 w-3.5 lg:h-4.5 lg:w-4.5" />
          {t.pos.favorites}
        </button>
        <button
          onClick={() => onSelect("recent")}
          className={cn(
            "shrink-0 flex items-center gap-1.5 rounded-full px-4.5 py-2.5 lg:gap-2 lg:px-7 lg:py-3.5 text-sm font-medium transition-colors border lg:text-base",
            activeId === "recent"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:bg-accent"
          )}
        >
          <History className="h-3.5 w-3.5 lg:h-4.5 lg:w-4.5" />
          {t.pos.recent}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={cn(
              "shrink-0 rounded-full px-4.5 py-2.5 lg:px-7 lg:py-3.5 text-sm font-medium transition-colors border lg:text-base",
              activeId === c.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-accent"
            )}
          >
            {bilingual(c.name, locale)}
          </button>
        ))}
      </div>
    </div>
  );
}
