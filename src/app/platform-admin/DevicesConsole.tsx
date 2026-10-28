"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Laptop, KeyRound, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Shop = {
  id: string;
  account_number: string;
  name: string;
  status: "active" | "trial" | "suspended";
  device_limit: number;
  archived_at: string | null;
};
type License = {
  id: string;
  shop_id: string;
  license_type: "device" | "branch";
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  device_uuid: string | null;
};
type Device = {
  shop_id: string;
  device_uuid: string;
  device_name: string;
  activated_at: string;
  last_sync_at: string | null;
};

const timestamp = (value: string | null) => value
  ? new Date(value).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })
  : "لم تتم مزامنة بعد";

export function DevicesConsole({
  db,
  shops,
  userId,
  onAudit,
  onNotice,
}: {
  db: SupabaseClient;
  shops: Shop[];
  userId: string;
  onAudit: (shopId: string, action: string, details: Record<string, unknown>) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");
  const [shopId, setShopId] = useState("");
  const [search, setSearch] = useState("");
  const [newCode, setNewCode] = useState("");

  const activeShops = useMemo(() => shops.filter((shop) => !shop.archived_at), [shops]);
  const selectedShop = activeShops.find((shop) => shop.id === shopId) ?? activeShops[0] ?? null;

  const refresh = useCallback(async () => {
    if (!activeShops.length) {
      setLicenses([]);
      setDevices([]);
      return;
    }
    setLoading(true);
    setError("");
    const shopIds = activeShops.map((shop) => shop.id);
    const [licenseResult, deviceResult] = await Promise.all([
      db.from("platform_licenses")
        .select("id,shop_id,license_type,expires_at,consumed_at,created_at,device_uuid")
        .eq("license_type", "device")
        .in("shop_id", shopIds)
        .order("created_at", { ascending: false })
        .limit(500),
      db.from("platform_devices")
        .select("shop_id,device_uuid,device_name,activated_at,last_sync_at")
        .in("shop_id", shopIds)
        .order("last_sync_at", { ascending: false, nullsFirst: false })
        .limit(500),
    ]);
    if (licenseResult.error || deviceResult.error) {
      setError(licenseResult.error?.message ?? deviceResult.error?.message ?? "تعذر تحميل بيانات الأجهزة.");
    } else {
      setLicenses((licenseResult.data ?? []) as License[]);
      setDevices((deviceResult.data ?? []) as Device[]);
    }
    setLoading(false);
  }, [activeShops, db]);

  useEffect(() => { void refresh(); }, [refresh]);

  const issueDeviceCode = async () => {
    if (!selectedShop || issuing) return;
    const shopLicenses = licenses.filter((license) => license.shop_id === selectedShop.id);
    const usedIds = new Set([
      ...shopLicenses.filter((license) => license.consumed_at && license.device_uuid).map((license) => license.device_uuid!),
      ...devices.filter((device) => device.shop_id === selectedShop.id).map((device) => device.device_uuid),
    ]);
    if (usedIds.size >= selectedShop.device_limit) {
      setError("وصل البيزنس إلى حد الأجهزة. زِد الحد من لوحة البيزنس قبل إنشاء كود جديد.");
      return;
    }

    setIssuing(true);
    setError("");
    setNewCode("");
    try {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const random = crypto.getRandomValues(new Uint8Array(16));
      const rawCode = Array.from(random, (byte) => alphabet[byte & 31]).join("");
      const code = rawCode.match(/.{1,4}/g)?.join("-") ?? rawCode;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawCode));
      const codeDigest = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data, error: insertError } = await db.from("platform_licenses")
        .insert({ shop_id: selectedShop.id, license_type: "device", code_digest: codeDigest, expires_at: expiresAt, created_by: userId })
        .select("id,shop_id,license_type,expires_at,consumed_at,created_at,device_uuid")
        .single();
      if (insertError) throw insertError;
      setLicenses((old) => [data as License, ...old]);
      setNewCode(code);
      await onAudit(selectedShop.id, "device_activation_code_issued", { license_id: data.id, expires_at: expiresAt });
      onNotice("تم إنشاء كود التفعيل. انسخه الآن؛ لن يظهر كاملًا مرة أخرى.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء كود التفعيل.");
    } finally {
      setIssuing(false);
    }
  };

  const deviceIndex = new Map(devices.map((device) => [`${device.shop_id}:${device.device_uuid}`, device]));
  const rows = licenses.filter((license) => {
    const shop = shops.find((item) => item.id === license.shop_id);
    const device = license.device_uuid ? deviceIndex.get(`${license.shop_id}:${license.device_uuid}`) : undefined;
    return `${shop?.name ?? ""} ${shop?.account_number ?? ""} ${device?.device_name ?? ""}`.toLowerCase().includes(search.toLowerCase());
  });
  const activeDeviceCount = new Set(licenses.filter((license) => license.consumed_at && license.device_uuid).map((license) => `${license.shop_id}:${license.device_uuid}`)).size;
  const pendingCodeCount = licenses.filter((license) => !license.consumed_at && Date.parse(license.expires_at) > Date.now()).length;
  const unsyncedCount = devices.filter((device) => !device.last_sync_at).length;

  return <section className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <Summary icon={<Laptop />} label="أجهزة مفعّلة" value={activeDeviceCount} note="مرتبطة ببيزنس" tone="amber" />
      <Summary icon={<KeyRound />} label="أكواد تنتظر الاستخدام" value={pendingCodeCount} note="صالحة لمدة 24 ساعة" tone="sky" />
      <Summary icon={<RefreshCw />} label="لم تزامن بعد" value={unsyncedCount} note="ستظهر المزامنة بعد تحميل بيانات الكاشير" tone="emerald" />
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-3xl border border-white/10 bg-[#121f19]/95 p-5 shadow-xl shadow-black/10">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/15 bg-amber-200/[0.08] text-amber-100"><KeyRound className="h-5 w-5" /></span>
          <div><h2 className="font-bold">كود تفعيل جهاز</h2><p className="mt-1 text-xs text-stone-400">اختر البيزنس، ثم أرسل الكود إلى جهاز الكاشير.</p></div>
        </div>
        <label className="mb-3 block text-xs text-stone-400" htmlFor="device-shop">البيزنس</label>
        <select id="device-shop" value={selectedShop?.id ?? ""} onChange={(event) => setShopId(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0b1511] px-3 text-sm text-stone-100">
          {activeShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name} · {shop.account_number}</option>)}
        </select>
        {selectedShop && <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/10 p-3">
          <div className="flex items-center justify-between text-sm"><span className="text-stone-400">سعة الأجهزة</span><b>{new Set([...licenses.filter((license) => license.shop_id === selectedShop.id && license.consumed_at && license.device_uuid).map((license) => license.device_uuid!), ...devices.filter((device) => device.shop_id === selectedShop.id).map((device) => device.device_uuid)]).size} / {selectedShop.device_limit}</b></div>
          <p className="mt-1 text-xs leading-5 text-stone-500">يمكن تعديل الحد من ملف البيزنس. التحقق من الحد يتم أيضًا عند تفعيل الجهاز.</p>
        </div>}
        <Button disabled={!selectedShop || issuing || !selectedShop.device_limit} onClick={() => void issueDeviceCode()} className="mt-4 h-11 w-full rounded-xl bg-amber-200 font-bold text-[#14221b] hover:bg-amber-100"><KeyRound className="h-4 w-4" />{issuing ? "جارٍ الإنشاء..." : "إنشاء كود تفعيل"}</Button>
        {newCode && <div className="mt-4 rounded-2xl border border-amber-200/15 bg-[#0b1511] p-3">
          <p className="text-xs leading-5 text-amber-100/80">الكود لمرة واحدة وصالح 24 ساعة. انسخه الآن؛ لن يظهر كاملًا بعد مغادرة هذه الصفحة.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2"><code dir="ltr" className="min-w-0 flex-1 rounded-xl bg-black/20 px-3 py-2.5 text-center font-mono text-lg font-bold tracking-[0.12em] text-amber-100">{newCode}</code><Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(newCode); onNotice("تم نسخ كود التفعيل."); }} className="border-white/10"><Copy className="h-4 w-4" /> نسخ</Button><button onClick={() => setNewCode("")} aria-label="إخفاء الكود" className="rounded-xl p-2 text-stone-400 hover:bg-white/5"><X className="h-4 w-4" /></button></div>
        </div>}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#121f19]/95 shadow-xl shadow-black/10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-4 sm:p-5">
          <div><h2 className="text-lg font-bold">سجل الأجهزة والأكواد</h2><p className="mt-1 text-xs text-stone-400">اسم الجهاز، آخر مزامنة، وحالة استخدام كود التفعيل.</p></div>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading} className="border-white/10 bg-white/[0.03]"><RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> تحديث</Button>
        </div>
        <div className="relative border-b border-white/[0.06] p-4"><Search className="absolute right-7 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم البيزنس أو رقم الحساب أو الجهاز" className="h-10 border-white/10 bg-[#0b1511] pr-10 text-stone-100 placeholder:text-stone-600" /></div>
        {error && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.05] p-3 text-sm text-rose-200">{error}</p>}
        {rows.length ? <div className="divide-y divide-white/[0.06]">
          {rows.map((license) => {
            const shop = shops.find((item) => item.id === license.shop_id);
            const device = license.device_uuid ? deviceIndex.get(`${license.shop_id}:${license.device_uuid}`) : undefined;
            const expired = !license.consumed_at && Date.parse(license.expires_at) <= Date.now();
            const used = Boolean(license.consumed_at);
            const status = used ? "الكود مستخدم" : expired ? "انتهت الصلاحية" : "الكود غير مستخدم";
            const tone = used ? "bg-emerald-300/10 text-emerald-200" : expired ? "bg-rose-300/10 text-rose-200" : "bg-sky-300/10 text-sky-200";
            return <article key={license.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-stone-300"><Laptop className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="truncate">{device?.device_name ?? (license.device_uuid ? `جهاز ${license.device_uuid.slice(0, 8)}` : "بانتظار تفعيل الجهاز")}</b><span className="text-xs text-stone-500">{shop?.name ?? "بيزنس غير معروف"} · {shop?.account_number ?? "—"}</span></div><p className="mt-1 text-xs text-stone-400">آخر مزامنة: {timestamp(device?.last_sync_at ?? null)}</p><p className="mt-1 text-[11px] text-stone-600">تاريخ إنشاء الكود: {timestamp(license.created_at)} · ينتهي: {timestamp(license.expires_at)}</p></div></div>
              <span className={"inline-flex items-center gap-1.5 justify-self-start rounded-full px-3 py-1.5 text-xs font-semibold sm:justify-self-end " + tone}><ShieldCheck className="h-3.5 w-3.5" />{status}</span>
            </article>;
          })}
        </div> : <div className="p-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-stone-400"><Laptop className="h-6 w-6" /></span><p className="mt-3 font-semibold">لا توجد أكواد أجهزة</p><p className="mt-1 text-xs text-stone-500">أنشئ أول كود من البطاقة المجاورة.</p></div>}
      </section>
    </div>
  </section>;
}

function Summary({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: number; note: string; tone: "amber" | "sky" | "emerald" }) {
  const style = tone === "amber" ? "border-amber-200/10 bg-amber-200/[0.07] text-amber-100" : tone === "sky" ? "border-sky-200/10 bg-sky-200/[0.07] text-sky-100" : "border-emerald-200/10 bg-emerald-200/[0.07] text-emerald-100";
  return <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#17251d] to-[#101a15] p-4 shadow-lg shadow-black/10"><div className="flex items-center justify-between gap-3"><span className="text-sm text-stone-300">{label}</span><span className={"grid h-10 w-10 place-items-center rounded-xl border [&>svg]:h-5 [&>svg]:w-5 " + style}>{icon}</span></div><div className="mt-3 text-2xl font-bold">{value}</div><p className="mt-1 text-xs text-stone-500">{note}</p></div>;
}
