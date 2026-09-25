"use client";

import { useEffect, useState } from "react";
import {
  Printer,
  ScanBarcode,
  Wifi,
  WifiOff,
  Loader2,
  Activity,
  Server,
  CheckCircle2,
  XCircle,
  ScrollText,
  ClipboardCopy,
  Radar,
  Link2,
  ChevronDown,
  ShieldCheck,
  Globe,
  Database,
  RefreshCw,
  Clock,
  AlertCircle,
  LayoutDashboard,
  Trash2,
  RotateCw,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useDeviceSettingsStore } from "@/lib/store/useDeviceSettingsStore";
import { useSystemStatusStore, type ConnectionState, type SystemStatusStore } from "@/lib/store/useSystemStatusStore";
import { useSystemLogStore, type SystemLogEntry } from "@/lib/store/useSystemLogStore";
import { usePrintQueueStore, type QueuedReceipt } from "@/lib/store/usePrintQueueStore";
import { useOrderQueueStore, type QueuedOrder } from "@/lib/store/useOrderQueueStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { toast } from "@/components/ui/toast";
import { printOrderReceipt } from "@/lib/printing/printReceipt";
import {
  testPrinterConnection,
  isPrintServerReachable,
  checkHealthLatency,
  fetchDiagnosticsStatus,
  fetchDiagnosticsLogs,
  fetchPrintJobHistory,
  discoverDeviceServer,
  discoverPrinters,
  sendRawToPrinter,
  hexToBytes,
  DEFAULT_DEVICE_SERVER_PORT,
  MDNS_HOSTNAME,
  type HealthCheckResult,
  type DiagnosticsStatus,
  type DiscoveredPrinter,
  type LogEntry,
  type DiscoveredServer,
  type PrintJobRecord,
} from "@/lib/printing/printerServerClient";
import { cn, formatMoney } from "@/lib/utils";
import type { Order } from "@/lib/types";

interface DiagStep {
  label: string;
  ok: boolean;
  detail: string;
}

// Two-tier status: a Printer Server that's up but can't reach the printer
// is a very different problem (check the printer's IP/power/cable) than a
// Printer Server that's not even running (check it's started on the PC) —
// showing them as the same generic "Offline" made this hard to debug.
type PrinterStatus = "checking" | "online" | "printer-offline" | "server-offline";

const SAMPLE_ORDER: Order = {
  id: "sample",
  branchId: "",
  orderNumber: 0,
  lines: [
    { lineId: "1", productId: "sample", name: { en: "Sample Item", ar: "صنف تجريبي" }, unitPrice: 50, qty: 1, modifiers: [] },
  ],
  subtotal: 50,
  discountAmount: 0,
  taxAmount: 0,
  taxRate: 0,
  total: 50,
  payment: { method: "cash", amount: 50, tenderedAmount: 50, changeDue: 0 },
  status: "completed",
  type: "takeaway",
  cashierId: "sample",
  cashierName: "Test",
  createdAt: new Date().toISOString(),
};

