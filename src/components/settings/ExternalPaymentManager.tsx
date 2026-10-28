"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PaymentBrandMark } from "@/components/shared/PaymentBrandMark";
import { toast } from "@/components/ui/toast";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_PAYMENT_METHODS,
  builtInPaymentMethod,
  externalPaymentMethods,
  isBuiltInPaymentName,
  isBuiltInPaymentEnabled,
} from "@/lib/externalPayment";
import type { ExternalPaymentMethod } from "@/lib/types";

export function PaymentMethodsManager() {
  const { t, locale } = useI18n();
  const settings = useDataStore((state) => state.settings);
  const updateSettings = useDataStore((state) => state.updateSettings);
  const getConfiguredMethods = () => externalPaymentMethods(settings);
  const [methods, setMethods] = useState<ExternalPaymentMethod[]>(getConfiguredMethods);
  const [cashEnabled, setCashEnabled] = useState(() => isBuiltInPaymentEnabled(settings, "cash"));
  const [visaEnabled, setVisaEnabled] = useState(() => isBuiltInPaymentEnabled(settings, "visa"));
  const [instapayEnabled, setInstapayEnabled] = useState(() => isBuiltInPaymentEnabled(settings, "instapay"));
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    setMethods(getConfiguredMethods());
    setCashEnabled(isBuiltInPaymentEnabled(settings, "cash"));
    setVisaEnabled(isBuiltInPaymentEnabled(settings, "visa"));
    setInstapayEnabled(isBuiltInPaymentEnabled(settings, "instapay"));
    setDirty(false);
  }, [settings.externalPaymentMethods, settings.externalPaymentName, settings.externalPaymentIcon]);

  const updateMethod = (id: string, patch: Partial<ExternalPaymentMethod>) => {
    setMethods((current) => current.map((method) => method.id === id ? { ...method, ...patch } : method));
    setDirty(true);
  };

  const addMethod = async () => {
    const name = newName.trim();
    if (!name) {
      toast(locale === "ar" ? "اكتب اسم طريقة الدفع" : "Enter a payment method name", "error");
      return;
    }
    if (isBuiltInPaymentName(name) || methods.some((method) =>
      method.name.en.trim().toLocaleLowerCase() === name.toLocaleLowerCase() ||
      method.name.ar.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
    )) {
      toast(locale === "ar" ? "طريقة الدفع بهذا الاسم موجودة بالفعل" : "A payment method with that name already exists", "error");
      return;
    }

    const id = `external_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const nextMethods = [...methods, { id, name: { en: name, ar: name }, icon: "Wallet", enabled: true }];
    const saved = await persistMethods(nextMethods, cashEnabled, visaEnabled, instapayEnabled);
    if (saved) {
      setNewName("");
      setShowAddForm(false);
    }
  };

  const persistMethods = async (
    nextMethods = methods,
    nextCashEnabled = cashEnabled,
    nextVisaEnabled = visaEnabled,
    nextInstapayEnabled = instapayEnabled
  ) => {
    if (nextMethods.some((method) => !method.name.en.trim() || !method.name.ar.trim())) {
      toast(t.settings.externalPaymentNameRequired, "error");
      return false;
    }
    if (nextMethods.some((method) => isBuiltInPaymentName(method.name.en) || isBuiltInPaymentName(method.name.ar))) {
      toast(locale === "ar" ? "أسماء الكاش والفيزا وإنستا باي محجوزة للطرق الأساسية" : "Cash, Visa, and InstaPay are reserved for built-in methods", "error");
      return false;
    }

    setSaving(true);
    const builtIns: ExternalPaymentMethod[] = [
      { ...builtInPaymentMethod(settings, "cash"), enabled: nextCashEnabled },
      { ...builtInPaymentMethod(settings, "visa"), enabled: nextVisaEnabled },
      { ...DEFAULT_PAYMENT_METHODS[0], enabled: nextInstapayEnabled },
    ];
    const saved = await updateSettings({
      externalPaymentMethods: [...builtIns, ...nextMethods],
    });
    setSaving(false);
    if (saved) {
      setMethods(nextMethods);
      setCashEnabled(nextCashEnabled);
      setVisaEnabled(nextVisaEnabled);
      setInstapayEnabled(nextInstapayEnabled);
      setDirty(false);
      toast(t.settings.externalPaymentSaved, "success");
    }
    return Boolean(saved);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.externalPayment}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">{t.settings.externalPaymentDesc}</p>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { id: "cash", label: t.pos.cash, brand: "cash" as const, enabled: cashEnabled, setEnabled: setCashEnabled },
              { id: "visa", label: t.pos.card, brand: "visa" as const, enabled: visaEnabled, setEnabled: setVisaEnabled },
              { id: "instapay", label: locale === "ar" ? "إنستا باي" : "InstaPay", brand: "instapay" as const, enabled: instapayEnabled, setEnabled: setInstapayEnabled },
            ].map((method) => (
              <div key={method.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                  method.brand === "cash" ? "border-emerald-200/80 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300" :
                    method.brand === "visa" ? "border-blue-200/80 bg-blue-50/70 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300" :
                      "border-orange-200/80 bg-orange-50/70 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300"
                }`}>
                  <PaymentBrandMark brand={method.brand} className={method.brand === "cash" ? "h-7 w-8" : method.brand === "visa" ? "h-6 w-10" : "h-5 w-10"} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{method.label}</p>
                  <p className="text-xs text-muted-foreground">{t.settings.paymentMethodBuiltIn}</p>
                </div>
                <Switch checked={method.enabled} onCheckedChange={(checked) => { method.setEnabled(checked); setDirty(true); }} aria-label={`${method.label} ${method.enabled ? (locale === "ar" ? "مفعّل" : "enabled") : (locale === "ar" ? "متوقف" : "disabled")}`} />
              </div>
            ))}
          </div>
          {methods.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t.settings.externalPaymentEmpty}
            </p>
          )}
          {methods.map((method) => (
            <div key={method.id} className="rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary"><Wallet className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1 text-sm font-medium">{method.name[locale] || method.name.en}</span>
                <span className="text-xs text-muted-foreground">{method.enabled === false ? (locale === "ar" ? "متوقفة" : "Disabled") : (locale === "ar" ? "مفعّلة" : "Enabled")}</span>
                <Switch checked={method.enabled !== false} onCheckedChange={(enabled) => updateMethod(method.id, { enabled })} aria-label={`${method.name[locale]} ${locale === "ar" ? "تفعيل" : "enabled"}`} />
                <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => { setMethods((current) => current.filter((item) => item.id !== method.id)); setDirty(true); }} aria-label={t.settings.externalPaymentDelete} title={t.settings.externalPaymentDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${method.id}-en`}>{t.settings.externalPaymentNameEn}</Label>
                  <Input
                    id={`${method.id}-en`}
                    className="mt-1.5"
                    value={method.name.en}
                    onChange={(event) => updateMethod(method.id, { name: { ...method.name, en: event.target.value } })}
                  />
                </div>
                <div>
                  <Label htmlFor={`${method.id}-ar`}>{t.settings.externalPaymentNameAr}</Label>
                  <Input
                    id={`${method.id}-ar`}
                    dir="rtl"
                    className="mt-1.5"
                    value={method.name.ar}
                    onChange={(event) => updateMethod(method.id, { name: { ...method.name, ar: event.target.value } })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {showAddForm ? <div className="rounded-xl bg-muted/50 p-4">
          <p className="mb-3 text-sm font-semibold">{t.settings.externalPaymentAdd}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1">
              <Label htmlFor="new-external-payment-name">{locale === "ar" ? "اسم طريقة الدفع" : "Payment method name"}</Label>
              <Input id="new-external-payment-name" dir={locale === "ar" ? "rtl" : "ltr"} className="mt-1.5" value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addMethod(); }} />
            </div>
            <Button type="button" variant="outline" onClick={() => setShowAddForm(false)} disabled={saving}>{locale === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button type="button" onClick={addMethod} disabled={!newName.trim() || saving}>
              <Plus className="h-4 w-4" /> {t.settings.externalPaymentAddButton}
            </Button>
          </div>
        </div> : <Button type="button" variant="outline" onClick={() => setShowAddForm(true)}><Plus className="h-4 w-4" />{locale === "ar" ? "إضافة طريقة دفع" : "Add payment method"}</Button>}

        <div className="flex justify-end">
          <Button type="button" onClick={() => persistMethods()} disabled={!dirty || saving}>
            <Save className="h-4 w-4" /> {saving ? t.settings.externalPaymentSaving : t.settings.externalPaymentSave}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
