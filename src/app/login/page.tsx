"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Moon, Sun, Languages, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { authenticateShopOwner, authenticateStaffPin, verifyShopAccount } from "@/lib/supabase/api";
import { clearShopAccountNumber, getShopAccountNumber, setShopAccountNumber, supabase } from "@/lib/supabase/client";
import { canAccess, defaultRouteFor } from "@/lib/permissions";
import { RETURN_PATH_KEY } from "@/components/auth/AuthGuard";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type WebMode = "login" | "forgot";

const DEVICE_ID_STORAGE_KEY = "sanky-pos-device-uuid";
const DEVICE_NAME_STORAGE_KEY = "sanky-pos-device-name";
function getDeviceUuid() {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) return existing;
    const generated = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return window.crypto.randomUUID();
  }
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const setBranch = useBranchStore((s) => s.setBranch);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const fetchBranches = useBranchStore((s) => s.fetchBranches);
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");
  const [desktopMode, setDesktopMode] = useState(false);
  const [desktopActivated, setDesktopActivated] = useState(false);
  const [modeResolved, setModeResolved] = useState(false);
  const [webMode, setWebMode] = useState<WebMode>("login");
  const [accountNumber, setAccountNumber] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const loginAttemptInFlight = useRef(false);

  const ar = locale === "ar";
  const fieldClass = "h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

  useEffect(() => {
    const isDesktop = Boolean(window.sankyDesktop?.isDesktop);
    setDesktopMode(isDesktop);
    let active = true;
    if (!isDesktop) {
      setModeResolved(true);
      return () => { active = false; };
    }
    const validateDesktopSession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
      if (!session) {
        if (active) setDesktopActivated(false);
        return;
      }
      const storedAccount = getShopAccountNumber();
      if (!storedAccount) {
        if (active) setDesktopActivated(false);
        await supabase.auth.signOut();
        return;
      }
      const { data, error } = await supabase.rpc("verify_shop_device_session", { p_account_number: storedAccount });
      if (!active) return;
      const valid = !error && data === true;
      setDesktopActivated(valid);
      if (!valid) {
        clearShopAccountNumber();
        await supabase.auth.signOut();
      }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) void validateDesktopSession(session);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      void validateDesktopSession(data.session).finally(() => { if (active) setModeResolved(true); });
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const activateDesktop = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verifying) return;
    setVerifying(true);
    try {
      const cleanAccount = accountNumber.trim();
      const cleanCode = activationCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const cleanDeviceName = deviceName.trim().slice(0, 80);
      if (!/^\d{4}$/.test(cleanAccount)) throw new Error(ar ? "أدخل رقم الحساب المكوّن من 4 أرقام" : "Enter the 4-digit account number");
      if (!/^[A-Z2-9]{16}$/.test(cleanCode)) throw new Error(ar ? "كود التفعيل غير صحيح" : "The activation code is invalid");

      const { data, error } = await supabase.functions.invoke("platform-device-activate", {
        body: { accountNumber: cleanAccount, code: cleanCode, deviceUuid: getDeviceUuid(), deviceName: cleanDeviceName },
      });
      if (error) throw error;
      const result = data as { branchId?: string; accessToken?: string; refreshToken?: string } | null;
      if (!result?.branchId || !result.accessToken || !result.refreshToken) {
        throw new Error(ar ? "تعذر إكمال التفعيل. أنشئ كودًا جديدًا من لوحة التحكم." : "Activation could not be completed. Create a new code in the console.");
      }

      setShopAccountNumber(cleanAccount);
      if (cleanDeviceName) window.localStorage.setItem(DEVICE_NAME_STORAGE_KEY, cleanDeviceName);
      setBranch(result.branchId);
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (sessionError) throw sessionError;
      const { data: deviceSessionValid, error: deviceSessionError } = await supabase.rpc("verify_shop_device_session", { p_account_number: cleanAccount });
      if (deviceSessionError || deviceSessionValid !== true) {
        await supabase.auth.signOut();
        clearShopAccountNumber();
        throw new Error(ar ? "تم إصدار الجلسة لكن لم يكتمل ربط الجهاز بالفرع." : "The sign-in was created, but device-to-branch binding failed.");
      }
      setDesktopActivated(true);
      setActivationCode("");
      toast(ar ? "تم ربط الجهاز. جارٍ تحميل بيانات الفرع لأول مرة." : "Device connected. Loading this branch for the first time.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : (ar ? "تعذر تفعيل الجهاز" : "Unable to activate this device"), "error");
    } finally {
      setVerifying(false);
    }
  };

  const handleDigit = (d: string) => {
    if (loginAttemptInFlight.current || welcomeName) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) setTimeout(() => attemptPinLogin(next), 150);
  };

  const attemptPinLogin = async (candidate: string) => {
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
        const destination = "/pos/";
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
    toast(ar ? "الكود غير صحيح" : "Incorrect PIN", "error");
    setShake(true);
    setTimeout(() => { setShake(false); setPin(""); }, 400);
  };

  const handleWebSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verifying) return;
    setVerifying(true);
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();
    try {
      if (!/^\d{4}$/.test(accountNumber)) {
        throw new Error(ar ? "رقم الحساب لازم يكون 4 أرقام" : "Account number must be 4 digits");
      }
      if (webMode === "forgot") {
        const matches = await verifyShopAccount(accountNumber, cleanEmail);
        if (!matches) throw new Error(ar ? "بيانات الحساب غير صحيحة" : "Account details are incorrect");
      }

      if (webMode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password/`,
        });
        if (error) throw error;
        setMessage(ar ? "لو الحساب موجود، هيوصلك رابط إعادة تعيين كلمة المرور." : "If the account exists, a password reset link will arrive by email.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (signInError) throw signInError;
      const user = await authenticateShopOwner(accountNumber);
      if (!user || !user.isActive || user.role !== "owner") {
        await supabase.auth.signOut();
        clearShopAccountNumber();
        throw new Error(ar ? "رقم الحساب أو البريد غير مرتبط بحساب مالك نشط" : "This email is not linked to an active owner for that account");
      }
      setShopAccountNumber(accountNumber);
      setBranch(user.branchId);
      login(user);
      await fetchBranches();
      setWelcomeName(user.name);
      let returnPath: string | null = null;
      try {
        returnPath = sessionStorage.getItem(RETURN_PATH_KEY);
        sessionStorage.removeItem(RETURN_PATH_KEY);
      } catch { /* Fall back to the owner dashboard if storage is unavailable. */ }
      const destination = returnPath && canAccess(user, returnPath)
        ? returnPath
        : defaultRouteFor(user) ?? "/dashboard/";
      window.setTimeout(() => router.replace(destination), 900);
    } catch (err) {
      toast(err instanceof Error ? err.message : (ar ? "تعذر تسجيل الدخول" : "Unable to sign in"), "error");
    } finally {
      setVerifying(false);
    }
  };

  if (!modeResolved) return <div className="flex h-app w-full items-center justify-center bg-background"><div className="h-8 w-8 animate-pulse rounded-full bg-primary/30" /></div>;

  return (
    <div className="relative isolate flex h-app w-full flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-amber-100 via-orange-50 to-stone-100 dark:from-stone-900 dark:via-neutral-950 dark:to-amber-950">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-orange-300/25 blur-3xl dark:bg-orange-500/10" />
      <header className="relative z-10 flex justify-end p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/65 p-1.5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/25">
          <Button variant="outline" size="icon" onClick={() => setLocale(ar ? "en" : "ar")} title="Toggle language"><Languages className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={toggleTheme} title="Toggle theme">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-3 sm:px-6">
        <section className="my-auto w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/80 px-6 py-6 shadow-[0_24px_80px_-28px_rgba(91,53,24,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/80 sm:px-10">
          <div className="mb-6 flex flex-col items-center text-center">
            <p className="text-3xl font-extrabold tracking-tight text-espresso-900 dark:text-amber-50">{t.app.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.app.tagline}</p>
            <div className="mt-5 h-px w-16 bg-gradient-to-r from-transparent via-amber-700/50 to-transparent dark:via-amber-300/50" />
            {welcomeName ? (
              <div className="mt-5 animate-fade-in" role="status" aria-live="polite">
                <h1 className="text-2xl font-bold">{ar ? `مرحبًا ${welcomeName}` : `Welcome, ${welcomeName}`}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{ar ? "جاري الدخول..." : "Signing in..."}</p>
              </div>
            ) : (
              <div className="mt-5 text-center">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{desktopMode ? (desktopActivated ? t.login.title : (ar ? "تفعيل جهاز الكاشير" : "Activate cashier device")) : (ar ? "تسجيل دخول صاحب الحساب" : "Shop owner sign in")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{desktopMode ? (desktopActivated ? t.login.subtitle : (ar ? "أدخل رقم المحل وكود التفعيل الذي أنشأه مالك المنصة" : "Enter the business number and the activation code from the platform console")) : (ar ? "أدخل رقم الحساب والبريد وكلمة المرور" : "Enter your account number, email, and password")}</p>
              </div>
            )}
          </div>

          {!welcomeName && desktopMode && !desktopActivated && (
            <form onSubmit={activateDesktop} className="space-y-4">
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "رقم الحساب" : "Business number"}</span><input className={fieldClass + " text-center font-mono tracking-[0.35em]"} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" placeholder="0000" required /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "اسم جهاز الكاشير" : "Cashier device name"}</span><input className={fieldClass} value={deviceName} onChange={(e) => setDeviceName(e.target.value.slice(0, 80))} autoComplete="off" maxLength={80} placeholder={ar ? "مثال: كاشير 1" : "For example: Cashier 1"} /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "كود تفعيل الجهاز" : "Device activation code"}</span><input className={fieldClass + " text-center font-mono uppercase tracking-[0.16em]"} value={activationCode} onChange={(e) => setActivationCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 19))} autoComplete="off" maxLength={19} placeholder="XXXX-XXXX-XXXX-XXXX" required /></label>
              <Button type="submit" className="h-12 w-full rounded-xl" disabled={verifying}>{verifying ? (ar ? "جارٍ التفعيل والمزامنة..." : "Activating and syncing...") : (ar ? "تفعيل ومزامنة أولى" : "Activate and initial sync")}</Button>
              <p className="text-center text-xs leading-5 text-muted-foreground">{ar ? "يُستخدم الكود مرة واحدة فقط. بعد اكتمال المزامنة، الدخول اليومي يكون برقم PIN الموظف." : "This code is used once. After the initial sync, daily cashier access uses the employee PIN."}</p>
            </form>
          )}

          {!welcomeName && desktopMode && desktopActivated && (
            <div className={cn("flex flex-col items-center gap-4", shake && "animate-shake")}>
              <div className="flex gap-3" aria-label={`${pin.length} of 4 digits entered`}>
                {[0, 1, 2, 3].map((i) => <div key={i} className={cn("h-3.5 w-3.5 rounded-full border-2 transition-all", pin.length > i ? "scale-110 border-amber-700 bg-amber-700 dark:border-amber-300 dark:bg-amber-300" : "border-stone-300 dark:border-stone-600")} />)}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} onClick={() => handleDigit(d)} disabled={verifying} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl border border-amber-900/10 bg-amber-50/80 text-xl font-semibold text-espresso-900 shadow-sm transition-all hover:border-amber-700/30 hover:bg-amber-100 active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-amber-50 dark:hover:bg-white/10">{d}</button>)}
                <button disabled={verifying || pin.length === 0} onClick={() => setPin("")} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">{ar ? "مسح" : "Clear"}</button>
                <button disabled={verifying} onClick={() => handleDigit("0")} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl border border-amber-900/10 bg-amber-50/80 text-xl font-semibold text-espresso-900 shadow-sm transition-all hover:border-amber-700/30 hover:bg-amber-100 active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-amber-50 dark:hover:bg-white/10">0</button>
                <button disabled={verifying || pin.length === 0} onClick={() => setPin((p) => p.slice(0, -1))} aria-label={ar ? "حذف آخر رقم" : "Delete last digit"} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"><Delete className="h-5 w-5" /></button>
              </div>
            </div>
          )}

          {!welcomeName && !desktopMode && (
            <form onSubmit={handleWebSubmit} className="space-y-3">
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "رقم الحساب" : "Account number"}</span><input className={fieldClass} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" placeholder="0000" required /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "البريد الإلكتروني" : "Email"}</span><input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="name@example.com" required /></label>
              {webMode !== "forgot" && <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "كلمة المرور" : "Password"}</span><div className="relative"><input className={fieldClass} style={{ paddingInlineEnd: "3.25rem" }} value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={8} placeholder="••••••••" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? (ar ? "إخفاء كلمة المرور" : "Hide password") : (ar ? "إظهار كلمة المرور" : "Show password")} title={showPassword ? (ar ? "إخفاء كلمة المرور" : "Hide password") : (ar ? "إظهار كلمة المرور" : "Show password")} className="absolute inset-y-1 end-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">{showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button></div></label>}
              {webMode === "login" && <div className="text-end"><button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => { setMessage(""); setWebMode("forgot"); }}>{ar ? "نسيت كلمة المرور؟" : "Forgot password?"}</button></div>}
              {message && <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300" role="status">{message}</p>}
              <Button type="submit" className="h-12 w-full rounded-xl" disabled={verifying}>{verifying ? (ar ? "جارٍ التحقق..." : "Please wait...") : webMode === "forgot" ? (ar ? "إرسال رابط الاستعادة" : "Send reset link") : (ar ? "دخول" : "Sign in")}</Button>
              <div className="flex justify-center gap-2 pt-1 text-sm text-muted-foreground">
                {webMode === "forgot" && <button type="button" className="text-primary hover:underline" onClick={() => { setMessage(""); setWebMode("login"); }}>{ar ? "العودة لتسجيل الدخول" : "Back to sign in"}</button>}
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
