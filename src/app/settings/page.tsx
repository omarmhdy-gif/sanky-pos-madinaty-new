"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, Tag, Plus, Search, SlidersHorizontal, ReceiptText, Store, CreditCard, MonitorCog, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ShopLogo } from "@/components/layout/ShopLogo";
import { makeLogoBackgroundTransparent } from "@/lib/branding/transparentLogo";
import { MenuQrManager } from "@/components/settings/MenuQrManager";
import { PaymentMethodsManager } from "@/components/settings/ExternalPaymentManager";
import { CashierDeviceManager } from "@/components/settings/CashierDeviceManager";
import { TableManager } from "@/components/settings/TableManager";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  uploadImage,
  fetchLoyaltySettings,
  updateLoyaltySettings,
  fetchPromoCodes,
  createPromoCode,
  deletePromoCode,
  searchCustomers,
} from "@/lib/supabase/api";
import type { Customer, LoyaltySettings, Order, PromoCode } from "@/lib/types";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  branchId: "",
  enabled: false,
  pointMode: "order_value",
  amountPerPoint: 10,
  minimumOrderValue: 100,
  minimumOrders: 0,
  pointsDelayMinutes: 30,
  pointsPerReward: 100,
  rewardAmount: 10,
  minimumRedeemOrderValue: 200,
  createdAt: "",
  updatedAt: "",
};

const SAMPLE_RECEIPT_ORDER: Order = {
  id: "settings-preview",
  branchId: "",
  orderNumber: 1,
  lines: [
    { lineId: "sample-line", productId: "sample-product", name: { en: "Sample Item", ar: "صنف تجريبي" }, unitPrice: 50, qty: 1, modifiers: [] },
  ],
  subtotal: 50,
  discountAmount: 0,
  taxAmount: 0,
  taxRate: 0,
  total: 50,
  payment: { method: "cash", amount: 50, tenderedAmount: 50, changeDue: 0 },
  status: "completed",
  type: "takeaway",
  cashierId: "preview",
  cashierName: "",
  createdAt: new Date().toISOString(),
};

