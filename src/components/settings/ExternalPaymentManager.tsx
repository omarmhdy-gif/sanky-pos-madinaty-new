"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_EXTERNAL_PAYMENT_ICON,
  DEFAULT_EXTERNAL_PAYMENT_NAME,
  EXTERNAL_PAYMENT_ICON_KEYS,
  externalPaymentMethods,
  getExternalPaymentIcon,
} from "@/lib/externalPayment";
import type { ExternalPaymentMethod } from "@/lib/types";

export function ExternalPaymentManager() {
  const { t } = useI18n();
  const settings = useDataStore((state) => state.settings);
  const updateSettings = useDataStore((state) => state.updateSettings);
  const [methods, setMethods] = useState<ExternalPaymentMethod[]>(() => externalPaymentMethods(settings));
  const [newNameEn, setNewNameEn] = useState("");
  const [newNameAr, setNewNameAr] = useState("");
  const [newIcon, setNewIcon] = useState<string>(DEFAULT_EXTERNAL_PAYMENT_ICON);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setMethods(externalPaymentMethods(settings));
    setDirty(false);
  }, [settings.externalPaymentMethods, settings.externalPaymentName, settings.externalPaymentIcon]);

  const updateMethod = (id: string, patch: Partial<ExternalPaymentMethod>) => {
    setMethods((current) => current.map((method) => method.id === id ? { ...method, ...patch } : method));
    setDirty(true);
  };

  const addMethod = () => {
    const en = newNameEn.trim();
    const ar = newNameAr.trim();
    if (!en || !ar) {
      toast(t.settings.externalPaymentNameRequired, "error");
      return;
    }

    const id = `external_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    setMethods((current) => [...current, { id, name: { en, ar }, icon: newIcon }]);
    setNewNameEn("");
    setNewNameAr("");
    setDirty(true);
  };

  const saveMethods = async () => {
    if (methods.some((method) => !method.name.en.trim() || !method.name.ar.trim())) {
      toast(t.settings.externalPaymentNameRequired, "error");
      return;
    }

    setSaving(true);
    const firstMethod = methods[0];
    const saved = await updateSettings({
      externalPaymentMethods: methods,
      externalPaymentName: firstMethod?.name ?? DEFAULT_EXTERNAL_PAYMENT_NAME,
      externalPaymentIcon: firstMethod?.icon ?? DEFAULT_EXTERNAL_PAYMENT_ICON,
    });
    setSaving(false);
    if (saved) {
      setDirty(false);
      toast(t.settings.externalPaymentSaved, "success");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.externalPayment}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">{t.settings.externalPaymentDesc}</p>

        <div className="space-y-3">
          {methods.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t.settings.externalPaymentEmpty}
            </p>
          )}
          {methods.map((method) => (
            <div key={method.id} className="rounded-xl border border-border p-4">
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="me-1 text-xs text-muted-foreground">{t.settings.externalPaymentIcon}</span>
                {EXTERNAL_PAYMENT_ICON_KEYS.map((key) => {
                  const Icon = getExternalPaymentIcon(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateMethod(method.id, { icon: key })}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg border ${method.icon === key ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                      title={key}
                      aria-label={`${t.settings.externalPaymentIcon}: ${key}`}
                      aria-pressed={method.icon === key}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ms-auto text-destructive"
                  onClick={() => {
                    setMethods((current) => current.filter((item) => item.id !== method.id));
                    setDirty(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> {t.settings.externalPaymentDelete}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-muted/50 p-4">
          <p className="mb-3 text-sm font-semibold">{t.settings.externalPaymentAdd}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-external-payment-en">{t.settings.externalPaymentNameEn}</Label>
              <Input id="new-external-payment-en" className="mt-1.5" value={newNameEn} onChange={(event) => setNewNameEn(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="new-external-payment-ar">{t.settings.externalPaymentNameAr}</Label>
              <Input id="new-external-payment-ar" dir="rtl" className="mt-1.5" value={newNameAr} onChange={(event) => setNewNameAr(event.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="me-1 text-xs text-muted-foreground">{t.settings.externalPaymentIcon}</span>
            {EXTERNAL_PAYMENT_ICON_KEYS.map((key) => {
              const Icon = getExternalPaymentIcon(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNewIcon(key)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border ${newIcon === key ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                  title={key}
                  aria-label={`${t.settings.externalPaymentIcon}: ${key}`}
                  aria-pressed={newIcon === key}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
            <Button type="button" className="ms-auto" onClick={addMethod} disabled={!newNameEn.trim() || !newNameAr.trim()}>
              <Plus className="h-4 w-4" /> {t.settings.externalPaymentAddButton}
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={saveMethods} disabled={!dirty || saving}>
            <Save className="h-4 w-4" /> {saving ? t.settings.externalPaymentSaving : t.settings.externalPaymentSave}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
