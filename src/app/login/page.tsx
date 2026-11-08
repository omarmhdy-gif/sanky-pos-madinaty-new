"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Moon, Sun, Languages, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { authenticateConsoleEmployee, authenticateShopOwner, authenticateStaffPin } from "@/lib/supabase/api";
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
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password/`,
        });
        if (error) throw error;
        setMessage(ar ? "لو الحساب موجود، هيوصلك رابط إعادة تعيين كلمة المرور." : "If the account exists, a password reset link will arrive by email.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (signInError) throw signInError;
      const owner = await authenticateShopOwner(accountNumber);
      const user = owner ?? await authenticateConsoleEmployee(accountNumber);
      if (!user || !user.isActive) {
        await supabase.auth.signOut();
        clearShopAccountNumber();
        throw new Error(ar ? "رقم الحساب أو بيانات الموظف غير صحيحة أو الحساب غير نشط" : "The account number or employee credentials are incorrect, or the account is inactive");
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

  if (!modeResolved) return (
    <div className="nova-login-scene relative flex h-app w-full items-center justify-center overflow-hidden px-5">
      <div className="nova-login-grid" aria-hidden="true" />
      <div className="nova-login-orb nova-login-orb-one" aria-hidden="true" />
      <div className="nova-login-orb nova-login-orb-two" aria-hidden="true" />
      <div className="nova-login-loading relative z-10 flex flex-col items-center text-center">
        <div className="nova-login-mark nova-login-mark-loading"><img src="/nova-mark-transparent.svg" alt="" /></div>
        <p className="mt-5 text-sm font-semibold tracking-[0.24em]">NOVA</p>
        <span className="nova-login-loader mt-5" aria-hidden="true" />
        <span className="sr-only">{ar ? "جارٍ تجهيز شاشة الدخول" : "Preparing sign-in"}</span>
      </div>
    </div>
  );

  return (
    <div className="nova-login-scene relative isolate flex h-app w-full flex-col overflow-hidden">
      <div className="nova-login-grid" aria-hidden="true" />
      <div className="nova-login-orb nova-login-orb-one" aria-hidden="true" />
      <div className="nova-login-orb nova-login-orb-two" aria-hidden="true" />
      <div className="nova-login-orb nova-login-orb-three" aria-hidden="true" />
      <header className="relative z-10 flex justify-end p-3 sm:px-5 sm:py-4">
        <div className="nova-login-tools flex items-center gap-2 rounded-2xl p-1.5">
          <Button variant="outline" size="icon" onClick={() => setLocale(ar ? "en" : "ar")} title="Toggle language"><Languages className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={toggleTheme} title="Toggle theme">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pb-5 sm:px-6 sm:pb-7">
        <section className="nova-login-shell my-auto w-full">
          <aside className="nova-login-brand relative hidden flex-col justify-between overflow-hidden p-8 text-white sm:p-9 md:flex">
            <div className="nova-login-brand-glow" aria-hidden="true" />
            <div className="relative z-10">
              <div className="nova-login-brand-lockup flex items-center gap-3">
                <div className="nova-login-mark"><img src="/nova-mark-transparent.svg" alt="" /></div>
                <div>
                  <div className="text-2xl font-bold tracking-[0.16em]">NOVA</div>
                  <div className="mt-0.5 text-[0.65rem] font-medium tracking-[0.13em] text-emerald-50/75">POINT OF SALE</div>
                </div>
              </div>
              <div className="mt-16 max-w-xs">
                <p className="nova-login-kicker">{ar ? "إدارة نشاطك التجاري" : "BUSINESS OPERATIONS"}</p>
                <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">{ar ? "إدارة نشاطك من مكان واحد" : "Your business, in one place."}</h2>
                <p className="mt-3 text-sm leading-6 text-emerald-50/75">{ar ? "أدوات تشغيل واضحة لمتابعة نشاطك وفريقك." : "A clear view of your business and daily operations."}</p>
              </div>
            </div>
            <div className="nova-login-brand-visual" aria-hidden="true">
              <span className="nova-login-visual-orbit nova-login-visual-orbit-one" />
              <span className="nova-login-visual-orbit nova-login-visual-orbit-two" />
              <span className="nova-login-visual-core"><img src="/nova-mark-transparent.svg" alt="" /></span>
              <span className="nova-login-visual-caption">N · O · V · A</span>
            </div>
            <p className="relative z-10 text-xs tracking-wide text-emerald-50/55">{ar ? "نظام نقاط بيع وإدارة تشغيل" : "POINT OF SALE · BUSINESS OPERATIONS"}</p>
          </aside>

          <div className="nova-login-panel px-6 py-7 sm:px-10 sm:py-9">
            <div className="mb-6 flex items-center justify-between md:hidden">
              <div className="flex items-center gap-2.5">
                <div className="nova-login-mark nova-login-mark-small"><img src="/nova-mark-transparent.svg" alt="" /></div>
                <span className="text-lg font-bold tracking-[0.16em]">NOVA</span>
              </div>
              <span className="nova-login-kicker">{ar ? "حساب النشاط" : "BUSINESS ACCOUNT"}</span>
            </div>

            <div className="mb-6">
            {welcomeName ? (
              <div className="animate-fade-in" role="status" aria-live="polite">
                <h1 className="nova-login-title text-2xl">{ar ? `مرحبًا ${welcomeName}` : `Welcome, ${welcomeName}`}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{ar ? "جاري الدخول..." : "Signing in..."}</p>
              </div>
            ) : (
              <div className="text-start">
                <p className="nova-login-kicker mb-2">{webMode === "forgot" ? (ar ? "استعادة الوصول" : "ACCOUNT RECOVERY") : desktopMode ? (desktopActivated ? (ar ? "دخول الكاشير" : "CASHIER ACCESS") : (ar ? "إعداد الجهاز" : "DEVICE SETUP")) : (ar ? "دخول الحساب" : "ACCOUNT SIGN IN")}</p>
                <h1 className="nova-login-title">{desktopMode ? (desktopActivated ? t.login.title : (ar ? "تفعيل جهاز الكاشير" : "Activate cashier device")) : webMode === "forgot" ? (ar ? "استعادة كلمة المرور" : "Reset password") : (ar ? "تسجيل الدخول" : "Sign in")}</h1>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{desktopMode ? (desktopActivated ? t.login.subtitle : (ar ? "أدخل رقم المحل وكود التفعيل الذي أنشأه مالك المنصة" : "Enter the business number and the activation code from the platform console")) : webMode === "forgot" ? (ar ? "أدخل رقم الحساب والبريد لإرسال رابط استعادة كلمة المرور." : "Enter your account number and email to receive a password reset link.") : (ar ? "أدخل رقم الحساب والبريد الإلكتروني وكلمة المرور الخاصة بنشاطك." : "Enter the account number, email, and password assigned to your business.")}</p>
              </div>
            )}
          </div>

          {!welcomeName && desktopMode && !desktopActivated && (
            <form onSubmit={activateDesktop} className="nova-login-form space-y-4">
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "رقم الحساب" : "Business number"}</span><input className={fieldClass + " text-center font-mono tracking-[0.35em]"} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" placeholder="0000" required /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "اسم جهاز الكاشير" : "Cashier device name"}</span><input className={fieldClass} value={deviceName} onChange={(e) => setDeviceName(e.target.value.slice(0, 80))} autoComplete="off" maxLength={80} placeholder={ar ? "مثال: كاشير 1" : "For example: Cashier 1"} /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "كود تفعيل الجهاز" : "Device activation code"}</span><input className={fieldClass + " text-center font-mono uppercase tracking-[0.16em]"} value={activationCode} onChange={(e) => setActivationCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 19))} autoComplete="off" maxLength={19} placeholder="XXXX-XXXX-XXXX-XXXX" required /></label>
              <Button type="submit" className="nova-login-submit h-12 w-full rounded-xl" disabled={verifying}>{verifying ? (ar ? "جارٍ التفعيل والمزامنة..." : "Activating and syncing...") : (ar ? "تفعيل ومزامنة أولى" : "Activate and initial sync")}</Button>
              <p className="text-center text-xs leading-5 text-muted-foreground">{ar ? "يُستخدم الكود مرة واحدة فقط. بعد اكتمال المزامنة، الدخول اليومي يكون برقم PIN الموظف." : "This code is used once. After the initial sync, daily cashier access uses the employee PIN."}</p>
            </form>
          )}

          {!welcomeName && desktopMode && desktopActivated && (
            <div className={cn("flex flex-col items-center gap-4", shake && "animate-shake")}>
              <div className="flex gap-3" aria-label={`${pin.length} of 4 digits entered`}>
                {[0, 1, 2, 3].map((i) => <div key={i} className={cn("h-3.5 w-3.5 rounded-full border-2 transition-all", pin.length > i ? "nova-pin-dot-active scale-110" : "border-stone-300 dark:border-stone-600")} />)}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} onClick={() => handleDigit(d)} disabled={verifying} className="nova-login-key flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl text-xl font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50">{d}</button>)}
                <button disabled={verifying || pin.length === 0} onClick={() => setPin("")} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">{ar ? "مسح" : "Clear"}</button>
                <button disabled={verifying} onClick={() => handleDigit("0")} className="nova-login-key flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl text-xl font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50">0</button>
                <button disabled={verifying || pin.length === 0} onClick={() => setPin((p) => p.slice(0, -1))} aria-label={ar ? "حذف آخر رقم" : "Delete last digit"} className="flex h-[clamp(2.5rem,6.5dvh,3.5rem)] w-[clamp(3rem,8vw,4.5rem)] items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"><Delete className="h-5 w-5" /></button>
              </div>
            </div>
          )}

          {!welcomeName && !desktopMode && (
            <form onSubmit={handleWebSubmit} className="nova-login-form space-y-3">
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "رقم الحساب" : "Account number"}</span><input className={fieldClass} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" placeholder="0000" required /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "البريد الإلكتروني" : "Email"}</span><input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="name@example.com" required /></label>
              {webMode !== "forgot" && <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "كلمة المرور" : "Password"}</span><div className="relative"><input className={fieldClass} style={{ paddingInlineEnd: "3.25rem" }} value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={8} placeholder="••••••••" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? (ar ? "إخفاء كلمة المرور" : "Hide password") : (ar ? "إظهار كلمة المرور" : "Show password")} title={showPassword ? (ar ? "إخفاء كلمة المرور" : "Hide password") : (ar ? "إظهار كلمة المرور" : "Show password")} className="absolute inset-y-1 end-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">{showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button></div></label>}
              {webMode === "login" && <div className="text-end"><button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => { setMessage(""); setWebMode("forgot"); }}>{ar ? "نسيت كلمة المرور؟" : "Forgot password?"}</button></div>}
              {message && <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300" role="status">{message}</p>}
              <Button type="submit" className="nova-login-submit h-12 w-full rounded-xl" disabled={verifying}>{verifying ? (ar ? "جارٍ التحقق..." : "Please wait...") : webMode === "forgot" ? (ar ? "إرسال رابط الاستعادة" : "Send reset link") : (ar ? "دخول" : "Sign in")}</Button>
              <div className="flex justify-center gap-2 pt-1 text-sm text-muted-foreground">
                {webMode === "forgot" && <button type="button" className="text-primary hover:underline" onClick={() => { setMessage(""); setWebMode("login"); }}>{ar ? "العودة لتسجيل الدخول" : "Back to sign in"}</button>}
              </div>
            </form>
          )}
          </div>
        </section>
      </main>
    </div>
  );
}
