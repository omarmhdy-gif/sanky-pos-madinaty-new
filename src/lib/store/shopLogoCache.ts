const logoCachePrefix = "sanky-shop-logo-v1:";

function logoCacheKey(branchId: string): string {
  return `${logoCachePrefix}${branchId}`;
}

export function getCachedShopLogo(branchId: string | null): string | undefined {
  if (!branchId || typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(logoCacheKey(branchId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function cacheShopLogo(branchId: string, logo: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    const key = logoCacheKey(branchId);
    if (logo) window.localStorage.setItem(key, logo);
    else window.localStorage.removeItem(key);
  } catch {
    // Logo persistence is only a startup convenience; Supabase remains the source of truth.
  }
}
