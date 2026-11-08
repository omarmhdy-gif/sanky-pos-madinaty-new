"use client";

import { Search, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
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
  onOpenOrders,
}: {
  categories: Category[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onOpenOrders: () => void;
}) {
  const { t, locale } = useI18n();
  const held = useHeldOrdersStore((s) => s.held);
  const [today, setToday] = useState(() => localDayKey(new Date()));

  useEffect(() => {
    const refreshDay = () => setToday(localDayKey(new Date()));
    const timer = window.setInterval(refreshDay, 60_000);
    window.addEventListener("focus", refreshDay);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDay);
    };
  }, []);

  const heldCount = held.filter((order) => localDayKey(new Date(order.createdAt)) === today).length;

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-card/70 p-3 sm:px-4 sm:py-3 lg:gap-3 lg:px-5 lg:py-4">
      <div className="flex gap-2 lg:gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground lg:start-4 lg:h-5 lg:w-5" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t.pos.searchProducts}
            className="ps-9 h-11 text-sm lg:h-12 lg:ps-11 lg:text-base"
          />
        </div>
        <button
          onClick={onOpenOrders}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-accent/40 hover:shadow-md lg:h-12 lg:w-12"
          title={t.pos.orderManagement}
          aria-label={t.pos.orderManagement}
        >
          <ReceiptText className="h-5 w-5 text-muted-foreground lg:h-6 lg:w-6" />
          {heldCount > 0 && (
            <span className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {heldCount > 99 ? "99+" : heldCount}
            </span>
          )}
        </button>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 lg:gap-2.5">
        <button
          onClick={() => onSelect("all")}
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-200 lg:px-5 lg:py-2.5 lg:text-sm",
            activeId === "all"
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border/80 bg-card/80 text-muted-foreground hover:border-primary/20 hover:bg-accent/50 hover:text-accent-foreground"
          )}
        >
          {t.common.all}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-200 lg:px-5 lg:py-2.5 lg:text-sm",
              activeId === c.id
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border/80 bg-card/80 text-muted-foreground hover:border-primary/20 hover:bg-accent/50 hover:text-accent-foreground"
            )}
          >
            {bilingual(c.name, locale)}
          </button>
        ))}
      </div>
    </div>
  );
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
