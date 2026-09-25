"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Moon, Sun, Languages } from "lucide-react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { verifyStaffPin } from "@/lib/supabase/api";
import { canAccess, defaultRouteFor } from "@/lib/permissions";
import { RETURN_PATH_KEY } from "@/components/auth/AuthGuard";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ShopLogo } from "@/components/layout/ShopLogo";
import type { StaffUser } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const staff = useDataStore((s) => s.staff);
  const login = useAuthStore((s) => s.login);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleSelect = (user: StaffUser) => {
    setSelected(user);
    setPin("");
  };

  const handleDigit = (d: string) => {
    if (!selected || verifying) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => attemptLogin(next), 150);
    }
  };

  const attemptLogin = async (candidate: string) => {
    if (!selected || !currentBranchId) return;
    setVerifying(true);
    try {
      const user = await verifyStaffPin(selected.id, candidate, currentBranchId);
      if (user) {
        login(user);
        let returnPath: string | null = null;
        try {
          returnPath = sessionStorage.getItem(RETURN_PATH_KEY);
          sessionStorage.removeItem(RETURN_PATH_KEY);
        } catch {
          // Storage unavailable — falls through to the default route below.
        }
        // If this user has zero accessible pages (an owner granted them
        // nothing), still route into an AppShell page so AuthGuard's
        // "no access" screen (with a Log out button) renders instead of
        // silently doing nothing.
        const fallback = defaultRouteFor(user) ?? "/dashboard";
        router.replace(returnPath && canAccess(user, returnPath) ? returnPath : fallback);
        return;
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Login failed", "error");
    } finally {
      setVerifying(false);
    }
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPin("");
    }, 400);
  };

  return (
    <div className="flex h-app w-full flex-col bg-gradient-to-br from-espresso-50 to-amber-50 dark:from-background dark:to-background">
      <header className="flex items-center justify-between p-5">
        <div className="flex items-center gap-2.5">
          <ShopLogo className="h-10 w-10 rounded-xl" />
          <div>
            <p className="font-semibold leading-tight">{t.app.name}</p>
            <p className="text-xs text-muted-foreground leading-tight">{t.app.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocale(locale === "en" ? "ar" : "en")}
            title="Toggle language"
          >
            <Languages className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
        <div className="mb-8 text-center animate-fade-in">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.login.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.login.subtitle}</p>
        </div>

        {!selected ? (
          <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
            {staff
              .filter((s) => s.isActive)
              .map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelect(user)}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95"
                >
                  <div
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white",
                      user.avatarColor
                    )}
                  >
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">{user.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {t.settings.roles[user.role]}
                    </p>
                  </div>
                </button>
              ))}
          </div>
        ) : (
          <div className={cn("flex w-full max-w-xs flex-col items-center gap-6", shake && "animate-shake")}>
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white",
                  selected.avatarColor
                )}
              >
                {selected.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <p className="font-semibold">{selected.name}</p>
              <p className="text-xs text-muted-foreground">{t.login.enterPin}</p>
            </div>

            <div className="flex gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2 transition-colors",
                    pin.length > i ? "border-primary bg-primary" : "border-border"
                  )}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-xl font-semibold shadow-sm transition-transform active:scale-90"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => setSelected(null)}
                className="flex h-16 w-16 items-center justify-center rounded-2xl text-xs font-medium text-muted-foreground"
              >
                {t.common.back}
              </button>
              <button
                onClick={() => handleDigit("0")}
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-xl font-semibold shadow-sm transition-transform active:scale-90"
              >
                0
              </button>
              <button
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="flex h-16 w-16 items-center justify-center rounded-2xl text-muted-foreground"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
