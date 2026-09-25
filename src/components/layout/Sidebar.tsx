"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { NAV_ITEMS, canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ShopLogo } from "@/components/layout/ShopLogo";

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);
  const navItems = NAV_ITEMS.filter((item) => currentUser && canAccess(currentUser, item.href));

  return (
    <aside className="hidden md:flex md:w-16 lg:w-48 shrink-0 flex-col border-e border-border bg-card">
      <div className="flex h-16 items-center gap-2 px-3 lg:px-4 border-b border-border">
        <ShopLogo className="h-8 w-8 shrink-0 rounded-lg" />
        <span className="hidden lg:block font-semibold text-sm truncate">{t.app.name}</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2.5">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                "lg:justify-start justify-center",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              title={t.nav[item.key]}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block truncate">{t.nav[item.key]}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
