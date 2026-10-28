"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, KeyRound, MonitorCog, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useI18n, bilingual } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { getShopAccountNumber, supabase } from "@/lib/supabase/client";
import { platformSupabase } from "@/lib/supabase/platformClient";

interface DeviceLicense {
  id: string;
  branch_id: string;
  device_name: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  device_uuid: string | null;
}

interface CashierDevice {
  device_uuid: string;
  branch_id: string | null;
  device_name: string;
  activated_at: string;
  last_sync_at: string | null;
}

interface ConsoleData {
  licenses: DeviceLicense[];
  devices: CashierDevice[];
  deviceLimit: number;
  activeDeviceCount: number;
  pendingCodeCount: number;
}

const EMPTY_DATA: ConsoleData = {
  licenses: [],
  devices: [],
  deviceLimit: 0,
  activeDeviceCount: 0,
  pendingCodeCount: 0,
};

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");
}

export function CashierDeviceManager() {
  const { locale } = useI18n();
  const isArabic = locale === "ar";
  const currentUser = useAuthStore((state) => state.currentUser);
  const branches = useBranchStore((state) => state.branches);
  const currentBranchId = useBranchStore((state) => state.currentBranchId);
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [deviceName, setDeviceName] = useState("");
  const [data, setData] = useState<ConsoleData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (currentBranchId && !branchId) setBranchId(currentBranchId);
  }, [currentBranchId, branchId]);

  const invokeConsole = useCallback(async (action: "list" | "issue", name?: string) => {
    if (!platformSupabase) throw new Error(isArabic ? "إعداد اتصال منصة الأجهزة غير متاح في هذه النسخة." : "The device console is not configured in this build.");
    const accountNumber = getShopAccountNumber();
    if (!accountNumber) throw new Error(isArabic ? "رقم حساب المحل غير موجود في جلسة الدخول." : "The signed-in shop account number is unavailable.");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error(isArabic ? "انتهت جلسة الدخول. سجّل الدخول مرة أخرى." : "Your session expired. Sign in again.");

    const { data: result, error } = await platformSupabase.functions.invoke("platform-device-console", {
      body: { action, accountNumber, branchId, deviceName: name },
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });
    if (error) throw error;
    return result as ConsoleData & { code?: string; license?: DeviceLicense };
  }, [branchId, isArabic]);

  const load = useCallback(async () => {
    if (currentUser?.role !== "owner" || !branchId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await invokeConsole("list");
      setData({
        licenses: result.licenses ?? [],
        devices: result.devices ?? [],
        deviceLimit: result.deviceLimit ?? 0,
        activeDeviceCount: result.activeDeviceCount ?? 0,
        pendingCodeCount: result.pendingCodeCount ?? 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [branchId, currentUser?.role, invokeConsole]);

  useEffect(() => {
    void load();
  }, [load]);

  const issueCode = async () => {
    const cleanName = deviceName.trim();
    if (!cleanName || !branchId) return;
    setIssuing(true);
    setErrorMessage("");
    try {
      const result = await invokeConsole("issue", cleanName);
      if (!result.code) throw new Error(isArabic ? "لم يصل كود التفعيل من الخدمة." : "The activation service did not return a code.");
      setActivationCode(result.code);
      setCopied(false);
      setDeviceName("");
      await load();
      toast(isArabic ? "تم إنشاء كود الجهاز" : "Device activation code created", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      toast(message, "error");
    } finally {
      setIssuing(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(activationCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(isArabic ? "تعذر نسخ الكود" : "Could not copy the code", "error");
    }
  };

  if (currentUser?.role !== "owner") {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          {isArabic ? "إدارة أجهزة الكاشير متاحة لمالك المحل فقط." : "Cashier device management is available to the shop owner only."}
        </CardContent>
      </Card>
    );
  }

  const activeCodes = data.licenses.filter((license) => !license.consumed_at && new Date(license.expires_at).getTime() > Date.now());
  const availableSlots = Math.max(0, data.deviceLimit - data.activeDeviceCount - data.pendingCodeCount);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MonitorCog className="h-5 w-5 text-primary" />
            {isArabic ? "أجهزة الكاشير" : "Cashier Devices"}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {isArabic ? "أنشئ كودًا لمرة واحدة واربط جهاز الكمبيوتر بفرع محدد." : "Create a one-time code to connect a cashier computer to a specific branch."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {isArabic ? "تحديث" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{isArabic ? "الأجهزة المفعّلة" : "Activated devices"}</p>
            <p className="mt-1 text-lg font-semibold">{data.activeDeviceCount} / {data.deviceLimit || "—"}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{isArabic ? "أكواد صالحة غير مستخدمة" : "Unused active codes"}</p>
            <p className="mt-1 text-lg font-semibold">{activeCodes.length}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{isArabic ? "أماكن متاحة" : "Available slots"}</p>
            <p className="mt-1 text-lg font-semibold">{data.deviceLimit ? availableSlots : "—"}</p>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="cashier-device-branch">{isArabic ? "الفرع" : "Branch"}</Label>
            <select
              id="cashier-device-branch"
              value={branchId}
              onChange={(event) => { setBranchId(event.target.value); setActivationCode(""); }}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{bilingual(branch.name, locale)}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="cashier-device-name">{isArabic ? "اسم الجهاز" : "Device name"}</Label>
            <Input id="cashier-device-name" className="mt-1.5" maxLength={80} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder={isArabic ? "مثال: كاشير الواجهة" : "e.g. Front counter"} />
          </div>
          <Button type="button" onClick={() => void issueCode()} disabled={issuing || !branchId || !deviceName.trim() || availableSlots <= 0}>
            <KeyRound className="me-2 h-4 w-4" />
            {issuing ? (isArabic ? "جارٍ الإنشاء..." : "Creating...") : (isArabic ? "إنشاء كود" : "Create code")}
          </Button>
        </div>

        {activationCode && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div>
              <p className="text-sm font-medium">{isArabic ? "كود التفعيل — يظهر لك الآن فقط" : "Activation code — shown only now"}</p>
              <code dir="ltr" className="mt-1 block font-mono text-xl font-bold tracking-wider">{activationCode}</code>
            </div>
            <Button type="button" variant="outline" onClick={() => void copyCode()}>
              {copied ? <Check className="me-2 h-4 w-4" /> : <Clipboard className="me-2 h-4 w-4" />}
              {copied ? (isArabic ? "تم النسخ" : "Copied") : (isArabic ? "نسخ" : "Copy")}
            </Button>
          </div>
        )}

        {errorMessage && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{errorMessage}</p>}

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{isArabic ? "الأكواد والربط" : "Activation codes"}</h3>
            {data.licenses.length ? data.licenses.map((license) => {
              const expired = new Date(license.expires_at).getTime() <= Date.now();
              const status = license.consumed_at ? (isArabic ? "مستخدم" : "Used") : expired ? (isArabic ? "منتهي" : "Expired") : (isArabic ? "غير مستخدم" : "Unused");
              const tone = license.consumed_at ? "text-success" : expired ? "text-muted-foreground" : "text-primary";
              return (
                <div key={license.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{license.device_name || (isArabic ? "جهاز كاشير" : "Cashier device")}</p>
                    <p className="text-xs text-muted-foreground">{isArabic ? "أُنشئ " : "Created "}{formatDate(license.created_at, locale, "—")}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${tone}`}>{status}</span>
                </div>
              );
            }) : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{isArabic ? "لا توجد أكواد لهذا الفرع." : "No codes for this branch yet."}</p>}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{isArabic ? "الأجهزة المتصلة وآخر مزامنة" : "Connected devices and last sync"}</h3>
            {data.devices.length ? data.devices.map((device) => (
              <div key={device.device_uuid} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{device.device_name}</p>
                  <p className="text-xs text-muted-foreground">{isArabic ? "تفعيل " : "Activated "}{formatDate(device.activated_at, locale, "—")}</p>
                </div>
                <p className="shrink-0 text-end text-xs text-muted-foreground">
                  <span className="block">{isArabic ? "آخر مزامنة" : "Last sync"}</span>
                  {formatDate(device.last_sync_at, locale, isArabic ? "لم تتم بعد" : "Not yet")}
                </p>
              </div>
            )) : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{isArabic ? "لا توجد أجهزة مفعّلة لهذا الفرع." : "No activated devices for this branch yet."}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
