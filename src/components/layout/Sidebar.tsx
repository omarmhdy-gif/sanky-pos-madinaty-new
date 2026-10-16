"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { NAV_ITEMS, canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ShopLogo } from "@/components/layout/ShopLogo";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);
  const navItems = NAV_ITEMS.filter((item) => currentUser && canAccess(currentUser, item.href));

  return (
    <aside id="app-sidebar" className={cn("sanky-sidebar hidden shrink-0 flex-col border-e border-white/10 transition-[width] duration-200 md:flex", collapsed ? "w-[4.5rem]" : "w-56")}>
      <div className="flex h-[4.75rem] items-center gap-3 border-b border-white/10 px-3 lg:px-4">
        <ShopLogo className="h-10 w-10 shrink-0 rounded-xl md:hidden" />
        {!collapsed ? (
          <ShopLogo className="hidden h-16 min-w-0 flex-1 rounded-xl md:block" />
        ) : (
          <ShopLogo className="hidden h-10 w-10 shrink-0 rounded-xl md:block" />
        )}
      </div>

      <nav className="no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto p-2.5">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-200",
                collapsed ? "justify-center" : "justify-start",
                active
                  ? "bg-white/[0.11] text-[hsl(42_72%_79%)] shadow-sm ring-1 ring-white/10 before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-[hsl(42_72%_68%)]"
                  : "text-white/65 hover:bg-white/[0.07] hover:text-white"
              )}
              title={t.nav[item.key]}
            >
              <span className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-200",
                active
                  ? "border-[hsl(42_65%_68%/0.28)] bg-[linear-gradient(145deg,hsl(42_58%_68%/0.22),hsl(42_58%_68%/0.08))] text-[hsl(42_78%_78%)] shadow-[inset_0_1px_0_hsl(42_75%_90%/0.12),0_3px_10px_hsl(0_0%_0%/0.12)]"
                  : "border-white/[0.07] bg-white/[0.035] text-white/60 group-hover:border-white/[0.13] group-hover:bg-white/[0.09] group-hover:text-white"
              )}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.15 : 1.85} />
              </span>
              {!collapsed && <span className="min-w-0 truncate">{t.nav[item.key]}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
