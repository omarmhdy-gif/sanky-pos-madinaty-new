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
import { useDataStore } from "@/lib/store/useDataStore";
import { checkShopSubscription, type ShopSubscription } from "@/lib/shopSubscription";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const businessName = useDataStore((s) => s.settings.shopName.trim());
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [subscription, setSubscription] = useState<ShopSubscription | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!currentBranchId) {
      setSubscription(null);
      return;
    }

    let mounted = true;
    const refreshSubscription = () => {
      void checkShopSubscription().then((current) => {
        if (mounted) setSubscription(current);
      });
    };

    refreshSubscription();
    const interval = window.setInterval(refreshSubscription, 5 * 60 * 1000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshSubscription();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentBranchId]);

  const subscriptionLabel = (() => {
    if (!subscription) return null;
    if (subscription.state === "suspended") return t.common.subscriptionSuspendedLabel;
    if (subscription.state === "unlinked") return t.common.subscriptionUnlinkedLabel;
    if (subscription.state === "unavailable") return t.common.subscriptionUnavailableLabel;
    if (subscription.state === "expired") {
      return subscription.daysRemaining !== null && subscription.daysRemaining < 0
        ? t.common.subscriptionExpiredDaysAgo.replace("{days}", String(Math.abs(subscription.daysRemaining)))
        : t.common.subscriptionExpiredLabel;
    }
    if (subscription.daysRemaining === null) return t.common.subscriptionNoExpiry;
    if (subscription.daysRemaining === 0) return t.common.subscriptionExpiresToday;
    return t.common.subscriptionDaysRemaining.replace("{days}", String(subscription.daysRemaining));
  })();
  const subscriptionTone = subscription?.state === "expired" || subscription?.state === "suspended" || subscription?.state === "unlinked"
    ? "border-destructive/25 bg-destructive/10 text-destructive"
    : subscription?.state === "unavailable" || (subscription?.daysRemaining !== null && subscription?.daysRemaining !== undefined && subscription.daysRemaining >= 0 && subscription.daysRemaining <= 7)
      ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

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
    <header className="relative z-20 flex h-[4.5rem] shrink-0 items-center justify-between border-b border-border/70 bg-card/90 px-3 shadow-sm backdrop-blur-xl sm:px-5 lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="hidden h-9 w-9 shrink-0 rounded-xl border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-muted/70 hover:text-foreground md:inline-flex"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? (locale === "ar" ? "إظهار القائمة الجانبية" : "Expand sidebar") : (locale === "ar" ? "تصغير القائمة الجانبية" : "Collapse sidebar")}
          aria-expanded={!sidebarCollapsed}
          aria-controls="app-sidebar"
          title={sidebarCollapsed ? (locale === "ar" ? "إظهار القائمة الجانبية" : "Expand sidebar") : (locale === "ar" ? "تصغير القائمة الجانبية" : "Collapse sidebar")}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
        <img src="/nova-mark-transparent.svg" alt="NOVA" className="h-8 w-8 shrink-0 object-contain md:hidden" />
        <div className="min-w-0">
          {businessName && <p className="mb-0.5 max-w-48 truncate text-[9px] font-semibold leading-none text-primary sm:hidden">{businessName}</p>}
          <h1 className="truncate font-sans text-[15px] font-semibold leading-tight tracking-tight sm:text-lg">{title}</h1>
          {now && (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted/65 px-2 py-0.5 text-[10px] leading-tight text-muted-foreground sm:text-[11px]">
              <Clock3 className="h-3 w-3 text-primary/80" />
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

      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Owner-only, instant branch switch — distinct from the "Switch
            Branch" menu item below, which fully logs out and re-prompts for
            a PIN. This one keeps the owner authenticated and just changes
            currentBranchId; DataBootstrap reactively refetches all
            branch-scoped data when it changes, so no other wiring is needed. */}
        {currentBranch && (currentUser?.role === "owner" && branches.length > 1 ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" title={`${t.common.quickSwitchBranch} · ${subscriptionLabel ?? ""}`} className="group hidden max-w-80 items-center gap-2 rounded-full px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted/55 sm:flex">
                <Store className="h-4 w-4 shrink-0 text-primary/85 transition-colors group-hover:text-primary" />
                <span className="flex min-w-0 flex-col">
                  {businessName && <span className="max-w-44 truncate text-[13px] font-semibold leading-tight text-foreground">{businessName}</span>}
                  <span className={cn("max-w-44 truncate leading-tight", businessName ? "text-[10px] text-muted-foreground" : "text-sm font-semibold text-foreground")}>{bilingual(currentBranch.name, locale)}</span>
                </span>
                {subscriptionLabel && subscription?.state !== "checking" && (
                  <span className={cn("inline-flex max-w-36 shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none", subscriptionTone)}>
                    <Clock3 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{subscriptionLabel}</span>
                  </span>
                )}
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
          <div title={subscriptionLabel ?? undefined} className="hidden max-w-80 items-center gap-2 rounded-full px-2 py-1.5 text-sm sm:flex">
            <Store className="h-4 w-4 shrink-0 text-primary/85" />
            <span className="flex min-w-0 flex-col">
              {businessName && <span className="max-w-44 truncate text-[13px] font-semibold leading-tight text-foreground">{businessName}</span>}
              <span className={cn("max-w-44 truncate leading-tight", businessName ? "text-[10px] text-muted-foreground" : "text-sm font-semibold text-foreground")}>{bilingual(currentBranch.name, locale)}</span>
            </span>
            {subscriptionLabel && subscription?.state !== "checking" && (
              <span className={cn("inline-flex max-w-36 shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none", subscriptionTone)}>
                <Clock3 className="h-3 w-3 shrink-0" />
                <span className="truncate">{subscriptionLabel}</span>
              </span>
            )}
          </div>
        ))}
        <span className="mx-1 hidden h-7 w-px bg-border/70 sm:block" aria-hidden="true" />
        <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full text-foreground/70 transition-colors hover:bg-muted/65 hover:text-primary"
          onClick={() => setLocale(locale === "en" ? "ar" : "en")}
          aria-label={locale === "en" ? "التبديل إلى العربية" : "Switch to English"}
          title={locale === "en" ? "العربية" : "English"}
        >
          <Globe2 className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <span aria-hidden="true" className="absolute -bottom-0.5 -end-0.5 min-w-4 rounded-full border border-background bg-primary px-1 text-[8px] font-bold leading-[14px] text-primary-foreground">
            {locale === "en" ? "ع" : "EN"}
          </span>
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-foreground/70 transition-colors hover:bg-muted/65 hover:text-primary" onClick={toggleTheme} aria-label={locale === "ar" ? "تبديل السمة" : "Toggle theme"} title={locale === "ar" ? "تبديل السمة" : "Toggle theme"}>
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </Button>
        </div>

        <span className="mx-1 hidden h-7 w-px bg-border/70 sm:block" aria-hidden="true" />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label={currentUser ? `${currentUser.name}, ${t.settings.roles[currentUser.role]}` : (locale === "ar" ? "حساب المستخدم" : "User account")} className="group flex items-center gap-2 rounded-full px-1 py-1 transition-colors hover:bg-muted/55 sm:ps-1 sm:pe-2">
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
