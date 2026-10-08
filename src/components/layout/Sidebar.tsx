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
    <aside id="app-sidebar" className={cn("sanky-sidebar hidden shrink-0 flex-col border-e border-white/10 transition-[width] duration-200 md:flex md:w-[4.5rem]", collapsed ? "lg:w-[4.5rem]" : "lg:w-56")}>
      <div className="flex h-[4.5rem] items-center gap-3 px-3 lg:px-4 border-b border-white/10">
        <ShopLogo className="h-10 w-10 shrink-0 rounded-xl ring-1 ring-white/15" />
        {!collapsed && <span className="hidden lg:block font-semibold text-sm tracking-wide truncate">{t.app.name}</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 p-2.5">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                collapsed ? "lg:justify-center justify-center" : "lg:justify-start justify-center",
                active
                  ? "bg-white/10 text-[hsl(42_58%_76%)] shadow-sm ring-1 ring-white/10"
                  : "text-white/65 hover:bg-white/[0.07] hover:text-white"
              )}
              title={t.nav[item.key]}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="hidden lg:block truncate">{t.nav[item.key]}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
