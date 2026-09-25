"use client";

import { useEffect, useRef } from "react";
import { useDeviceSettingsStore } from "@/lib/store/useDeviceSettingsStore";
import { useSystemStatusStore, type ConnectionState } from "@/lib/store/useSystemStatusStore";
import { useSystemLogStore } from "@/lib/store/useSystemLogStore";
import { usePrintQueueStore } from "@/lib/store/usePrintQueueStore";
import { useOrderQueueStore } from "@/lib/store/useOrderQueueStore";
import { useDataStore } from "@/lib/store/useDataStore";
import {
  checkHealthLatency,
  testPrinterConnection,
  discoverDeviceServer,
  sendRawToPrinter,
  hexToBytes,
  DEFAULT_DEVICE_SERVER_PORT,
  MDNS_HOSTNAME,
} from "@/lib/printing/printerServerClient";
import { pingSupabase } from "@/lib/supabase/api";

const CHECK_INTERVAL_MS = 30_000;

function logTransition(prev: ConnectionState, next: ConnectionState, label: string) {
  if (prev === next || prev === "unknown" || prev === "checking") return;
  const log = useSystemLogStore.getState().log;
  if (next === "online" && prev === "offline") log(`${label} reconnected`, "info");
  else if (next === "offline" && prev === "online") log(`${label} lost`, "warning");
}

/** Silently rediscovers and reconnects the Device Server via its fixed mDNS
 * hostname — the exact same canonical-first logic used in Devices → Find
 * Device Server, kept independent here so background recovery works no
 * matter which page the cashier is currently on (the page-level discovery
 * only ever ran while Devices itself was mounted). */
async function tryReconnectDeviceServer(): Promise<boolean> {
  const { server } = await discoverDeviceServer(DEFAULT_DEVICE_SERVER_PORT, MDNS_HOSTNAME);
  if (!server) return false;
  const store = useDeviceSettingsStore.getState();
  const wasDifferent = store.printServerHost !== server.host || store.printServerPort !== server.port;
  store.setPrintServerHost(server.host);
  store.setPrintServerPort(server.port);
  store.setDeviceServerConnected(true);
  if (wasDifferent) {
    useSystemLogStore.getState().log(`Device Server found automatically (${server.friendlyName})`, "info");
  }
  return true;
}

async function flushPrintQueue() {
  const { queue, remove, markAttempt } = usePrintQueueStore.getState();
  if (queue.length === 0) return;
  const device = useDeviceSettingsStore.getState();
  if (!device.printServerHost) return;
  // Oldest first, and stop at the first failure — if the printer's still
  // down, hammering through the rest of the queue just burns time and
  // produces a wall of identical failures for nothing.
  for (const item of [...queue].reverse()) {
    try {
      await sendRawToPrinter(
        { host: device.printServerHost, port: device.printServerPort },
        { ip: item.printerIp, port: item.printerPort },
        hexToBytes(item.dataHex)
      );
      remove(item.id);
      useSystemLogStore.getState().log(`Queued receipt printed: ${item.label}`, "info");
      useSystemStatusStore.getState().set({ lastPrintAt: new Date().toISOString(), lastPrintError: null });
    } catch (err) {
      markAttempt(item.id, err instanceof Error ? err.message : "Unknown error");
      break;
    }
  }
}

async function flushOrderQueue() {
  const { queue, remove, markAttempt } = useOrderQueueStore.getState();
  if (queue.length === 0) return;
  const addOrder = useDataStore.getState().addOrder;
  for (const item of queue) {
    try {
      const order = await addOrder(item.payload, item.branchId);
      remove(item.tempId);
      useSystemLogStore.getState().log(`Offline order synced — now Order #${order.orderNumber}`, "info");
    } catch (err) {
      markAttempt(item.tempId, err instanceof Error ? err.message : "Unknown error");
      break; // still offline (or a real error) — stop and let the next tick retry
    }
  }
}

/** Mounted once, app-wide, regardless of which page is active — this is
 * what makes recovery/monitoring genuinely automatic instead of only
 * working while the Devices page happens to be open. Renders nothing. */
export function SystemMonitor() {
  const runningRef = useRef(false);

  useEffect(() => {
    const runCheck = async () => {
      if (runningRef.current) return; // don't overlap if one check runs long
      runningRef.current = true;
      const statusStore = useSystemStatusStore.getState();
      const prev = useSystemStatusStore.getState();
      const device = useDeviceSettingsStore.getState();

      // Internet: navigator.onLine is a fast, real (if imperfect) signal
      // straight from the OS network stack.
      const internet: ConnectionState = typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online";
      logTransition(prev.internet, internet, "Internet");

      // Supabase: a real reachability check, independent of the generic
      // internet signal above (a paused project or DNS issue can take down
      // Supabase specifically while the network itself is fine).
      const supabaseOk = await pingSupabase(5000);
      const supabaseState: ConnectionState = supabaseOk ? "online" : "offline";
      logTransition(prev.supabase, supabaseState, "Supabase");

      // Device Server: check the currently-connected address; if it's
      // unreachable (or never configured) and auto-reconnect is on,
      // silently try to rediscover it before giving up for this tick.
      let deviceServerState: ConnectionState = "unknown";
      if (device.printServerHost) {
        const health = await checkHealthLatency({ host: device.printServerHost, port: device.printServerPort });
        deviceServerState = health.ok ? "online" : "offline";
      }
      if (deviceServerState !== "online" && device.autoReconnect) {
        const reconnected = await tryReconnectDeviceServer();
        if (reconnected) deviceServerState = "online";
      }
      logTransition(prev.deviceServer, deviceServerState, "Device Server");

      // Printer: only meaningful to check once the Device Server itself is
      // reachable (it's the one that actually opens the TCP connection).
      let printerState: ConnectionState = "unknown";
      if (deviceServerState === "online" && device.printerIp) {
        const fresh = useDeviceSettingsStore.getState();
        const online = await testPrinterConnection(
          { host: fresh.printServerHost, port: fresh.printServerPort },
          { ip: fresh.printerIp, port: fresh.printerPort }
        );
        printerState = online ? "online" : "offline";
      }
      logTransition(prev.printer, printerState, "Printer");

      statusStore.set({
        internet,
        supabase: supabaseState,
        deviceServer: deviceServerState,
        printer: printerState,
        lastCheckedAt: new Date().toISOString(),
      });

      // Retry queues silently — never interrupts the cashier, no dialogs,
      // no blocking. Print queue needs the printer reachable; order queue
      // needs Supabase reachable.
      if (deviceServerState === "online" && printerState === "online") {
        await flushPrintQueue().catch(() => {});
      }
      if (supabaseState === "online") {
        await flushOrderQueue().catch(() => {});
      }

      runningRef.current = false;
    };

    runCheck();
    const id = setInterval(runCheck, CHECK_INTERVAL_MS);

    // Re-check immediately when the tab regains focus/visibility or the OS
    // reports the network coming back — no need to wait out the rest of a
    // 30s window for what's often the most common recovery signal.
    const onFocus = () => {
      if (document.visibilityState === "visible") runCheck();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", runCheck);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", runCheck);
    };
  }, []);

  return null;
}
