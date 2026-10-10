"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { NAV_ITEMS, canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);
  const navItems = NAV_ITEMS.filter((item) => currentUser && canAccess(currentUser, item.href));

  return (
    <aside id="app-sidebar" className={cn("sanky-sidebar hidden shrink-0 flex-col border-e border-white/10 transition-[width] duration-200 md:flex md:w-[4.5rem]", collapsed ? "lg:w-[4.5rem]" : "lg:w-56")}>
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-3 lg:px-4">
        <img
          src="/sanky-brand-mark.png"
          alt="SANKY"
          className="h-10 w-10 shrink-0 rounded-xl bg-[#f6eddc] p-1 object-contain lg:hidden"
        />
        {!collapsed ? (
          <img
            src="/sanky-brand-lockup.png"
            alt="SANKY"
            className="hidden h-16 min-w-0 flex-1 rounded-xl bg-[#f6eddc] px-2 object-contain object-left lg:block"
          />
        ) : (
          <img
            src="/sanky-brand-mark.png"
            alt="SANKY"
            className="hidden h-10 w-10 shrink-0 rounded-xl bg-[#f6eddc] p-1 object-contain lg:block"
          />
        )}
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
