"use client";

import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Download, Upload, FileSpreadsheet, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ShopLogo } from "@/components/layout/ShopLogo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useSystemLogStore } from "@/lib/store/useSystemLogStore";
import { usePrintQueueStore } from "@/lib/store/usePrintQueueStore";
import { useOrderQueueStore } from "@/lib/store/useOrderQueueStore";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  uploadImage,
  fetchLoyaltySettings,
  updateLoyaltySettings,
} from "@/lib/supabase/api";
import { exportAllToCsv } from "@/lib/export";
import { APP_VERSION, BUILD_LABEL } from "@/lib/version";
import {
  EXTERNAL_PAYMENT_ICON_KEYS,
  DEFAULT_EXTERNAL_PAYMENT_NAME,
  DEFAULT_EXTERNAL_PAYMENT_ICON,
  getExternalPaymentIcon,
} from "@/lib/externalPayment";
import type { LoyaltySettings, MultiPricingSettings } from "@/lib/types";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const DEFAULT_MULTI_PRICING: MultiPricingSettings = {
  enabled: false,
  primaryLabel: { en: "Primary Price", ar: "السعر الأساسي" },
  secondaryLabel: { en: "Second Price", ar: "السعر الثاني" },
};

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

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  const settings = useDataStore((s) => s.settings);
  const updateSettings = useDataStore((s) => s.updateSettings);

  const currentBranchId = useBranchStore((s) => s.currentBranchId);

  const clearSystemLog = useSystemLogStore((s) => s.clear);
  const clearPrintQueue = usePrintQueueStore((s) => s.clear);
  const clearOrderQueue = useOrderQueueStore((s) => s.clear);
  const pendingOfflineOrders = useOrderQueueStore((s) => s.queue.length);

  const multiPricing = settings.multiPricing ?? DEFAULT_MULTI_PRICING;
  const externalName =
    settings.externalPaymentName ?? DEFAULT_EXTERNAL_PAYMENT_NAME;
  const externalIconKey =
    settings.externalPaymentIcon ?? DEFAULT_EXTERNAL_PAYMENT_ICON;

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [resetLocalOpen, setResetLocalOpen] = useState(false);

  // Loyalty
  const [loyaltySettings, setLoyaltySettings] =
    useState<LoyaltySettings>(DEFAULT_LOYALTY_SETTINGS);
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);
  const [loyaltySaving, setLoyaltySaving] = useState(false);

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

  const handleResetLocalData = () => {
    clearSystemLog();
    clearPrintQueue();
    clearOrderQueue();
    setResetLocalOpen(false);
    toast(t.settings.resetLocalDataDone, "success");
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
      const url = await uploadImage(file, "logos");
      updateSettings({ logo: url });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleExportData = () => {
    const state = useDataStore.getState();

    const blob = new Blob(
      [JSON.stringify(state, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "sanky-pos-data-export.json";
    a.click();

    URL.revokeObjectURL(url);
  };

  const [exportingCsv, setExportingCsv] = useState(false);

  const handleExportCsv = async () => {
    setExportingCsv(true);

    try {
      const count = await exportAllToCsv(useDataStore.getState());

      toast(
        count > 0
          ? `${t.settings.csvExported} (${count})`
          : t.settings.nothingToExport,
        count > 0 ? "success" : "info"
      );
    } finally {
      setExportingCsv(false);
    }
  };

  const isArabic = locale === "ar";

  return (
    <AppShell title={t.settings.title}>
      <div className="space-y-5 p-4 sm:p-6 pb-10">

        <p className="text-sm text-muted-foreground">
          {t.settings.subtitle}
        </p>

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
                    onClick={() => updateSettings({ logo: undefined })}
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

        {/* Loyalty */}
        <Card>
          <CardHeader>
            <CardTitle>
              {isArabic ? "برنامج الولاء" : "Loyalty Program"}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
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
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.appearance}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t.settings.language}</Label>

              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  onClick={() => setLocale("en")}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium",
                    locale === "en" && "bg-background shadow-sm"
                  )}
                >
                  English
                </button>

                <button
                  onClick={() => setLocale("ar")}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium",
                    locale === "ar" && "bg-background shadow-sm"
                  )}
                >
                  العربية
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>{t.settings.theme}</Label>

              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium",
                    theme === "light" && "bg-background shadow-sm"
                  )}
                >
                  <Sun className="h-3.5 w-3.5" />
                  {t.settings.light}
                </button>

                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium",
                    theme === "dark" && "bg-background shadow-sm"
                  )}
                >
                  <Moon className="h-3.5 w-3.5" />
                  {t.settings.dark}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receipt */}
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.receiptSettings}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        {/* Multi Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.multiPricing}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>{t.settings.multiPricingEnable}</Label>

                <p className="text-xs text-muted-foreground">
                  {t.settings.multiPricingDesc}
                </p>
              </div>

              <Switch
                checked={multiPricing.enabled}
                onCheckedChange={(v) =>
                  updateSettings({
                    multiPricing: {
                      ...multiPricing,
                      enabled: v,
                    },
                  })
                }
              />
            </div>

            {multiPricing.enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>{t.settings.multiPricingPrimaryLabel}</Label>

                  <Input
                    className="mt-1.5"
                    value={multiPricing.primaryLabel.en}
                    onChange={(e) =>
                      updateSettings({
                        multiPricing: {
                          ...multiPricing,
                          primaryLabel: {
                            ...multiPricing.primaryLabel,
                            en: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>

                <div>
                  <Label>{t.settings.multiPricingSecondaryLabel}</Label>

                  <Input
                    className="mt-1.5"
                    value={multiPricing.secondaryLabel.en}
                    onChange={(e) =>
                      updateSettings({
                        multiPricing: {
                          ...multiPricing,
                          secondaryLabel: {
                            ...multiPricing.secondaryLabel,
                            en: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* External Payment */}
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.externalPayment}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {t.settings.externalPaymentDesc}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t.settings.externalPaymentNameEn}</Label>

                <Input
                  className="mt-1.5"
                  value={externalName.en}
                  onChange={(e) =>
                    updateSettings({
                      externalPaymentName: {
                        ...externalName,
                        en: e.target.value,
                      },
                    })
                  }
                />
              </div>

              <div>
                <Label>{t.settings.externalPaymentNameAr}</Label>

                <Input
                  className="mt-1.5"
                  dir="rtl"
                  value={externalName.ar}
                  onChange={(e) =>
                    updateSettings({
                      externalPaymentName: {
                        ...externalName,
                        ar: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div>
              <Label>{t.settings.externalPaymentIcon}</Label>

              <div className="mt-1.5 flex flex-wrap gap-2">
                {EXTERNAL_PAYMENT_ICON_KEYS.map((key) => {
                  const Icon = getExternalPaymentIcon(key);

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        updateSettings({
                          externalPaymentIcon: key,
                        })
                      }
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-lg border",
                        externalIconKey === key
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      )}
                      title={key}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.dataManagement}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t.settings.backupNote}
            </p>

            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={exportingCsv}
              onClick={handleExportCsv}
            >
              <FileSpreadsheet className="h-4 w-4" />

              {exportingCsv
                ? t.settings.exporting
                : t.settings.exportCsvAll}
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleExportData}
            >
              <Download className="h-4 w-4" />
              {t.settings.exportData}
            </Button>
          </CardContent>
        </Card>

        {/* Reset Local Data */}
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.resetLocalData}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t.settings.resetLocalDataDesc}
            </p>

            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => setResetLocalOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              {t.settings.resetLocalData}
            </Button>
          </CardContent>
        </Card>

        {/* Version */}
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-semibold">{t.app.name}</p>

              <p className="text-xs text-muted-foreground">
                {t.settings.version} {APP_VERSION}
              </p>
            </div>

            <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              {BUILD_LABEL}
            </span>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={resetLocalOpen}
        onOpenChange={setResetLocalOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.settings.resetLocalDataConfirmTitle}
            </AlertDialogTitle>

            <AlertDialogDescription>
              {t.settings.resetLocalDataConfirmDesc}

              {pendingOfflineOrders > 0 && (
                <span className="mt-2 block font-semibold text-destructive">
                  Warning: {pendingOfflineOrders} order
                  {pendingOfflineOrders > 1 ? "s" : ""} on this device{" "}
                  {pendingOfflineOrders > 1 ? "are" : "is"} still waiting
                  to sync and will be permanently lost.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>
              {t.common.cancel}
            </AlertDialogCancel>

            <AlertDialogAction onClick={handleResetLocalData}>
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}