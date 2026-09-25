import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getSafeStorage } from "@/lib/store/storage";

export type PaperWidth = "58" | "80";

interface DeviceSettingsStore {
  // Local Printer Server — a small program (printer-server/) run on a PC on
  // this shop's Wi-Fi network. The POS talks to it over HTTPS; it's the one
  // that opens the raw TCP connection to the printer itself.
  printServerHost: string;
  printServerPort: number;
  // The EPSON printer's own address, as seen by the Printer Server.
  printerIp: string;
  printerPort: number;
  printerName: string;
  paperWidth: PaperWidth;
  autoPrintReceipt: boolean;
  autoOpenDrawer: boolean;
  // Whether the owner has ever completed a Connect step via mDNS discovery
  // (or, pre-discovery, manually entered an address) — distinguishes "never
  // set up" from "set up but currently unreachable," so the Devices page
  // knows whether to lead with "Find Device Server" or with status/retry.
  deviceServerConnected: boolean;
  // When on, a Device Server that's gone Offline is silently rediscovered
  // and reconnected in the background (e.g. after it gets a new DHCP IP —
  // handled for free by mDNS re-resolution — or after being restarted)
  // without the owner having to open Diagnostics and press buttons.
  autoReconnect: boolean;
  // The Device Server's certificate generation timestamp as of the last
  // successful connection from THIS device — compared against what the
  // server reports on every future connection to detect "this is a
  // different certificate than the one I trusted before" (e.g. after
  // .certs/ was deleted/reinstalled), so the Devices page can tell the
  // owner clearly instead of just failing silently.
  lastKnownCertGeneratedAt: string | null;
  setPrintServerHost: (v: string) => void;
  setPrintServerPort: (v: number) => void;
  setPrinterIp: (v: string) => void;
  setPrinterPort: (v: number) => void;
  setPrinterName: (v: string) => void;
  setPaperWidth: (v: PaperWidth) => void;
  setAutoPrintReceipt: (v: boolean) => void;
  setAutoOpenDrawer: (v: boolean) => void;
  setDeviceServerConnected: (v: boolean) => void;
  setAutoReconnect: (v: boolean) => void;
  setLastKnownCertGeneratedAt: (v: string | null) => void;
}

// Printer/device configuration is a physical property of THIS till, not the
// shop — deliberately localStorage-only, never synced through Supabase (two
// tills in the same branch could each point at a different Printer Server).
export const useDeviceSettingsStore = create<DeviceSettingsStore>()(
  persist(
    (set) => ({
      printServerHost: "",
      printServerPort: 9200,
      printerIp: "",
      printerPort: 9100,
      printerName: "",
      paperWidth: "80",
      autoPrintReceipt: true,
      autoOpenDrawer: false,
      deviceServerConnected: false,
      autoReconnect: true,
      lastKnownCertGeneratedAt: null,
      setPrintServerHost: (v) => set({ printServerHost: v }),
      setPrintServerPort: (v) => set({ printServerPort: v }),
      setPrinterIp: (v) => set({ printerIp: v }),
      setPrinterPort: (v) => set({ printerPort: v }),
      setPrinterName: (v) => set({ printerName: v }),
      setPaperWidth: (v) => set({ paperWidth: v }),
      setAutoPrintReceipt: (v) => set({ autoPrintReceipt: v }),
      setAutoOpenDrawer: (v) => set({ autoOpenDrawer: v }),
      setDeviceServerConnected: (v) => set({ deviceServerConnected: v }),
      setAutoReconnect: (v) => set({ autoReconnect: v }),
      setLastKnownCertGeneratedAt: (v) => set({ lastKnownCertGeneratedAt: v }),
    }),
    {
      name: "sanky-pos-device-settings",
      storage: createJSONStorage(getSafeStorage),
      // v4: added lastKnownCertGeneratedAt to detect certificate changes.
      version: 4,
      migrate: (persisted, version) => {
        const state = persisted as Partial<DeviceSettingsStore>;
        if (version < 2) {
          state.autoPrintReceipt = true;
        }
        if (version < 3) {
          state.deviceServerConnected = !!state.printServerHost;
          state.autoReconnect = true;
        }
        if (version < 4) {
          state.lastKnownCertGeneratedAt = null;
        }
        return state;
      },
    }
  )
);