export default function DevicesPage() {
  const { t, locale } = useI18n();
  const settings = useDataStore((s) => s.settings);
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const {
    printServerHost,
    printServerPort,
    printerIp,
    printerPort,
    printerName,
    paperWidth,
    autoPrintReceipt,
    autoOpenDrawer,
    deviceServerConnected,
    autoReconnect,
    lastKnownCertGeneratedAt,
    setPrintServerHost,
    setPrintServerPort,
    setPrinterIp,
    setPrinterPort,
    setPrinterName,
    setPaperWidth,
    setAutoPrintReceipt,
    setAutoOpenDrawer,
    setDeviceServerConnected,
    setAutoReconnect,
    setLastKnownCertGeneratedAt,
  } = useDeviceSettingsStore();

  const systemStatus = useSystemStatusStore();
  const logEntries = useSystemLogStore((s) => s.entries);
  const clearSystemLog = useSystemLogStore((s) => s.clear);
  const printQueue = usePrintQueueStore((s) => s.queue);
  const removeFromPrintQueue = usePrintQueueStore((s) => s.remove);
  const markPrintQueueAttempt = usePrintQueueStore((s) => s.markAttempt);
  const orderQueue = useOrderQueueStore((s) => s.queue);
  const [retryingQueue, setRetryingQueue] = useState(false);

  const [testScan, setTestScan] = useState("");
  useBarcodeScanner((code) => {
    setTestScan(code);
    toast(`${t.devices.scanDetected}: ${code}`, "success");
  });

  const [status, setStatus] = useState<PrinterStatus>("checking");
  const [checking, setChecking] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [scanningPrinters, setScanningPrinters] = useState(false);
  const [foundPrinters, setFoundPrinters] = useState<DiscoveredPrinter[] | null>(null);

  const [tab, setTab] = useState<"dashboard" | "settings" | "diagnostics">("dashboard");
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [diagStatus, setDiagStatus] = useState<DiagnosticsStatus | null>(null);
  const [diagLogs, setDiagLogs] = useState<LogEntry[]>([]);
  const [printJobs, setPrintJobs] = useState<PrintJobRecord[]>([]);
  const [diagSteps, setDiagSteps] = useState<DiagStep[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);
  const [copying, setCopying] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [lastPingAt, setLastPingAt] = useState<string | null>(null);

  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredServer | null>(null);
  const [discoveryAttempted, setDiscoveryAttempted] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [discoveryLog, setDiscoveryLog] = useState<string[]>([]);
  const [lastDiscoveryError, setLastDiscoveryError] = useState<string | null>(null);

  const deviceServerUrl = printServerHost ? `https://${printServerHost}:${printServerPort}` : "—";

  const branchName = bilingual(branches.find((b) => b.id === currentBranchId)?.name ?? { en: "", ar: "" }, locale);

  const checkConnection = async (showToast = false) => {
    if (!printServerHost) {
      setStatus("server-offline");
      if (showToast) toast(t.devices.notConfigured, "error");
      return;
    }
    setChecking(true);
    try {
      const serverUp = await isPrintServerReachable({ host: printServerHost, port: printServerPort });
      if (!serverUp) {
        setStatus("server-offline");
        if (showToast) toast(t.devices.serverOffline, "error");
        return;
      }
      if (!printerIp) {
        setStatus("printer-offline");
        if (showToast) toast(t.devices.notConfigured, "error");
        return;
      }
      const online = await testPrinterConnection(
        { host: printServerHost, port: printServerPort },
        { ip: printerIp, port: printerPort }
      );
      setStatus(online ? "online" : "printer-offline");
      if (showToast) toast(online ? t.devices.online : t.devices.printerOffline, online ? "success" : "error");
    } catch (err) {
      setStatus("server-offline");
      if (showToast) toast(err instanceof Error ? err.message : t.devices.serverOffline, "error");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkConnection(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printServerHost, printServerPort, printerIp, printerPort]);

  // Saves the discovered server as this till's Device Server. This is the
  // only thing that ever writes printServerHost/Port now — always whatever
  // was actually just discovered/verified, never a value typed in blind —
  // which is what makes "if the IP changes, rediscover automatically" true
  // for free: every request re-resolves the hostname via mDNS, so there's
  // no cached IP to go stale in the first place.
  const connectToServer = (server: DiscoveredServer, showToast = true) => {
    // Requirement 6: notify the owner clearly if the certificate isn't the
    // one this device saw last time (e.g. the printer-server PC had its
    // .certs/ folder deleted/reinstalled) — this device will need to trust
    // it again, and a silent connection failure with no explanation would
    // otherwise be a confusing way to find that out.
    if (server.certGeneratedAt && lastKnownCertGeneratedAt && server.certGeneratedAt !== lastKnownCertGeneratedAt) {
      toast(t.devices.certChangedWarning, "error");
      useSystemLogStore.getState().log(t.devices.certChangedWarning, "warning");
    }
    if (server.certGeneratedAt) setLastKnownCertGeneratedAt(server.certGeneratedAt);
    setPrintServerHost(server.host);
    setPrintServerPort(server.port);
    setDeviceServerConnected(true);
    if (showToast) toast(`${t.devices.connected}: ${server.friendlyName}`, "success");
    checkConnection(false);
  };

  const logDiscovery = (line: string) => {
    console.log(`[Sanky Discovery] ${line}`);
    setDiscoveryLog((prev) => [...prev.slice(-11), line]);
  };

  // "Find Device Server": there's no API for Safari to browse/enumerate
  // mDNS services or read back an advertised SRV/TXT port (no such web API
  // exists — mDNS service records are only queryable by native Bonjour-aware
  // clients, not by fetch()), so this checks one specific address directly:
  // the canonical mDNS hostname on the Device Server's fixed, known port.
  // That address is ALWAYS what's tried — never a value read back from
  // previously-stored state — so a stale/wrong stored port from before this
  // discovery system existed can never silently keep reusing itself. There
  // is deliberately no "fall back to the last stored address" step anymore:
  // that path was what let a long-stale port (once manually typed in, long
  // since wrong) keep winning forever. The Advanced section is the only way
  // to target a non-default address now, and it's opt-in, never automatic.
  const findDeviceServer = async (silent = false) => {
    setDiscovering(true);
    setDiscoveryAttempted(true);
    setDiscoveryLog([]);
    setLastDiscoveryError(null);

    logDiscovery(`Trying canonical address: https://${MDNS_HOSTNAME}:${DEFAULT_DEVICE_SERVER_PORT}/health`);
    const { server: found, error } = await discoverDeviceServer(DEFAULT_DEVICE_SERVER_PORT, MDNS_HOSTNAME);

    if (found) {
      logDiscovery(
        `Found — hostname=${found.host} ip=${found.ipAddress ?? "unknown"} port=${found.port} name="${found.friendlyName}" version=${found.version}`
      );
      logDiscovery(`Final fetch URL for printing: https://${found.host}:${found.port}/...`);
    } else {
      logDiscovery(`No response from canonical address. Browser-visible error: ${error ?? "unknown"}`);
      setLastDiscoveryError(error);
    }

    setDiscovered(found);
    setDiscovering(false);

    if (found) {
      const alreadyCurrent = deviceServerConnected && printServerHost === found.host && printServerPort === found.port;
      if (!alreadyCurrent) {
        connectToServer(found, false);
        toast(`${silent ? t.devices.autoConnected : t.devices.connected}: ${found.friendlyName}`, "success");
      } else if (!silent) {
        toast(t.devices.deviceServerFound, "success");
      }
    } else if (!silent) {
      toast(t.devices.deviceServerNotFound, "error");
    }
    return found;
  };

  // "Trust Device Server": opens the EXACT origin fetch() will use, in a new
  // tab, so whatever certificate exception the user grants there is
  // guaranteed to match. A cert trusted for the raw IP does NOT carry over
  // to the sanky-device.local origin (or vice versa) — browsers scope
  // self-signed trust decisions per exact origin (scheme+host+port), not
  // per underlying server/cert — which is exactly why "it works when I open
  // the IP manually" and "fetch() to the hostname still fails" can both be
  // true at once. When the owner switches back to this tab, discovery
  // retries automatically (see the visibility listener below).
  const trustDeviceServer = () => {
    window.open(`https://${MDNS_HOSTNAME}:${DEFAULT_DEVICE_SERVER_PORT}/health`, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible" && !deviceServerConnected) {
        findDeviceServer(true);
      }
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceServerConnected]);

  // Always look for the Device Server on load — not just for first-time
  // setup. This is what makes a stale stored port self-correct on its own:
  // if the canonical address answers, it's adopted immediately regardless
  // of whatever was stored before (see findDeviceServer above).
  useEffect(() => {
    findDeviceServer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Reconnect Automatically": while a previously-connected Device Server
  // shows Offline, quietly retry discovery in the background so a restarted
  // server (or one that was briefly unreachable) gets picked back up without
  // the owner needing to come back to this page and press anything.
  useEffect(() => {
    if (!autoReconnect || !deviceServerConnected || status !== "server-offline") return;
    const id = setInterval(() => {
      findDeviceServer(true);
    }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReconnect, deviceServerConnected, status]);

  const handleTestPrint = async () => {
    setPrinting(true);
    try {
      await printOrderReceipt({
        order: SAMPLE_ORDER,
        settings,
        branchName,
        locale,
        openDrawer: autoOpenDrawer,
        skipQueue: true,
      });
      toast(t.devices.sentToPrinter, "success");
      setStatus("online");
    } catch (err) {
      toast(err instanceof Error ? err.message : t.devices.printFailed, "error");
      checkConnection(false);
    } finally {
      setPrinting(false);
    }
  };

  // Runs the two network hops one at a time so a failure can be pinned to
  // exactly one of them, instead of the old single "Offline" verdict: (1)
  // can the POS reach the Device Server at all, (2) can the Device Server
  // reach the printer. Each step keeps a human-readable reason, not just
  // pass/fail, since that's what actually gets someone unstuck.
  const runDiagnostics = async () => {
    setDiagRunning(true);
    const steps: DiagStep[] = [];

    if (!printServerHost) {
      steps.push({ label: t.devices.stepPosToServer, ok: false, detail: t.devices.notConfigured });
      steps.push({ label: t.devices.stepServerToPrinter, ok: false, detail: t.devices.diagPrinterSkippedDetail });
      setDiagSteps(steps);
      setHealthResult(null);
      setDiagStatus(null);
      setDiagRunning(false);
      return;
    }

    const server = { host: printServerHost, port: printServerPort };
    const health = await checkHealthLatency(server);
    setHealthResult(health);
    steps.push({
      label: t.devices.stepPosToServer,
      ok: health.ok,
      detail: health.ok
        ? t.devices.diagServerOkDetail.replace("{ms}", String(health.latencyMs))
        : t.devices.diagServerFailDetail.replace("{addr}", `${printServerHost}:${printServerPort}`),
    });

    if (health.ok) {
      try {
        setDiagStatus(await fetchDiagnosticsStatus(server));
      } catch {
        setDiagStatus(null);
      }
      try {
        setDiagLogs(await fetchDiagnosticsLogs(server));
      } catch {
        // keep whatever logs were last fetched
      }
    } else {
      setDiagStatus(null);
    }

    if (!health.ok) {
      steps.push({ label: t.devices.stepServerToPrinter, ok: false, detail: t.devices.diagPrinterSkippedDetail });
    } else if (!printerIp) {
      steps.push({ label: t.devices.stepServerToPrinter, ok: false, detail: t.devices.diagPrinterNotSetDetail });
    } else {
      const target = `${printerIp}:${printerPort}`;
      try {
        const online = await testPrinterConnection(server, { ip: printerIp, port: printerPort });
        steps.push({
          label: t.devices.stepServerToPrinter,
          ok: online,
          detail: online ? t.devices.diagPrinterOkDetail : t.devices.diagPrinterFailDetail.replace("{target}", target),
        });
        try {
          setDiagStatus(await fetchDiagnosticsStatus(server));
        } catch {
          // ignore — steps above already reflect the outcome
        }
      } catch (err) {
        steps.push({
          label: t.devices.stepServerToPrinter,
          ok: false,
          detail: err instanceof Error ? err.message : t.devices.diagPrinterFailDetail.replace("{target}", target),
        });
      }
    }

    setDiagSteps(steps);
    setDiagRunning(false);
  };

  // A single, fast /health round-trip that surfaces the *exact* error
  // fetch() threw (e.g. "Failed to fetch", "Load failed" on Safari, a TLS
  // trust error) — deliberately not paraphrased, since the literal wording
  // is what actually distinguishes "wrong address," "cert not trusted yet,"
  // and "blocked by firewall" from each other.
  const pingServer = async () => {
    if (!printServerHost) {
      toast(t.devices.notConfigured, "error");
      return;
    }
    setPinging(true);
    const result = await checkHealthLatency({ host: printServerHost, port: printServerPort });
    setHealthResult(result);
    setLastPingAt(new Date().toLocaleTimeString());
    toast(result.ok ? `${t.devices.running} (${result.latencyMs} ms)` : result.error || t.devices.notRunning, result.ok ? "success" : "error");
    setPinging(false);
  };

  useEffect(() => {
    if (tab !== "diagnostics") return;
    runDiagnostics();
    let cancelled = false;
    const poll = async () => {
      if (!printServerHost) return;
      try {
        const logs = await fetchDiagnosticsLogs({ host: printServerHost, port: printServerPort });
        if (!cancelled) setDiagLogs(logs);
      } catch {
        // transient — keep showing the last known logs rather than clearing them
      }
      try {
        const jobs = await fetchPrintJobHistory({ host: printServerHost, port: printServerPort });
        if (!cancelled) setPrintJobs(jobs);
      } catch {
        // transient — keep showing the last known job history rather than clearing it
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const copyDiagnostics = async () => {
    setCopying(true);
    const lines: string[] = [];
    lines.push(`Sanky POS Printer Diagnostics — ${new Date().toISOString()}`);
    lines.push("");
    lines.push("Configuration:");
    lines.push(`  Printer Server Address: ${printServerHost || "(not set)"}:${printServerPort}`);
    lines.push(`  Printer IP: ${printerIp || "(not set)"}:${printerPort}`);
    lines.push("");
    lines.push("Diagnostic steps:");
    diagSteps.forEach((s) => lines.push(`  [${s.ok ? "PASS" : "FAIL"}] ${s.label} — ${s.detail}`));
    lines.push("");
    lines.push(`Device Server response time: ${healthResult ? `${healthResult.latencyMs} ms` : "n/a"}`);
    if (diagStatus) {
      lines.push("");
      lines.push("Device Server status snapshot:");
      lines.push(JSON.stringify(diagStatus, null, 2));
    }
    lines.push("");
    lines.push(`Last ${diagLogs.length} log entries:`);
    diagLogs.forEach((l) => lines.push(`[${l.time}] [${l.category}] ${l.message}`));
    const report = lines.join("\n");
    try {
      await navigator.clipboard.writeText(report);
      toast(t.devices.diagCopied, "success");
    } catch {
      toast(t.devices.diagCopyFailed, "error");
    } finally {
      setCopying(false);
    }
  };

  // Manual "Retry Now" for queued receipts — the background monitor already
  // retries these automatically every 30s, but the owner shouldn't have to
  // wait out the rest of that window after fixing whatever was wrong.
  const retryPrintQueue = async () => {
    if (!printServerHost || printQueue.length === 0) return;
    setRetryingQueue(true);
    for (const item of [...printQueue].reverse()) {
      try {
        await sendRawToPrinter({ host: printServerHost, port: printServerPort }, { ip: item.printerIp, port: item.printerPort }, hexToBytes(item.dataHex));
        removeFromPrintQueue(item.id);
        toast(`${t.devices.reprinted}: ${item.label}`, "success");
      } catch (err) {
        markPrintQueueAttempt(item.id, err instanceof Error ? err.message : "Unknown error");
        toast(err instanceof Error ? err.message : t.devices.printFailed, "error");
        break;
      }
    }
    setRetryingQueue(false);
  };

  // Printer Auto Detection: the Device Server scans its own local subnet
  // (something only a real OS process can do, not a browser) for anything
  // answering on the ESC/POS port. If exactly one is found, it's selected
  // automatically — with more than one, the owner picks from the list.
  const runPrinterScan = async () => {
    if (!printServerHost) {
      toast(t.devices.notConfigured, "error");
      return;
    }
    setScanningPrinters(true);
    setFoundPrinters(null);
    try {
      const printers = await discoverPrinters({ host: printServerHost, port: printServerPort }, printerPort || 9100);
      setFoundPrinters(printers);
      if (printers.length === 1) {
        setPrinterIp(printers[0].ip);
        setPrinterPort(printers[0].port);
        toast(`${t.devices.printerFound}: ${printers[0].ip}`, "success");
      } else if (printers.length === 0) {
        toast(t.devices.noPrintersFound, "error");
      } else {
        toast(`${printers.length} ${t.devices.printersFoundMultiple}`, "success");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : t.devices.printFailed, "error");
    } finally {
      setScanningPrinters(false);
    }
  };

  return (
    <AppShell title={t.nav.devices}>
      <div className="space-y-5 p-4 sm:p-6 pb-10">
        <p className="text-sm text-muted-foreground">{t.devices.subtitle}</p>

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setTab("dashboard")}
            className={cn(
              "flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === "dashboard" ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            {t.devices.dashboardTab}
          </button>
          <button
            onClick={() => setTab("settings")}
            className={cn(
              "flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === "settings" ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            {t.devices.settingsTab}
          </button>
          <button
            onClick={() => setTab("diagnostics")}
            className={cn(
              "flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === "diagnostics" ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            {t.devices.diagnosticsTab}
          </button>
        </div>

        {tab === "dashboard" && (
          <DashboardTab
            systemStatus={systemStatus}
            printQueue={printQueue}
            orderQueue={orderQueue}
            logEntries={logEntries}
            clearSystemLog={clearSystemLog}
            retryingQueue={retryingQueue}
            retryPrintQueue={retryPrintQueue}
            removeFromPrintQueue={removeFromPrintQueue}
            t={t}
            currencySymbol={settings.currencySymbol}
          />
        )}

        {tab === "settings" && (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Radar className="h-4 w-4" />
                {t.devices.deviceServerCard}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                  deviceServerConnected && status === "online"
                    ? "border-success/30 bg-success/10 text-success"
                    : discovering || status === "checking"
                    ? "border-border text-muted-foreground"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                )}
              >
                {discovering || status === "checking" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : deviceServerConnected && status === "online" ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {discovering
                  ? t.devices.discovering
                  : deviceServerConnected
                  ? status === "online" || status === "printer-offline"
                    ? t.devices.connected
                    : t.devices.serverOffline
                  : t.devices.notConnected}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.devices.deviceServerNote}</p>

            {discovered ? (
              <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.serverName}</span>
                  <span className="font-medium">{discovered.friendlyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.ipAddressLabel}</span>
                  <span className="font-medium">{discovered.ipAddress ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.diagServerPort}</span>
                  <span className="font-medium">{discovered.port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.statusLabel}</span>
                  <span className="font-medium text-success">{t.devices.online}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.versionLabel}</span>
                  <span className="font-medium">{discovered.version}</span>
                </div>
                {!(deviceServerConnected && printServerHost === discovered.host && printServerPort === discovered.port) && (
                  <Button className="w-full" onClick={() => connectToServer(discovered)}>
                    <Link2 className="h-4 w-4" />
                    {t.devices.connect}
                  </Button>
                )}
              </div>
            ) : discoveryAttempted && !discovering ? (
              <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                <p className="text-xs text-muted-foreground">{t.devices.deviceServerNotFoundDetail}</p>
                {lastDiscoveryError && (
                  <p className="rounded bg-muted/60 p-2 font-mono text-[11px] text-destructive">
                    {t.devices.browserReportedLabel}: {lastDiscoveryError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{t.devices.certTrustHint}</p>
                <Button variant="outline" className="w-full" onClick={trustDeviceServer}>
                  <ShieldCheck className="h-4 w-4" />
                  {t.devices.trustDeviceServer}
                </Button>
              </div>
            ) : null}

            <Button variant="outline" className="w-full" disabled={discovering} onClick={() => findDeviceServer(false)}>
              {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              {t.devices.findDeviceServer}
            </Button>

            {discoveryLog.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t.devices.discoveryLogLabel}</p>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-dashed border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
                  {discoveryLog.map((line, i) => (
                    <div key={i} className="break-all">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>{t.devices.reconnectAutomatically}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.devices.reconnectAutomaticallyNote}</p>
              </div>
              <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} />
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground"
            >
              {t.devices.advancedSettings}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
            </button>
            {showAdvanced && (
              <div className="space-y-4 rounded-lg border border-dashed border-border p-3">
                <p className="text-[11px] text-muted-foreground">{t.devices.advancedSettingsNote}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>{t.devices.printServerAddress}</Label>
                    <Input
                      className="mt-1.5"
                      value={printServerHost}
                      onChange={(e) => {
                        setPrintServerHost(e.target.value);
                        setDeviceServerConnected(true);
                      }}
                      placeholder="192.168.1.20 or sanky-device.local"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">{t.devices.printServerAddressHint}</p>
                  </div>
                  <div>
                    <Label>{t.devices.printServerPort}</Label>
                    <Input
                      className="mt-1.5"
                      type="number"
                      value={printServerPort}
                      onChange={(e) => setPrintServerPort(parseInt(e.target.value, 10) || 9200)}
                      placeholder="9200"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">{t.devices.printServerPortHint}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Printer className="h-4 w-4" />
                {t.devices.receiptPrinter}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                  status === "online"
                    ? "border-success/30 bg-success/10 text-success"
                    : status === "checking"
                    ? "border-border text-muted-foreground"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                )}
              >
                {status === "checking" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : status === "online" ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {status === "checking"
                  ? t.devices.checking
                  : status === "online"
                  ? t.devices.online
                  : status === "server-offline"
                  ? t.devices.serverOffline
                  : t.devices.printerOffline}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">{t.devices.printerNote}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t.devices.printerName}</Label>
                <Input
                  className="mt-1.5"
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  placeholder="Front Counter Epson"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t.devices.printerIp}</Label>
                  <Input className="mt-1.5" value={printerIp} onChange={(e) => setPrinterIp(e.target.value)} placeholder="192.168.1.50" />
                  <p className="mt-1 text-[11px] text-muted-foreground">{t.devices.printerIpHint}</p>
                </div>
                <div>
                  <Label>{t.devices.printerPort}</Label>
                  <Input
                    className="mt-1.5"
                    type="number"
                    value={printerPort}
                    onChange={(e) => setPrinterPort(parseInt(e.target.value, 10) || 9100)}
                    placeholder="9100"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{t.devices.printerPortHint}</p>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full" disabled={scanningPrinters} onClick={runPrinterScan}>
              {scanningPrinters ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              {scanningPrinters ? t.devices.scanningPrinters : t.devices.scanForPrinters}
            </Button>
            {foundPrinters && foundPrinters.length > 1 && (
              <div className="space-y-1.5 rounded-lg border border-dashed border-border p-2">
                <p className="px-1 text-[11px] text-muted-foreground">{t.devices.selectPrinterHint}</p>
                {foundPrinters.map((p) => (
                  <button
                    key={p.ip}
                    onClick={() => {
                      setPrinterIp(p.ip);
                      setPrinterPort(p.port);
                      toast(`${t.devices.printerFound}: ${p.ip}`, "success");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors",
                      printerIp === p.ip ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    )}
                  >
                    <span className="font-mono">
                      {p.ip}:{p.port}
                    </span>
                    <span className="text-xs opacity-70">{p.latencyMs} ms</span>
                  </button>
                ))}
              </div>
            )}

            <div>
              <Label>{t.devices.paperWidth}</Label>
              <div className="mt-1.5 flex gap-1 rounded-lg bg-muted p-1">
                {(["58", "80"] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setPaperWidth(w)}
                    className={cn(
                      "flex-1 rounded-md px-4 py-1.5 text-sm font-medium",
                      paperWidth === w ? "bg-background shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {w} mm
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label>{t.devices.autoPrint}</Label>
              <Switch checked={autoPrintReceipt} onCheckedChange={setAutoPrintReceipt} />
            </div>
            <div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label>{t.devices.autoOpenDrawer}</Label>
                <Switch checked={autoOpenDrawer} onCheckedChange={setAutoOpenDrawer} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t.devices.drawerNote}</p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t.devices.previewLabel}</p>
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4">
                <ReceiptView order={SAMPLE_ORDER} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={checking} onClick={() => checkConnection(true)}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                {t.devices.testConnection}
              </Button>
              <Button variant="outline" disabled={printing} onClick={handleTestPrint}>
                {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                {t.devices.testPrint}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanBarcode className="h-4 w-4" />
              {t.devices.barcodeScanner}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.devices.scannerNote}</p>
            <div>
              <Label>{t.devices.testScan}</Label>
              <Input className="mt-1.5" value={testScan} readOnly placeholder={t.devices.testScanPlaceholder} />
            </div>
          </CardContent>
        </Card>
        </>
        )}

        {tab === "diagnostics" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    {t.devices.deviceServerStatus}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                      healthResult?.ok
                        ? "border-success/30 bg-success/10 text-success"
                        : diagRunning
                        ? "border-border text-muted-foreground"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    )}
                  >
                    {diagRunning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : healthResult?.ok ? (
                      <Wifi className="h-3 w-3" />
                    ) : (
                      <WifiOff className="h-3 w-3" />
                    )}
                    {diagRunning ? t.devices.checking : healthResult?.ok ? t.devices.running : t.devices.notRunning}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">{t.devices.deviceServerUrl}</span>
                  <span className="break-all text-end font-medium">{deviceServerUrl}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.diagServerIp}</span>
                  <span className="font-medium">{printServerHost || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.diagServerPort}</span>
                  <span className="font-medium">{printServerPort}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.lastHeartbeat}</span>
                  <span className="font-medium">{diagStatus?.server.now ?? t.devices.never}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.lastPing}</span>
                  <span className="font-medium">{lastPingAt ?? t.devices.never}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.responseTime}</span>
                  <span className="font-medium">{healthResult ? `${healthResult.latencyMs} ms` : "—"}</span>
                </div>
                <div>
                  <p className="text-muted-foreground">{t.devices.lastErrorMessage}</p>
                  <p className={cn("mt-0.5 break-all font-mono text-xs", healthResult?.error ? "text-destructive" : "text-muted-foreground")}>
                    {healthResult?.error ?? t.devices.noErrorsYet}
                  </p>
                </div>
                <Button variant="outline" className="w-full" disabled={pinging} onClick={pingServer}>
                  {pinging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  {t.devices.pingServer}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Printer className="h-4 w-4" />
                    {t.devices.diagPrinterStatus}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                      diagStatus?.lastPrinterCheck?.online
                        ? "border-success/30 bg-success/10 text-success"
                        : diagRunning
                        ? "border-border text-muted-foreground"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    )}
                  >
                    {diagRunning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : diagStatus?.lastPrinterCheck?.online ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {diagRunning
                      ? t.devices.checking
                      : diagStatus?.lastPrinterCheck?.online
                      ? t.devices.tcpSuccess
                      : t.devices.tcpFailed}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.diagPrinterIp}</span>
                  <span className="font-medium">{printerIp || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.diagPrinterPort}</span>
                  <span className="font-medium">{printerPort}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.tcpConnection}</span>
                  <span className="font-medium">
                    {diagStatus?.lastPrinterCheck ? (diagStatus.lastPrinterCheck.online ? t.devices.tcpSuccess : t.devices.tcpFailed) : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.lastConnectionTime}</span>
                  <span className="font-medium">{diagStatus?.lastPrinterCheck?.at ?? t.devices.never}</span>
                </div>
                <div className="my-1 border-t border-dashed border-border" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.devices.lastPrintJobLabel}</span>
                  <span className={cn("font-medium", diagStatus?.lastPrintJob && !diagStatus.lastPrintJob.success && "text-destructive")}>
                    {diagStatus?.lastPrintJob ? (diagStatus.lastPrintJob.success ? t.devices.tcpSuccess : t.devices.tcpFailed) : "—"}
                  </span>
                </div>
                {diagStatus?.lastPrintJob && !diagStatus.lastPrintJob.success && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t.devices.failedStageLabel}</span>
                      <span className="font-medium">
                        {diagStatus.lastPrintJob.stage === "connecting"
                          ? t.devices.stageConnecting
                          : diagStatus.lastPrintJob.stage === "sending"
                          ? t.devices.stageSending
                          : diagStatus.lastPrintJob.stage ?? "—"}
                        {diagStatus.lastPrintJob.timedOut ? ` (${t.devices.timedOutLabel})` : ""}
                      </span>
                    </div>
                    {diagStatus.lastPrintJob.friendlyError && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t.devices.exactErrorLabel}</span>
                        <span className="font-medium text-destructive">
                          {diagStatus.lastPrintJob.friendlyError}
                          {diagStatus.lastPrintJob.errorCode ? ` (${diagStatus.lastPrintJob.errorCode})` : ""}
                        </span>
                      </div>
                    )}
                    {/* Raw error text from the server, verbatim — never
                        paraphrased or hidden, shown alongside the friendly
                        label above, not instead of it. */}
                    <p className="rounded bg-muted/60 p-2 font-mono text-[11px] text-destructive">{diagStatus.lastPrintJob.error}</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4" />
                  {t.devices.printJobLog}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {printJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.devices.never}</p>
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto scrollbar-thin">
                    {printJobs.map((job) => (
                      <div
                        key={job.id}
                        className={cn(
                          "rounded-lg border p-2.5 text-xs",
                          job.success ? "border-border" : "border-destructive/40 bg-destructive/5"
                        )}
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span className="flex items-center gap-1.5">
                            {job.success ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
                            {job.stages.requestReceivedAt}
                          </span>
                          <span className="text-muted-foreground">{job.bytes} bytes</span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                          <span>{t.devices.clientIpLabel}: <span className="font-medium text-foreground">{job.clientIp}</span></span>
                          <span>{t.devices.diagPrinterIp}: <span className="font-medium text-foreground">{job.printerIp}:{job.printerPort}</span></span>
                          <span>{t.devices.connectAttemptsLabel}: <span className="font-medium text-foreground">{job.attempts}</span></span>
                          <span>{t.devices.socketClosedLabel}: <span className="font-medium text-foreground">{job.stages.socketClosedAt ? "✓" : "—"}</span></span>
                        </div>
                        {!job.success && job.error && (
                          <div className="mt-1.5 space-y-1 border-t border-dashed border-border pt-1.5">
                            <p className="font-medium text-destructive">
                              {job.error.friendly}
                              {job.error.code ? ` (${job.error.code})` : ""}
                            </p>
                            <p className="rounded bg-muted/60 p-1.5 font-mono text-[10px] text-destructive">{job.error.message}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {t.devices.networkDiagnostics}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full" disabled={diagRunning} onClick={runDiagnostics}>
                  {diagRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  {t.devices.runDiagnostics}
                </Button>
                <div className="space-y-2">
                  {diagSteps.map((step) => (
                    <div key={step.label} className="flex gap-2 rounded-lg border border-border p-3 text-sm">
                      {step.ok ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <div>
                        <p className="font-medium">{step.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4" />
                  {t.devices.liveLogs}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{t.devices.liveLogsNote}</p>
                <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs">
                  {diagLogs.length === 0 ? (
                    <p className="text-muted-foreground">{t.devices.noLogsYet}</p>
                  ) : (
                    [...diagLogs].reverse().map((entry, i) => (
                      <div key={i} className="flex gap-2 py-0.5">
                        <span className="shrink-0 text-muted-foreground">{entry.time}</span>
                        <span
                          className={cn(
                            "shrink-0 font-semibold",
                            entry.category === "error"
                              ? "text-destructive"
                              : entry.category === "print"
                              ? "text-success"
                              : entry.category === "connection"
                              ? "text-primary"
                              : "text-muted-foreground"
                          )}
                        >
                          [{entry.category}]
                        </span>
                        <span className="break-all">{entry.message}</span>
                      </div>
                    ))
                  )}
                </div>
                <Button variant="outline" className="w-full" disabled={copying} onClick={copyDiagnostics}>
                  {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCopy className="h-4 w-4" />}
                  {t.devices.copyDiagnostics}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatusDot({ state }: { state: ConnectionState }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        state === "online" ? "bg-success" : state === "offline" ? "bg-destructive" : "bg-muted-foreground/40"
      )}
    />
  );
}

function DashboardTab({
  systemStatus,
  printQueue,
  orderQueue,
  logEntries,
  clearSystemLog,
  retryingQueue,
  retryPrintQueue,
  removeFromPrintQueue,
  t,
  currencySymbol,
}: {
  systemStatus: SystemStatusStore;
  printQueue: QueuedReceipt[];
  orderQueue: QueuedOrder[];
  logEntries: SystemLogEntry[];
  clearSystemLog: () => void;
  retryingQueue: boolean;
  retryPrintQueue: () => void;
  removeFromPrintQueue: (id: string) => void;
  t: ReturnType<typeof useI18n>["t"];
  currencySymbol: string;
}) {
  const stateLabel = (s: ConnectionState) =>
    s === "online" ? t.devices.online : s === "offline" ? t.devices.offline : s === "checking" ? t.devices.checking : t.devices.notRunning;

  const allHealthy =
    systemStatus.deviceServer === "online" &&
    systemStatus.printer !== "offline" &&
    systemStatus.internet === "online" &&
    systemStatus.supabase === "online";
  const syncPending = printQueue.length + orderQueue.length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              {t.devices.systemHealth}
            </span>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                allHealthy && syncPending === 0
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              )}
            >
              {allHealthy && syncPending === 0 ? t.devices.readyForSales : t.devices.attentionNeeded}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center justify-between rounded-lg px-2 py-2">
            <span className="flex items-center gap-2 text-sm">
              <Server className="h-4 w-4 text-muted-foreground" />
              {t.devices.deviceServerCard}
            </span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <StatusDot state={systemStatus.deviceServer} />
              {stateLabel(systemStatus.deviceServer)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg px-2 py-2">
            <span className="flex items-center gap-2 text-sm">
              <Printer className="h-4 w-4 text-muted-foreground" />
              {t.devices.receiptPrinter}
            </span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <StatusDot state={systemStatus.printer} />
              {stateLabel(systemStatus.printer)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg px-2 py-2">
            <span className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" />
              {t.devices.internetLabel}
            </span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <StatusDot state={systemStatus.internet} />
              {stateLabel(systemStatus.internet)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg px-2 py-2">
            <span className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-muted-foreground" />
              {t.devices.supabaseLabel}
            </span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <StatusDot state={systemStatus.supabase} />
              {stateLabel(systemStatus.supabase)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg px-2 py-2">
            <span className="flex items-center gap-2 text-sm">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              {t.devices.syncLabel}
            </span>
            <span className="text-sm font-medium">
              {syncPending === 0 ? t.devices.allSynced : `${syncPending} ${t.devices.pendingLabel}`}
            </span>
          </div>
          <div className="my-1 border-t border-dashed border-border" />
          <div className="flex items-center justify-between rounded-lg px-2 py-2">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {t.devices.lastPrintLabel}
            </span>
            <span className="text-sm">{systemStatus.lastPrintAt ? new Date(systemStatus.lastPrintAt).toLocaleTimeString() : t.devices.never}</span>
          </div>
          {systemStatus.lastPrintError && (
            <div className="rounded-lg bg-destructive/10 px-2 py-2">
              <span className="flex items-center gap-2 text-xs font-medium text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {t.devices.lastErrorMessage}
              </span>
              <p className="mt-1 break-all font-mono text-[11px] text-destructive">{systemStatus.lastPrintError}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {(printQueue.length > 0 || orderQueue.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              {t.devices.queuedItems}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {orderQueue.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {orderQueue.length} {t.devices.ordersPendingSync}
                </p>
                {orderQueue.map((o) => (
                  <div key={o.tempId} className="rounded-lg border border-border p-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">{new Date(o.queuedAt).toLocaleString()}</span>
                      <span className="font-semibold">{formatMoney(o.payload.total, currencySymbol)}</span>
                    </div>
                    {o.lastError && <p className="mt-1 text-destructive">{o.lastError}</p>}
                  </div>
                ))}
              </div>
            )}
            {printQueue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    {printQueue.length} {t.devices.receiptsQueued}
                  </p>
                  <Button variant="outline" size="sm" disabled={retryingQueue} onClick={retryPrintQueue}>
                    {retryingQueue ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                    {t.devices.retryNow}
                  </Button>
                </div>
                {printQueue.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-xs">
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-muted-foreground">
                        {new Date(item.queuedAt).toLocaleString()} · {item.attempts} {t.devices.attemptsLabel}
                      </p>
                      {item.lastError && <p className="mt-1 break-all text-destructive">{item.lastError}</p>}
                    </div>
                    <button onClick={() => removeFromPrintQueue(item.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              {t.devices.systemLog}
            </span>
            {logEntries.length > 0 && (
              <button onClick={clearSystemLog} className="text-xs text-muted-foreground hover:text-destructive">
                {t.devices.clearLog}
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">{t.devices.systemLogNote}</p>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs">
            {logEntries.length === 0 ? (
              <p className="text-muted-foreground">{t.devices.noLogsYet}</p>
            ) : (
              logEntries.map((entry) => (
                <div key={entry.id} className="flex gap-2 py-0.5">
                  <span className="shrink-0 text-muted-foreground">{new Date(entry.at).toLocaleTimeString()}</span>
                  <span
                    className={cn(
                      "break-all",
                      entry.level === "error" ? "text-destructive" : entry.level === "warning" ? "text-amber-600 dark:text-amber-400" : ""
                    )}
                  >
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