export default function SettingsPage() {
  const { t, locale } = useI18n();

  const settings = useDataStore((s) => s.settings);
  const updateSettings = useDataStore((s) => s.updateSettings);

  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const [activeSection, setActiveSection] = useState<"shop" | "receipt" | "business" | "payments">("shop");
  const [showCashierDevices, setShowCashierDevices] = useState(false);
  const [showLoyaltySettings, setShowLoyaltySettings] = useState(false);

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Loyalty
  const [loyaltySettings, setLoyaltySettings] =
    useState<LoyaltySettings>(DEFAULT_LOYALTY_SETTINGS);
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);
  const [loyaltySaving, setLoyaltySaving] = useState(false);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoName, setPromoName] = useState("");
  const [promoPercent, setPromoPercent] = useState("10");
  const [promoDays, setPromoDays] = useState("7");
  const [promoCustomerQuery, setPromoCustomerQuery] = useState("");
  const [promoCustomer, setPromoCustomer] = useState<Customer | null>(null);
  const [promoCustomerResults, setPromoCustomerResults] = useState<Customer[]>([]);
  const [promoCustomerSearching, setPromoCustomerSearching] = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);

  useEffect(() => {
    if (!currentBranchId) {
      setLoyaltyLoading(false);
      return;
    }

    let cancelled = false;

    const loadLoyaltySettings = async () => {
      setLoyaltyLoading(true);

      try {
        const data = await fetchLoyaltySettings(currentBranchId);

        if (!cancelled) {
          setLoyaltySettings(data);
        }
      } catch (err) {
        if (!cancelled) {
          toast(
            err instanceof Error
              ? err.message
              : "Failed to load loyalty settings",
            "error"
          );
        }
      } finally {
        if (!cancelled) {
          setLoyaltyLoading(false);
        }
      }
    };

    loadLoyaltySettings();

    return () => {
      cancelled = true;
    };
  }, [currentBranchId]);

  useEffect(() => {
    if (!currentBranchId) return;
    fetchPromoCodes(currentBranchId).then(setPromoCodes).catch((err) => toast(err instanceof Error ? err.message : "Failed to load promo codes", "error"));
  }, [currentBranchId]);

  const handleCreatePromoCode = async () => {
    if (!currentBranchId || !promoName.trim() || !promoCustomer) return;
    const percent = Number(promoPercent);
    const days = Number(promoDays);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100 || !Number.isInteger(days) || days < 1) {
      toast(isArabic ? "أدخل نسبة من 1 إلى 100 ومدة يومًا واحدًا على الأقل" : "Enter a percentage from 1 to 100 and a duration of at least 1 day", "error");
      return;
    }
    setPromoSaving(true);
    try {
      const created = await createPromoCode({ branchId: currentBranchId, code: promoName, discountPercent: percent, durationDays: days, customerId: promoCustomer.id });
      setPromoCodes((existing) => [{ ...created, customerName: promoCustomer.name, customerPhone: promoCustomer.phone }, ...existing]);
      setPromoName("");
      setPromoCustomer(null);
      setPromoCustomerQuery("");
      toast(isArabic ? "تم إنشاء البرومو كود" : "Promo code created", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create promo code", "error");
    } finally {
      setPromoSaving(false);
    }
  };

  const searchPromoCustomers = async () => {
    if (!currentBranchId || !promoCustomerQuery.trim()) return;
    setPromoCustomerSearching(true);
    try {
      setPromoCustomerResults(await searchCustomers(currentBranchId, promoCustomerQuery));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not search customers", "error");
    } finally {
      setPromoCustomerSearching(false);
    }
  };

  const handleDeletePromoCode = async (id: string) => {
    try {
      await deletePromoCode(id);
      setPromoCodes((existing) => existing.filter((promo) => promo.id !== id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete promo code", "error");
    }
  };

  const handleLoyaltyChange = <K extends keyof LoyaltySettings>(
    key: K,
    value: LoyaltySettings[K]
  ) => {
    setLoyaltySettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSaveLoyalty = async () => {
    if (!currentBranchId) {
      toast("No active branch selected", "error");
      return;
    }

    setLoyaltySaving(true);

    try {
      const saved = await updateLoyaltySettings(
        currentBranchId,
        loyaltySettings
      );

      setLoyaltySettings(saved);

      toast(
        locale === "ar"
          ? "تم حفظ إعدادات الولاء بنجاح"
          : "Loyalty settings saved successfully",
        "success"
      );
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : "Failed to save loyalty settings",
        "error"
      );
    } finally {
      setLoyaltySaving(false);
    }
  };

  const handleLogoChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/") || file.size > MAX_LOGO_BYTES) {
      toast(t.products.imageUploadError, "error");
      return;
    }

    setUploadingLogo(true);

    try {
      const transparentPng = await makeLogoBackgroundTransparent(file);
      const url = await uploadImage(transparentPng, "logos");
      await updateSettings({ logo: url });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  const isArabic = locale === "ar";
  const sections = [
    { id: "shop" as const, label: isArabic ? "المحل والطاولات" : "Shop & tables", description: isArabic ? "تقسيمات الطعام وبيانات المحل" : "Dining areas and shop details", Icon: Store },
    { id: "receipt" as const, label: isArabic ? "الإيصال" : "Receipt", description: isArabic ? "بيانات الإيصال ومعاينة شكله" : "Receipt details and a live preview", Icon: ReceiptText },
    { id: "business" as const, label: isArabic ? "البيزنس والعملاء" : "Business tools", description: isArabic ? "قائمة QR والخصومات والولاء" : "QR menu, promotions and loyalty", Icon: SlidersHorizontal },
    { id: "payments" as const, label: isArabic ? "طرق الدفع" : "Payment methods", description: isArabic ? "إدارة طرق الدفع المتاحة للكاشير" : "Manage payment options available at checkout", Icon: CreditCard },
  ];

  return (
    <AppShell title={t.settings.title}>
      <div className="space-y-5 p-4 sm:p-6 pb-10">

        <p className="text-sm text-muted-foreground">
          {t.settings.subtitle}
        </p>

        <nav role="tablist" aria-label={isArabic ? "أقسام الإعدادات" : "Settings sections"} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {sections.map(({ id, label, description, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeSection === id}
              onClick={() => setActiveSection(id)}
              className={cn(
                "flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-start transition-all",
                activeSection === id
                  ? "border-primary/60 bg-primary/10 shadow-sm ring-1 ring-primary/30"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/60"
              )}
            >
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", activeSection === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
              </span>
            </button>
          ))}
        </nav>

        <div hidden={activeSection !== "shop"} className="space-y-5">
        <TableManager />

        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.general}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <Label>{t.settings.logo}</Label>

              <div className="mt-1.5 flex items-center gap-3">
                <ShopLogo className="h-12 w-12 shrink-0 rounded-lg" />

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingLogo
                    ? t.common.loading
                    : t.settings.uploadLogo}
                </Button>

                {settings.logo && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateSettings({ logo: null })}
                  >
                    {t.settings.removeLogo}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t.settings.shopName}</Label>

                <Input
                  className="mt-1.5"
                  value={settings.shopName}
                  onChange={(e) =>
                    updateSettings({ shopName: e.target.value })
                  }
                />
              </div>

              <div>
                <Label>{t.settings.currency}</Label>

                <Input
                  className="mt-1.5"
                  value={settings.currencySymbol}
                  onChange={(e) =>
                    updateSettings({
                      currencySymbol: e.target.value,
                      currency: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>{t.settings.enableTax}</Label>
                <p className="text-xs text-muted-foreground">
                  VAT / Sales Tax
                </p>
              </div>

              <Switch
                checked={settings.taxEnabled}
                onCheckedChange={(v) =>
                  updateSettings({ taxEnabled: v })
                }
              />
            </div>

            {settings.taxEnabled && (
              <div>
                <Label>{t.settings.taxRate}</Label>

                <Input
                  className="mt-1.5 max-w-[160px]"
                  type="number"
                  value={settings.taxRate}
                  onChange={(e) =>
                    updateSettings({
                      taxRate: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        <div hidden={activeSection !== "business"} className="space-y-5">
        <MenuQrManager />

        <Card>
          <CardHeader className="p-0">
            <button
              type="button"
              aria-expanded={showCashierDevices}
              onClick={() => setShowCashierDevices((open) => !open)}
              className="flex w-full items-center justify-between gap-3 rounded-xl p-5 text-start transition-colors hover:bg-muted/40"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><MonitorCog className="h-5 w-5" /></span>
                <span>
                  <span className="block text-base font-semibold">{isArabic ? "تفعيل أجهزة الكاشير" : "Cashier device activation"}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{isArabic ? "إنشاء كود ربط جهاز بفرع" : "Issue a code to connect a cashier computer to a branch"}</span>
                </span>
              </span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", showCashierDevices && "rotate-180")} />
            </button>
          </CardHeader>
          {showCashierDevices && <CardContent className="pt-0"><CashierDeviceManager /></CardContent>}
        </Card>

        {/* Promo codes */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" />{isArabic ? "أكواد الخصم" : "Promo Codes"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{isArabic ? "أنشئ كودًا مرتبطًا بعميل مسجل ونسبة خصم ومدة صلاحية. عند إدخال الكود في الـ POS سيُضاف العميل تلقائيًا للطلب." : "Create a code linked to a registered customer, with a discount and validity period. Entering it in the POS adds that customer to the order automatically."}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.5fr_auto] lg:items-end">
              <div><Label>{isArabic ? "اسم البرومو كود" : "Promo code"}</Label><Input className="mt-1" value={promoName} onChange={(e) => setPromoName(e.target.value.toUpperCase())} placeholder="WELCOME10" /></div>
              <div><Label>{isArabic ? "نسبة الخصم %" : "Discount %"}</Label><Input className="mt-1" type="number" min="1" max="100" value={promoPercent} onChange={(e) => setPromoPercent(e.target.value)} /></div>
              <div><Label>{isArabic ? "المدة بالأيام" : "Duration (days)"}</Label><Input className="mt-1" type="number" min="1" step="1" value={promoDays} onChange={(e) => setPromoDays(e.target.value)} /></div>
              <div>
                <Label>{isArabic ? "العميل المرتبط بالكود" : "Customer linked to code"}</Label>
                {promoCustomer ? <div className="mt-1 flex h-10 items-center justify-between rounded-md border px-3 text-sm"><span>{promoCustomer.name} · {promoCustomer.phone}</span><Button variant="ghost" size="sm" onClick={() => { setPromoCustomer(null); setPromoCustomerQuery(""); }}>{isArabic ? "تغيير" : "Change"}</Button></div> : <div className="mt-1 flex gap-2"><Input value={promoCustomerQuery} onChange={(e) => { setPromoCustomerQuery(e.target.value); setPromoCustomerResults([]); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchPromoCustomers(); } }} placeholder={isArabic ? "ابحث بالاسم أو الهاتف" : "Search name or phone"} /><Button type="button" variant="outline" disabled={promoCustomerSearching || !promoCustomerQuery.trim()} onClick={searchPromoCustomers}><Search className="h-4 w-4" /><span className="sr-only">{isArabic ? "بحث" : "Search"}</span></Button></div>}
                {!promoCustomer && promoCustomerResults.length > 0 && <div className="mt-1 max-h-36 overflow-auto rounded-md border">{promoCustomerResults.map((customer) => <button type="button" key={customer.id} onClick={() => { setPromoCustomer(customer); setPromoCustomerResults([]); setPromoCustomerQuery(customer.name); }} className="block w-full border-b px-3 py-2 text-start text-sm last:border-0 hover:bg-muted">{customer.name} · {customer.phone}</button>)}</div>}
                {!promoCustomer && promoCustomerResults.length === 0 && promoCustomerQuery.trim() && <p className="mt-1 text-xs text-muted-foreground">{isArabic ? "ابحث واختر عميلًا مسجلًا" : "Search and select a registered customer"}</p>}
              </div>
              <Button disabled={promoSaving || !promoName.trim() || !promoCustomer || !currentBranchId} onClick={handleCreatePromoCode}><Plus className="me-1 h-4 w-4" />{isArabic ? "إنشاء" : "Create"}</Button>
            </div>
            {promoCodes.length > 0 ? <div className="divide-y rounded-lg border">{promoCodes.map((promo) => {
              const expired = new Date(promo.expiresAt).getTime() <= Date.now();
              return <div key={promo.id} className="flex items-center justify-between gap-3 p-3">
                <div><p className="font-semibold">{promo.code} <span className="ms-2 text-sm text-primary">{promo.discountPercent}%</span></p><p className="text-xs text-muted-foreground">{expired ? (isArabic ? "منتهي" : "Expired") : (isArabic ? "ينتهي " : "Expires ") + new Date(promo.expiresAt).toLocaleString(locale === "ar" ? "ar-EG" : "en-US")} · {promo.durationDays} {isArabic ? "يوم" : "days"} · {promo.customerName ?? (isArabic ? "الكود غير مربوط بعميل" : "No customer linked")}{promo.customerPhone ? ` · ${promo.customerPhone}` : ""}</p></div>
                <Button variant="ghost" size="icon" aria-label={isArabic ? "حذف الكود" : "Delete code"} onClick={() => handleDeletePromoCode(promo.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>;
            })}</div> : <p className="text-sm text-muted-foreground">{isArabic ? "لا توجد أكواد خصم حتى الآن" : "No promo codes created yet"}</p>}
          </CardContent>
        </Card>

        {/* Loyalty */}
        <Card>
          <CardHeader className="p-0">
            <button type="button" aria-expanded={showLoyaltySettings} onClick={() => setShowLoyaltySettings((open) => !open)} className="flex w-full items-center justify-between gap-3 rounded-xl p-5 text-start transition-colors hover:bg-muted/40">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Tag className="h-5 w-5" /></span>
                <span>
                  <span className="block text-base font-semibold">{isArabic ? "برنامج الولاء" : "Loyalty Program"}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{loyaltyLoading ? (isArabic ? "جاري تحميل الإعدادات" : "Loading settings") : loyaltySettings.enabled ? (isArabic ? "مفعّل" : "Enabled") : (isArabic ? "غير مفعّل" : "Disabled")}</span>
                </span>
              </span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", showLoyaltySettings && "rotate-180")} />
            </button>
          </CardHeader>

          {showLoyaltySettings && <CardContent className="space-y-5 pt-0">
            {loyaltyLoading ? (
              <p className="text-sm text-muted-foreground">
                {isArabic
                  ? "جاري تحميل إعدادات الولاء..."
                  : "Loading loyalty settings..."}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label>
                      {isArabic
                        ? "تفعيل برنامج الولاء"
                        : "Enable Loyalty Program"}
                    </Label>

                    <p className="text-xs text-muted-foreground">
                      {isArabic
                        ? "تفعيل أو إيقاف احتساب النقاط للعملاء"
                        : "Enable or disable loyalty points for customers"}
                    </p>
                  </div>

                  <Switch
                    checked={loyaltySettings.enabled}
                    onCheckedChange={(value) =>
                      handleLoyaltyChange("enabled", value)
                    }
                  />
                </div>

                <div>
                  <Label>
                    {isArabic
                      ? "طريقة احتساب النقاط"
                      : "Points Calculation Method"}
                  </Label>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleLoyaltyChange(
                          "pointMode",
                          "order_value"
                        )
                      }
                      className={cn(
                        "rounded-lg border p-4 text-left transition",
                        loyaltySettings.pointMode === "order_value"
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      )}
                    >
                      <div className="font-medium">
                        {isArabic
                          ? "حسب قيمة الطلب"
                          : "Order Value"}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {isArabic
                          ? "النقاط تعتمد على قيمة الفاتورة"
                          : "Points are based on the order amount"}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleLoyaltyChange(
                          "pointMode",
                          "products"
                        )
                      }
                      className={cn(
                        "rounded-lg border p-4 text-left transition",
                        loyaltySettings.pointMode === "products"
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      )}
                    >
                      <div className="font-medium">
                        {isArabic
                          ? "حسب المنتجات"
                          : "Products"}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {isArabic
                          ? "كل منتج يمكن أن يكون له نقاط خاصة"
                          : "Each product can have its own points"}
                      </div>
                    </button>
                  </div>
                </div>

                {loyaltySettings.pointMode === "order_value" && (
                  <div>
                    <Label>
                      {isArabic
                        ? "كل كام جنيه = نقطة واحدة؟"
                        : "How much EGP gives 1 point?"}
                    </Label>

                    <Input
                      className="mt-1.5 max-w-[220px]"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={loyaltySettings.amountPerPoint}
                      onChange={(e) =>
                        handleLoyaltyChange(
                          "amountPerPoint",
                          Number(e.target.value) || 0
                        )
                      }
                    />

                    <p className="mt-1 text-xs text-muted-foreground">
                      {isArabic
                        ? "مثال: 10 = كل 10 جنيه نقطة واحدة"
                        : "Example: 10 means every 10 EGP earns 1 point"}
                    </p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>
                      {isArabic
                        ? "الحد الأدنى لقيمة الطلب للحصول على نقاط"
                        : "Minimum Order Value to Earn Points"}
                    </Label>

                    <Input
                      className="mt-1.5"
                      type="number"
                      min="0"
                      step="0.01"
                      value={loyaltySettings.minimumOrderValue}
                      onChange={(e) =>
                        handleLoyaltyChange(
                          "minimumOrderValue",
                          Number(e.target.value) || 0
                        )
                      }
                    />
                  </div>

                  <div>
                    <Label>
                      {isArabic
                        ? "الحد الأدنى لعدد الطلبات"
                        : "Minimum Number of Orders"}
                    </Label>

                    <Input
                      className="mt-1.5"
                      type="number"
                      min="0"
                      step="1"
                      value={loyaltySettings.minimumOrders}
                      onChange={(e) =>
                        handleLoyaltyChange(
                          "minimumOrders",
                          Math.max(
                            0,
                            Math.floor(Number(e.target.value) || 0)
                          )
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>
                      {isArabic
                        ? "تأخير إضافة النقاط بالدقائق"
                        : "Points Delay (Minutes)"}
                    </Label>

                    <Input
                      className="mt-1.5"
                      type="number"
                      min="0"
                      step="1"
                      value={loyaltySettings.pointsDelayMinutes}
                      onChange={(e) =>
                        handleLoyaltyChange(
                          "pointsDelayMinutes",
                          Math.max(
                            0,
                            Math.floor(Number(e.target.value) || 0)
                          )
                        )
                      }
                    />

                    <p className="mt-1 text-xs text-muted-foreground">
                      {isArabic
                        ? "النقاط تصبح متاحة بعد انتهاء هذه المدة"
                        : "Points become available after this delay"}
                    </p>
                  </div>

                  <div>
                    <Label>
                      {isArabic
                        ? "عدد النقاط المطلوبة للمكافأة"
                        : "Points Required for Reward"}
                    </Label>

                    <Input
                      className="mt-1.5"
                      type="number"
                      min="1"
                      step="1"
                      value={loyaltySettings.pointsPerReward}
                      onChange={(e) =>
                        handleLoyaltyChange(
                          "pointsPerReward",
                          Math.max(
                            1,
                            Math.floor(Number(e.target.value) || 1)
                          )
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>
                      {isArabic
                        ? "قيمة الخصم للمكافأة"
                        : "Reward Discount Amount"}
                    </Label>

                    <Input
                      className="mt-1.5"
                      type="number"
                      min="0"
                      step="0.01"
                      value={loyaltySettings.rewardAmount}
                      onChange={(e) =>
                        handleLoyaltyChange(
                          "rewardAmount",
                          Number(e.target.value) || 0
                        )
                      }
                    />

                    <p className="mt-1 text-xs text-muted-foreground">
                      {isArabic
                        ? "مثال: 100 نقطة = 10 جنيه خصم"
                        : "Example: 100 points = 10 EGP discount"}
                    </p>
                  </div>

                  <div>
                    <Label>
                      {isArabic
                        ? "الحد الأدنى لقيمة الطلب لاستخدام النقاط"
                        : "Minimum Order Value to Redeem"}
                    </Label>

                    <Input
                      className="mt-1.5"
                      type="number"
                      min="0"
                      step="0.01"
                      value={loyaltySettings.minimumRedeemOrderValue}
                      onChange={(e) =>
                        handleLoyaltyChange(
                          "minimumRedeemOrderValue",
                          Number(e.target.value) || 0
                        )
                      }
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                  <div className="font-medium">
                    {isArabic
                      ? "ملخص الإعدادات الحالية"
                      : "Current Loyalty Summary"}
                  </div>

                  <div className="mt-2 grid gap-2 text-muted-foreground sm:grid-cols-2">
                    <div>
                      {isArabic ? "النقاط:" : "Points:"}{" "}
                      {loyaltySettings.pointMode === "order_value"
                        ? `${loyaltySettings.amountPerPoint} EGP = 1 point`
                        : "Per Product"}
                    </div>

                    <div>
                      {isArabic ? "التأخير:" : "Delay:"}{" "}
                      {loyaltySettings.pointsDelayMinutes} min
                    </div>

                    <div>
                      {isArabic ? "المكافأة:" : "Reward:"}{" "}
                      {loyaltySettings.pointsPerReward} points ={" "}
                      {loyaltySettings.rewardAmount} EGP
                    </div>

                    <div>
                      {isArabic ? "حد الاستخدام:" : "Redeem minimum:"}{" "}
                      {loyaltySettings.minimumRedeemOrderValue} EGP
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSaveLoyalty}
                    disabled={loyaltySaving || !currentBranchId}
                  >
                    {loyaltySaving
                      ? isArabic
                        ? "جاري الحفظ..."
                        : "Saving..."
                      : isArabic
                        ? "حفظ إعدادات الولاء"
                        : "Save Loyalty Settings"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>}
        </Card>

        </div>

        {/* Receipt */}
        <div hidden={activeSection !== "receipt"} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.receiptSettings}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <Label>{isArabic ? "عنوان الإيصال" : "Receipt header"}</Label>
              <div className="mt-1.5 flex items-center gap-3 rounded-lg border p-3">
                <ShopLogo className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{settings.shopName || (isArabic ? "اسم المحل" : "Shop name")}</p>
                  <p className="text-xs text-muted-foreground">{isArabic ? "الشعار واسم المحل يظهران أعلى الإيصال" : "The logo and shop name appear at the top of the receipt"}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{isArabic ? "العنوان على الإيصال" : "Receipt address"}</Label>
                <Input className="mt-1.5" value={settings.address ?? ""} onChange={(e) => updateSettings({ address: e.target.value })} />
              </div>
              <div>
                <Label>{isArabic ? "رقم الهاتف على الإيصال" : "Receipt phone"}</Label>
                <Input className="mt-1.5" value={settings.phone ?? ""} onChange={(e) => updateSettings({ phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>{t.settings.receiptFooter}</Label>

              <Input
                className="mt-1.5"
                value={settings.receiptFooter?.en ?? ""}
                onChange={(e) =>
                  updateSettings({
                    receiptFooter: {
                      en: e.target.value,
                      ar: settings.receiptFooter?.ar ?? "",
                    },
                  })
                }
              />
            </div>
            <div>
              <Label>{isArabic ? "نص أسفل الإيصال (عربي)" : "Receipt footer (Arabic)"}</Label>
              <Input
                dir="rtl"
                className="mt-1.5"
                value={settings.receiptFooter?.ar ?? ""}
                onChange={(e) => updateSettings({
                  receiptFooter: {
                    en: settings.receiptFooter?.en ?? "",
                    ar: e.target.value,
                  },
                })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isArabic ? "معاينة الإيصال" : "Receipt preview"}</CardTitle>
            <p className="text-sm text-muted-foreground">{t.devices.previewLabel}</p>
          </CardHeader>
          <CardContent>
            <div className="mx-auto flex max-w-2xl justify-center rounded-xl border bg-muted/40 p-5 shadow-inner sm:p-8">
              <ReceiptView order={SAMPLE_RECEIPT_ORDER} preview />
            </div>
          </CardContent>
        </Card>
        </div>

        <div hidden={activeSection !== "payments"} className="space-y-5">
          <PaymentMethodsManager />
        </div>

      </div>

    </AppShell>
  );
}
