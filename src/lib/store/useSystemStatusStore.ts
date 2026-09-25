import { create } from "zustand";

export type ConnectionState = "online" | "offline" | "checking" | "unknown";

export interface SystemStatusStore {
  deviceServer: ConnectionState;
  printer: ConnectionState;
  internet: ConnectionState;
  supabase: ConnectionState;
  lastPrintAt: string | null;
  lastPrintError: string | null;
  lastCheckedAt: string | null;
  set: (partial: Partial<Omit<SystemStatusStore, "set">>) => void;
}

// Live, in-memory system health snapshot — deliberately NOT persisted, since
// stale "online" state surviving a page reload would be actively misleading.
// Populated by <SystemMonitor> (mounted app-wide in the root layout, so this
// stays current no matter which page the cashier is on) and read by the
// Devices dashboard and the startup validation screen.
export const useSystemStatusStore = create<SystemStatusStore>()((set) => ({
  deviceServer: "unknown",
  printer: "unknown",
  internet: "unknown",
  supabase: "unknown",
  lastPrintAt: null,
  lastPrintError: null,
  lastCheckedAt: null,
  set: (partial) => set(partial),
}));
