import { createClient } from "@supabase/supabase-js";

const CACHE_KEY = "sanky.shop.subscription";
const CACHE_MAX_AGE_MS = 30_000;
const platformUrl = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL;
const platformPublishableKey = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_PUBLISHABLE_KEY;

function tenantProjectRef() {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return projectUrl ? new URL(projectUrl).hostname.split(".")[0] : "";
}

type SubscriptionSnapshot = {
  tenantProjectRef: string;
  status: "active" | "trial" | "suspended" | "expired" | "unlinked";
  expiresAt: string | null;
  checkedAt: number;
};

export type ShopSubscription = {
  state: "checking" | "allowed" | "expired" | "suspended" | "unlinked" | "unavailable";
  canSell: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
};

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function toSubscription(snapshot: SubscriptionSnapshot): ShopSubscription {
  const daysRemaining = snapshot.expiresAt
    ? Math.ceil((Date.parse(`${snapshot.expiresAt}T00:00:00Z`) - Date.parse(`${todayUtc()}T00:00:00Z`)) / 86_400_000)
    : null;
  if (snapshot.status === "suspended") return { state: "suspended", canSell: false, expiresAt: snapshot.expiresAt, daysRemaining };
  if (snapshot.status === "unlinked") return { state: "unlinked", canSell: false, expiresAt: snapshot.expiresAt, daysRemaining };
  if (snapshot.status === "expired") return { state: "expired", canSell: false, expiresAt: snapshot.expiresAt, daysRemaining };
  if (daysRemaining !== null && daysRemaining < 0) return { state: "expired", canSell: false, expiresAt: snapshot.expiresAt, daysRemaining };
  return { state: "allowed", canSell: true, expiresAt: snapshot.expiresAt, daysRemaining };
}

function readSnapshot(tenantProjectRef: string): SubscriptionSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as SubscriptionSnapshot;
    return value.tenantProjectRef === tenantProjectRef ? value : null;
  } catch {
    return null;
  }
}

export async function checkShopSubscription(force = false): Promise<ShopSubscription> {
  if (typeof window === "undefined") return { state: "unavailable", canSell: true, expiresAt: null, daysRemaining: null };

  const projectRef = tenantProjectRef();
  if (!projectRef) return { state: "unavailable", canSell: true, expiresAt: null, daysRemaining: null };

  if (!platformUrl || !platformPublishableKey) {
    const cached = readSnapshot(projectRef);
    return cached ? toSubscription(cached) : { state: "unavailable", canSell: true, expiresAt: null, daysRemaining: null };
  }

  const cached = readSnapshot(projectRef);
  if (!force && cached && Date.now() - cached.checkedAt < CACHE_MAX_AGE_MS) return toSubscription(cached);

  try {
    const licenseClient = createClient(platformUrl, platformPublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-tenant-project-ref": projectRef } },
    });
    const { data, error } = await licenseClient
      .from("platform_shops")
      .select("status,expires_at")
      .eq("tenant_project_ref", projectRef)
      .maybeSingle();
    if (error) throw error;
    const result = data as { status?: string; expires_at?: string | null } | null;
    const status: SubscriptionSnapshot["status"] = result?.status === "active" || result?.status === "trial" || result?.status === "suspended"
      ? result.status
      : "unlinked";
    const snapshot: SubscriptionSnapshot = {
      tenantProjectRef: projectRef,
      status,
      expiresAt: result?.expires_at ?? null,
      checkedAt: Date.now(),
    };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch { /* Keep the online response usable. */ }
    return toSubscription(snapshot);
  } catch {
    if (cached) return toSubscription(cached);
    // When platform licensing is configured, an unknown first-run status must
    // not silently permit checkout. A previously verified snapshot still
    // supports offline sales until its stored expiry date.
    return { state: "unavailable", canSell: false, expiresAt: null, daysRemaining: null };
  }
}
