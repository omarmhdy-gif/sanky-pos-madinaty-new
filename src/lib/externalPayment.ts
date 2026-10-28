import { Bike, Truck, Car, Smartphone, Wallet, Send } from "lucide-react";
import type { ExternalPaymentMethod, OrderPayment, ShopSettings } from "@/lib/types";

// Configurable tender icons. The storage field keeps its historical name so
// existing shops and order records remain compatible.
export const EXTERNAL_PAYMENT_ICONS = { Bike, Truck, Car, Smartphone, Wallet, Send } as const;
export type ExternalPaymentIconKey = keyof typeof EXTERNAL_PAYMENT_ICONS;
export const EXTERNAL_PAYMENT_ICON_KEYS = Object.keys(EXTERNAL_PAYMENT_ICONS) as ExternalPaymentIconKey[];

export const DEFAULT_EXTERNAL_PAYMENT_NAME = { en: "Talabat", ar: "طلبات" };
export const DEFAULT_EXTERNAL_PAYMENT_ICON: ExternalPaymentIconKey = "Bike";
export const DEFAULT_PAYMENT_METHODS: ExternalPaymentMethod[] = [
  { id: "instapay", name: { en: "InstaPay", ar: "إنستا باي" }, icon: "Send" },
];

function normalizePaymentMethodName(name: string) {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06FF]/g, "");
}

export function isInstaPayName(name: string) {
  return ["instapay", "انستاباي", "انستباي"].includes(normalizePaymentMethodName(name));
}

export function isBuiltInPaymentName(name: string) {
  return ["cash", "كاش", "visa", "فيزا", "instapay", "انستاباي", "انستباي"].includes(normalizePaymentMethodName(name));
}

export function builtInPaymentMethod(
  settings: Pick<ShopSettings, "externalPaymentMethods">,
  id: "cash" | "visa" | "instapay"
): ExternalPaymentMethod {
  const configured = settings.externalPaymentMethods?.find((method) => method.id === id);
  const canonical = id === "instapay"
    ? DEFAULT_PAYMENT_METHODS[0]
    : id === "cash"
    ? { id, name: { en: "Cash", ar: "كاش" }, icon: "Wallet" }
    : { id, name: { en: "Visa", ar: "فيزا" }, icon: "CreditCard" };
  return { ...canonical, enabled: configured?.enabled };
}

/** The actual icon component to render — falls back to Bike for an unset or
 * unrecognized key (e.g. settings loaded before migration_2_3.sql ran). */
export function getExternalPaymentIcon(key: string | undefined) {
  return EXTERNAL_PAYMENT_ICONS[key as ExternalPaymentIconKey] ?? Bike;
}

export function externalPaymentName(settings: Pick<ShopSettings, "externalPaymentName">) {
  return settings.externalPaymentName ?? DEFAULT_EXTERNAL_PAYMENT_NAME;
}

export function externalPaymentMethods(
  settings: Pick<ShopSettings, "externalPaymentMethods" | "externalPaymentName" | "externalPaymentIcon">
): ExternalPaymentMethod[] {
  // Talabat remains a legacy marketplace payment. InstaPay is a built-in
  // tender, so hide both its canonical entry and older name-based duplicates
  // from the custom methods list while leaving historical order lookup intact.
  const configured = settings.externalPaymentMethods ?? [];
  return configured.filter((method) =>
    !["talabat", "cash", "visa", "instapay"].includes(method.id) &&
    !isInstaPayName(method.name.en) &&
    !isInstaPayName(method.name.ar)
  );
}

/** Built-in tenders are enabled unless an explicit disabled setting is stored. */
export function isBuiltInPaymentEnabled(
  settings: Pick<ShopSettings, "externalPaymentMethods">,
  id: "cash" | "visa" | "instapay"
) {
  return settings.externalPaymentMethods?.find((method) => method.id === id)?.enabled !== false;
}

export function externalPaymentMethodById(
  settings: Pick<ShopSettings, "externalPaymentMethods" | "externalPaymentName" | "externalPaymentIcon">,
  id?: string
) {
  if (id === "instapay") return builtInPaymentMethod(settings, "instapay");
  // Keep historical orders readable even though legacy InstaPay aliases are
  // deliberately hidden from current checkout and settings lists.
  const stored = settings.externalPaymentMethods?.find((method) => method.id === id);
  return stored ?? externalPaymentMethods(settings).find((method) => method.id === id);
}

export function externalPaymentLabel(
  payment: Pick<OrderPayment, "method" | "externalMethodId" | "externalMethodName">,
  settings: Pick<ShopSettings, "externalPaymentMethods" | "externalPaymentName" | "externalPaymentIcon">,
  locale: "en" | "ar"
) {
  if (payment.externalMethodName) return payment.externalMethodName[locale] || payment.externalMethodName.en;
  const configured = externalPaymentMethodById(settings, payment.externalMethodId);
  if (configured) return configured.name[locale] || configured.name.en;
  const legacyName = settings.externalPaymentName ?? DEFAULT_EXTERNAL_PAYMENT_NAME;
  return legacyName[locale] || legacyName.en;
}
