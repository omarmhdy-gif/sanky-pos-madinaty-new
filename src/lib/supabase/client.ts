import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SHOP_ACCOUNT_STORAGE_KEY = "sanky-pos-shop-account-number";

if (!url || !anonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project's values."
  );
}

/** Keep the verified account number for the subscription-status check. */
export function setShopAccountNumber(accountNumber: string) {
  if (typeof window === "undefined") return;
  const normalized = accountNumber.trim();
  if (!/^\d{4}$/.test(normalized)) throw new Error("Invalid shop account number");
  window.localStorage.setItem(SHOP_ACCOUNT_STORAGE_KEY, normalized);
}

export function getShopAccountNumber(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(SHOP_ACCOUNT_STORAGE_KEY);
  return value && /^\d{4}$/.test(value) ? value : null;
}

export function clearShopAccountNumber() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SHOP_ACCOUNT_STORAGE_KEY);
}

export const supabase = createClient(url, anonKey);
