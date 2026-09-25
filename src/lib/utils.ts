import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Thousands-separated, always Western digits/comma regardless of UI
 * locale — the standard convention for money/quantities even in
 * Arabic-language interfaces, since Eastern Arabic numerals mixed with
 * Latin currency codes/labels reads as inconsistent, and ambiguity in a
 * figure like 1000 vs 1,000 matters more for numbers than for prose. */
export function formatNumber(n: number, minDecimals = 0, maxDecimals = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals });
}

export function formatMoney(amount: number, symbol = "EGP"): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${formatNumber(rounded, 2, 2)} ${symbol}`;
}

export function formatMoneyCompact(amount: number): string {
  return formatNumber(Math.round(amount * 100) / 100, 2, 2);
}

export function genId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDateTime(iso: string, locale: "en" | "ar" = "en"): string {
  const d = new Date(iso);
  return d.toLocaleString(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDate(iso: string, locale: "en" | "ar" = "en"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
  });
}

export function isSameDay(iso: string, ref: Date = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function isImageUrl(value?: string): boolean {
  return !!value && (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:"));
}
