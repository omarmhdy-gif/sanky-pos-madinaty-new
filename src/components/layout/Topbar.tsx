"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun, Languages, LogOut, Building2, Repeat, Check, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useI18n, bilingual } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useCartStore } from "@/lib/store/useCartStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
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
    <header className="flex h-[4.5rem] shrink-0 items-center justify-between border-b border-border/80 bg-card/90 px-4 shadow-[0_1px_0_hsl(var(--foreground)/0.025)] backdrop-blur-xl lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="hidden shrink-0 md:inline-flex"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? (locale === "ar" ? "إظهار القائمة الجانبية" : "Expand sidebar") : (locale === "ar" ? "تصغير القائمة الجانبية" : "Collapse sidebar")}
          aria-expanded={!sidebarCollapsed}
          aria-controls="app-sidebar"
          title={sidebarCollapsed ? (locale === "ar" ? "إظهار القائمة الجانبية" : "Expand sidebar") : (locale === "ar" ? "تصغير القائمة الجانبية" : "Collapse sidebar")}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
        <img src="/sanky-brand-mark.png" alt="SANKY" className="h-8 w-8 shrink-0 rounded-lg bg-[#f6eddc] p-0.5 object-contain md:hidden" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{title}</h1>
          {now && (
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight">
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

      <div className="flex items-center gap-2">
        {/* Owner-only, instant branch switch — distinct from the "Switch
            Branch" menu item below, which fully logs out and re-prompts for
            a PIN. This one keeps the owner authenticated and just changes
            currentBranchId; DataBootstrap reactively refetches all
            branch-scoped data when it changes, so no other wiring is needed. */}
        {currentUser?.role === "owner" && branches.length > 1 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" title={t.common.quickSwitchBranch}>
                <Repeat className="h-4.5 w-4.5" />
              </Button>
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
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocale(locale === "en" ? "ar" : "en")}
          title="Language"
        >
          <Languages className="h-4.5 w-4.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Theme">
          {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </Button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 rounded-lg ps-1 pe-2.5 py-1 hover:bg-accent transition-colors">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm ring-2 ring-background",
                  currentUser?.avatarColor ?? "bg-primary"
                )}
              >
                {currentUser?.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden sm:block text-sm font-medium">{currentUser?.name}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1.5 shadow-md animate-fade-in"
            >
              <div className="px-2.5 py-2 text-sm">
                <p className="font-medium">{currentUser?.name}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {currentUser && t.settings.roles[currentUser.role]}
                </p>
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
