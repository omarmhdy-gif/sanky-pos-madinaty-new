"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const fieldClass = "h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setReady(Boolean(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setReady(Boolean(session));
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      toast(ar ? "كلمة المرور لازم تكون 8 أحرف على الأقل" : "Password must be at least 8 characters", "error");
      return;
    }
    if (password !== confirmPassword) {
      toast(ar ? "كلمتا المرور غير متطابقتين" : "Passwords do not match", "error");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setMessage(ar ? "تم تحديث كلمة المرور. ارجع وسجّل الدخول." : "Password updated. Return to sign in.");
    } catch (error) {
      toast(error instanceof Error ? error.message : (ar ? "تعذر تحديث كلمة المرور" : "Unable to update password"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex h-app w-full items-center justify-center overflow-y-auto bg-background px-4 py-6">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-xl sm:p-9">
        <h1 className="text-center text-2xl font-bold">{ar ? "تعيين كلمة مرور جديدة" : "Set a new password"}</h1>
        {!ready ? (
          <div className="mt-5 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">{ar ? "افتح رابط الاستعادة الذي وصلك على بريدك الإلكتروني." : "Open the password reset link sent to your email."}</p>
            <Button className="w-full" onClick={() => router.replace("/login/")}>{ar ? "العودة لتسجيل الدخول" : "Back to sign in"}</Button>
          </div>
        ) : message ? (
          <div className="mt-5 space-y-4 text-center">
            <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{message}</p>
            <Button className="w-full" onClick={() => router.replace("/login/")}>{ar ? "تسجيل الدخول" : "Sign in"}</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "كلمة المرور الجديدة" : "New password"}</span><input className={fieldClass} type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <label className="block space-y-1.5"><span className="text-sm font-medium">{ar ? "تأكيد كلمة المرور" : "Confirm password"}</span><input className={fieldClass} type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
            <Button className="h-12 w-full rounded-xl" disabled={saving}>{saving ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "حفظ كلمة المرور" : "Save password")}</Button>
          </form>
        )}
      </section>
    </main>
  );
}
