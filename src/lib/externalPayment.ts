import { Bike, Truck, Car, Smartphone, Wallet, Send } from "lucide-react";
import type { ExternalPaymentMethod, OrderPayment, ShopSettings } from "@/lib/types";

// Small, curated icon set for the configurable external-marketplace payment
// method (Settings -> External Payment). Bike is the default, matching the
// original hardcoded Talabat icon.
export const EXTERNAL_PAYMENT_ICONS = { Bike, Truck, Car, Smartphone, Wallet, Send } as const;
export type ExternalPaymentIconKey = keyof typeof EXTERNAL_PAYMENT_ICONS;
export const EXTERNAL_PAYMENT_ICON_KEYS = Object.keys(EXTERNAL_PAYMENT_ICONS) as ExternalPaymentIconKey[];

export const DEFAULT_EXTERNAL_PAYMENT_NAME = { en: "Talabat", ar: "طلبات" };
export const DEFAULT_EXTERNAL_PAYMENT_ICON: ExternalPaymentIconKey = "Bike";

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
  // Talabat was the original built-in external method. Keep historical
  // orders readable, but do not expose that legacy entry as a configurable
  // or selectable payment method anymore.
  return (settings.externalPaymentMethods ?? []).filter((method) => method.id !== "talabat");
}

export function externalPaymentMethodById(
  settings: Pick<ShopSettings, "externalPaymentMethods" | "externalPaymentName" | "externalPaymentIcon">,
  id?: string
) {
  return externalPaymentMethods(settings).find((method) => method.id === id);
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
