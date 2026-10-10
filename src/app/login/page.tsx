"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Moon, Sun, Languages } from "lucide-react";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { authenticateStaffPin } from "@/lib/supabase/api";
import { canAccess, defaultRouteFor } from "@/lib/permissions";
import { RETURN_PATH_KEY } from "@/components/auth/AuthGuard";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");
  const loginAttemptInFlight = useRef(false);

  const handleDigit = (d: string) => {
    if (loginAttemptInFlight.current || welcomeName) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => attemptLogin(next), 150);
    }
  };

  const attemptLogin = async (candidate: string) => {
    if (!currentBranchId || loginAttemptInFlight.current) return;
    loginAttemptInFlight.current = true;
    setVerifying(true);
    let authenticated = false;
    try {
      const user = await authenticateStaffPin(candidate, currentBranchId);
      if (user) {
        authenticated = true;
        login(user);
        setWelcomeName(user.name);
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
        const destination = returnPath && canAccess(user, returnPath) ? returnPath : fallback;
        window.setTimeout(() => router.replace(destination), 900);
        return;
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Login failed", "error");
      return;
    } finally {
      setVerifying(false);
      if (!authenticated) loginAttemptInFlight.current = false;
    }
    toast(locale === "ar" ? "الكود غير صحيح" : "Incorrect PIN", "error");
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPin("");
    }, 400);
  };

  return (
    <div className="relative isolate flex h-app w-full flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-amber-100 via-orange-50 to-stone-100 dark:from-stone-900 dark:via-neutral-950 dark:to-amber-950">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-orange-300/25 blur-3xl dark:bg-orange-500/10" />
      <header className="relative z-10 flex justify-end p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/65 p-1.5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/25">
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

      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-0 sm:px-6 sm:py-0">
        <section className="my-auto w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/80 px-6 py-[clamp(0.6rem,1.8dvh,1.25rem)] shadow-[0_24px_80px_-28px_rgba(91,53,24,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/80 sm:px-10">
          <div className="mb-[clamp(0.65rem,2.2dvh,1.25rem)] flex flex-col items-center text-center">
            <p className="text-3xl font-extrabold tracking-tight text-espresso-900 dark:text-amber-50">{t.app.name}</p>
            <p className="mt-1 text-sm text-muted-foreground max-[700px]:hidden">{t.app.tagline}</p>
            <div className="mt-5 h-px w-16 bg-gradient-to-r from-transparent via-amber-700/50 to-transparent dark:via-amber-300/50" />
            {welcomeName ? (
              <div className="mt-5 animate-fade-in text-center" role="status" aria-live="polite">
                <h1 className="text-2xl font-bold">{locale === "ar" ? `مرحبًا ${welcomeName}` : `Welcome, ${welcomeName}`}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{locale === "ar" ? "جاري الدخول..." : "Signing in..."}</p>
              </div>
            ) : (
              <div className="mt-5 text-center">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t.login.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t.login.subtitle}</p>
              </div>
            )}
          </div>

          {!welcomeName && (
            <div className={cn("flex flex-col items-center gap-4", shake && "animate-shake")}>
              <div className="flex gap-3" aria-label={`${pin.length} of 4 digits entered`}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={cn("h-3.5 w-3.5 rounded-full border-2 transition-all", pin.length > i ? "scale-110 border-amber-700 bg-amber-700 dark:border-amber-300 dark:bg-amber-300" : "border-stone-300 dark:border-stone-600")} />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <button key={d} onClick={() => handleDigit(d)} disabled={verifying} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl border border-amber-900/10 bg-amber-50/80 text-xl font-semibold text-espresso-900 shadow-sm transition-all hover:border-amber-700/30 hover:bg-amber-100 active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-amber-50 dark:hover:bg-white/10">
                    {d}
                  </button>
                ))}
                <button disabled={verifying || pin.length === 0} onClick={() => setPin("")} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">
                  {locale === "ar" ? "مسح" : "Clear"}
                </button>
                <button disabled={verifying} onClick={() => handleDigit("0")} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl border border-amber-900/10 bg-amber-50/80 text-xl font-semibold text-espresso-900 shadow-sm transition-all hover:border-amber-700/30 hover:bg-amber-100 active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-amber-50 dark:hover:bg-white/10">
                  0
                </button>
                <button disabled={verifying || pin.length === 0} onClick={() => setPin((p) => p.slice(0, -1))} aria-label={locale === "ar" ? "حذف آخر رقم" : "Delete last digit"} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">
                  <Delete className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
