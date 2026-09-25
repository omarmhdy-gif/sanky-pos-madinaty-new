"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { NAV_ITEMS, canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// Keep the mobile bar to a handful of items for tap-target size. Whoever's
// logged in might now have anywhere from 1 to 11 accessible pages (granular
// permissions, not just a fixed owner/cashier split) — if everything they
// can reach fits in 5 slots, show it all directly; otherwise show this
// curated subset + a "More" sheet for the rest, same as owners always did.
const PREFERRED_BAR_KEYS: (typeof NAV_ITEMS)[number]["key"][] = ["dashboard", "orders", "inventory", "finance"];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [moreOpen, setMoreOpen] = useState(false);

  const accessibleItems = NAV_ITEMS.filter((item) => currentUser && canAccess(currentUser, item.href));
  const fitsInBar = accessibleItems.length <= 5;
  const barItems = fitsInBar
    ? accessibleItems
    : accessibleItems.filter((item) => PREFERRED_BAR_KEYS.includes(item.key));
  const moreItems = fitsInBar ? [] : accessibleItems.filter((item) => !PREFERRED_BAR_KEYS.includes(item.key));
  const moreActive = moreItems.some((item) => item.href === pathname);

  return (
    <>
      <nav className="md:hidden flex items-center justify-around border-t border-border bg-card px-1 py-1.5 shrink-0">
        {barItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          const isCenter = item.key === "pos";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors min-w-[56px]",
                isCenter && "-mt-4",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center rounded-full",
                  isCenter ? "h-12 w-12 bg-primary text-primary-foreground shadow-lg" : "h-6 w-6",
                  active && !isCenter && "bg-accent"
                )}
              >
                <Icon className={cn(isCenter ? "h-5 w-5" : "h-4.5 w-4.5")} />
              </span>
              <span>{t.nav[item.key]}</span>
            </Link>
          );
        })}
        {!fitsInBar && (
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors min-w-[56px]",
              moreActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-full", moreActive && "bg-accent")}>
              <MoreHorizontal className="h-4.5 w-4.5" />
            </span>
            <span>{t.common.more}</span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 flex items-end bg-black/50"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl bg-background p-4 pb-6 shadow-xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <div className="grid grid-cols-4 gap-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl p-3 text-[11px] font-medium",
                      active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-center leading-tight">{t.nav[item.key]}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
