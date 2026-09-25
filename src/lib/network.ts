import { useSystemStatusStore } from "@/lib/store/useSystemStatusStore";

const NETWORK_ERROR_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /fetch failed/i,
  /timed? ?out/i,
  /econnrefused/i,
  /network request failed/i,
  /the internet connection appears to be offline/i,
];

/** Best-effort classification of "this failed because we're offline" vs. "this
 * failed for a real reason" (bad data, a genuine server-side rejection). Not
 * perfect — browsers deliberately don't expose precise network failure
 * reasons to page JavaScript (see printerServerClient.ts for the same
 * limitation on the printer side) — so this combines the live connectivity
 * signal from the background monitor with common failure-message patterns
 * rather than relying on either alone. */
export function isLikelyNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (useSystemStatusStore.getState().supabase === "offline") return true;
  const message = err instanceof Error ? err.message : String(err);
  return NETWORK_ERROR_PATTERNS.some((p) => p.test(message));
}
