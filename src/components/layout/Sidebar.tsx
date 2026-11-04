"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { NAV_ITEMS, canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const currentPath = pathname.replace(/\/+$/, "") || "/";
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);
  const navItems = NAV_ITEMS.filter((item) => currentUser && canAccess(currentUser, item.href));

  return (
    <aside id="app-sidebar" className={cn("sanky-sidebar hidden shrink-0 flex-col border-e border-border/70 transition-[width] duration-200 md:flex", collapsed ? "w-[4.5rem]" : "w-56")}>
      <div className={cn("flex h-[4.5rem] items-center border-b border-border/70 px-3 lg:px-4", collapsed ? "justify-center" : "gap-3")}>
        <img src="/nova-mark-transparent.svg" alt="NOVA" className="h-10 w-10 shrink-0 object-contain" />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-[0.16em] text-[hsl(42_29%_93%)]">NOVA</p>
            <p className="truncate text-[8px] font-medium leading-3 tracking-wide text-white/55">Next-Gen Operations · Virtual Automation</p>
          </div>
        )}
      </div>

      <nav className="no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto p-2.5">
        {navItems.map((item) => {
          const itemPath = item.href.replace(/\/+$/, "") || "/";
          const active = currentPath === itemPath;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex min-h-12 items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-medium transition-all duration-200",
                collapsed ? "justify-center" : "justify-start",
                active
                  ? "bg-white/[0.055] font-semibold text-white before:absolute before:inset-y-3 before:start-0 before:w-[2px] before:rounded-full before:bg-[hsl(148_58%_68%)]"
                  : "text-white/65 hover:bg-white/[0.045] hover:text-white"
              )}
              title={t.nav[item.key]}
              aria-current={active ? "page" : undefined}
            >
              <span className={cn(
                "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] transition-all duration-200",
                active
                  ? "bg-[hsl(148_40%_43%/0.24)] text-[hsl(148_68%_76%)] ring-1 ring-white/[0.08]"
                  : "bg-white/[0.025] text-white/65 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.035)] ring-1 ring-white/[0.035] transition-transform group-hover:scale-[1.04] group-hover:bg-[hsl(148_28%_50%/0.11)] group-hover:text-[hsl(145_42%_84%)] group-hover:ring-[hsl(148_40%_75%/0.12)]"
              )}>
                <Icon className="h-[22px] w-[22px] drop-shadow-sm" strokeWidth={active ? 2.1 : 1.9} />
              </span>
              {!collapsed && <span className="min-w-0 truncate">{t.nav[item.key]}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
