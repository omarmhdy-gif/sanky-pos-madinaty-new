"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun, Globe2, LogOut, Building2, Check, PanelLeftClose, PanelLeftOpen, ChevronDown, Store, Clock3 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useI18n, bilingual } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useCartStore } from "@/lib/store/useCartStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShopLogo } from "@/components/layout/ShopLogo";
import { SyncButton } from "@/components/layout/SyncButton";

export function Topbar({ title, sidebarCollapsed, onToggleSidebar }: { title: string; sidebarCollapsed: boolean; onToggleSidebar: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { currentUser, logout } = useAuthStore();
  const clearCart = useCartStore((s) => s.clearCart);
  const clearBranch = useBranchStore((s) => s.clearBranch);
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const currentBranch = branches.find((branch) => branch.id === currentBranchId);
  const setBranch = useBranchStore((s) => s.setBranch);
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  const handleLogout = () => {
    logout();
    clearCart();
    router.replace("/login");
  };

  const handleSwitchBranch = () => {
    logout();
    clearCart();
    clearBranch();
    router.replace("/branch-select");
  };

  return (
    <header className="relative z-20 flex h-[4.5rem] shrink-0 items-center justify-between border-b border-border/70 bg-card px-3 sm:px-5 lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="hidden h-9 w-9 shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:inline-flex"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? (locale === "ar" ? "إظهار القائمة الجانبية" : "Expand sidebar") : (locale === "ar" ? "تصغير القائمة الجانبية" : "Collapse sidebar")}
          aria-expanded={!sidebarCollapsed}
          aria-controls="app-sidebar"
          title={sidebarCollapsed ? (locale === "ar" ? "إظهار القائمة الجانبية" : "Expand sidebar") : (locale === "ar" ? "تصغير القائمة الجانبية" : "Collapse sidebar")}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
        <ShopLogo className="h-8 w-8 shrink-0 rounded-lg md:hidden" />
        <div className="min-w-0">
          <h1 className="truncate font-sans text-base font-semibold leading-tight tracking-tight sm:text-lg">{title}</h1>
          {now && (
            <p className="mt-1 flex items-center gap-1.5 text-[10px] leading-tight text-muted-foreground sm:text-[11px]">
            <Clock3 className="h-3 w-3" />
            {now.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}{" "}
            ·{" "}
            {now.toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2.5">
        <SyncButton />
        {/* Owner-only, instant branch switch — distinct from the "Switch
            Branch" menu item below, which fully logs out and re-prompts for
            a PIN. This one keeps the owner authenticated and just changes
            currentBranchId; DataBootstrap reactively refetches all
            branch-scoped data when it changes, so no other wiring is needed. */}
        {currentBranch && (currentUser?.role === "owner" && branches.length > 1 ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" title={t.common.quickSwitchBranch} className="hidden max-w-52 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-start text-sm transition-colors hover:bg-accent sm:flex">
                <Store className="h-4 w-4 shrink-0 text-primary" />
                <span className="max-w-36 truncate font-medium">{bilingual(currentBranch.name, locale)}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1.5 shadow-md animate-fade-in"
              >
                <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                  {t.common.quickSwitchBranch}
                </div>
                {branches.map((b) => (
                  <DropdownMenu.Item
                    key={b.id}
                    onClick={() => setBranch(b.id)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm outline-none hover:bg-accent"
                  >
                    {bilingual(b.name, locale)}
                    {b.id === currentBranchId && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : (
          <div className="hidden items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm sm:flex">
            <Store className="h-4 w-4 text-primary" />
            <span className="max-w-36 truncate font-medium">{bilingual(currentBranch.name, locale)}</span>
          </div>
        ))}
        <div className="flex items-center gap-0.5 rounded-xl border border-border/80 bg-background/60 p-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-10 rounded-lg text-foreground/75 transition-colors hover:bg-accent hover:text-primary"
          onClick={() => setLocale(locale === "en" ? "ar" : "en")}
          aria-label={locale === "en" ? "التبديل إلى العربية" : "Switch to English"}
          title={locale === "en" ? "العربية" : "English"}
        >
          <Globe2 className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <span aria-hidden="true" className="absolute -bottom-0.5 -end-0.5 min-w-4 rounded-full border border-background bg-primary px-1 text-[8px] font-bold leading-[14px] text-primary-foreground">
            {locale === "en" ? "ع" : "EN"}
          </span>
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={toggleTheme} aria-label={locale === "ar" ? "تبديل السمة" : "Toggle theme"} title={locale === "ar" ? "تبديل السمة" : "Toggle theme"}>
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </Button>
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label={currentUser ? `${currentUser.name}, ${t.settings.roles[currentUser.role]}` : (locale === "ar" ? "حساب المستخدم" : "User account")} className="group flex items-center gap-2 rounded-xl border border-transparent bg-background/50 py-1 ps-1 pe-1.5 transition-all hover:border-border hover:bg-accent/70 sm:pe-2.5">
              <div
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ring-2 ring-background transition-transform group-hover:scale-[1.03]",
                  currentUser?.avatarColor ?? "bg-primary"
                )}
              >
                {currentUser?.name.slice(0, 2).toUpperCase()}
                <span aria-hidden="true" className="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
              </div>
              <span className="hidden min-w-0 text-start sm:block">
                <span className="block max-w-28 truncate text-sm font-semibold leading-tight">{currentUser?.name}</span>
                <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{currentUser && t.settings.roles[currentUser.role]}</span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-[220px] rounded-xl border border-border bg-popover p-1.5 shadow-xl animate-fade-in"
            >
              <div className="flex items-center gap-3 px-2.5 py-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-white", currentUser?.avatarColor ?? "bg-primary")}>{currentUser?.name.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0 text-sm">
                <p className="truncate font-semibold">{currentUser?.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {currentUser && t.settings.roles[currentUser.role]}
                </p>
                </div>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              {currentUser?.role === "owner" && (
                <DropdownMenu.Item
                  onClick={handleSwitchBranch}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none hover:bg-accent"
                >
                  <Building2 className="h-4 w-4" />
                  {t.common.switchBranch}
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                onClick={handleLogout}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-destructive outline-none hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                {t.common.logout}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

    </header>
  );
}
