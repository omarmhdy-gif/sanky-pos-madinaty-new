"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { canAccess, defaultRouteFor } from "@/lib/permissions";
import { ShopLogo } from "@/components/layout/ShopLogo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

// Auth session is deliberately in-memory only (not persisted) — a refresh
// always forces re-entering a PIN. But the page the user was on shouldn't
// be lost just because of that: the intended path is stashed here right
// before the redirect to /login, and login/page.tsx reads it back after a
// successful PIN to return to the same page instead of the role's default
// route. sessionStorage (not localStorage) since it only needs to survive
// this one reload, per-tab.
export const RETURN_PATH_KEY = "sanky-pos-return-path";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const [checked, setChecked] = useState(false);
  const [noAccess, setNoAccess] = useState(false);

  useEffect(() => {
    if (!currentBranchId) {
      router.replace("/branch-select");
      return;
    }
    if (!isAuthenticated || !currentUser) {
      if (pathname && pathname !== "/login") {
        try {
          sessionStorage.setItem(RETURN_PATH_KEY, pathname);
        } catch {
          // Storage unavailable (private browsing etc.) — just falls back
          // to the role's default route after login, same as before.
        }
      }
      router.replace("/login");
      return;
    }
    if (!canAccess(currentUser, pathname)) {
      const fallback = defaultRouteFor(currentUser);
      if (fallback) {
        router.replace(fallback);
      } else {
        // Pathological: an owner granted this user literally zero
        // permissions. Nothing to redirect to — show a clear message
        // instead of looping.
        setNoAccess(true);
        setChecked(true);
      }
      return;
    }
    // Cashiers can navigate freely without an open shift (e.g. to Attendance
    // or Orders) — only charging an order in POS requires one, gated at that
    // point (see pos/page.tsx's handleCharge), not by blocking navigation.
    setNoAccess(false);
    setChecked(true);
  }, [currentBranchId, isAuthenticated, currentUser, pathname, router]);

  if (noAccess) {
    return (
      <div className="flex h-app w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm font-medium">{t.common.noAccessTitle}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{t.common.noAccessDesc}</p>
        <Button size="sm" variant="outline" onClick={logout}>
          {t.common.logout}
        </Button>
      </div>
    );
  }

  if (!checked) {
    return (
      <div className="flex h-app w-full items-center justify-center bg-background">
        <ShopLogo className="h-10 w-10 rounded-xl animate-pulse" />
      </div>
    );
  }

  return <>{children}</>;
}
