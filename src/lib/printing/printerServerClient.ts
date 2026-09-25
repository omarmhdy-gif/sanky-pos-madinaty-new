/** Thrown for any failure talking to the Local Printer Server (unreachable
 * server, or the server reporting it couldn't reach the printer). Callers
 * must catch this and surface it — never let it freeze the POS.
 *
 * `stage` pins down exactly where in the print pipeline things went wrong,
 * instead of a single undifferentiated "Timed Out":
 *   - "connecting": the Device Server couldn't open a TCP connection to the
 *     printer within its own internal timeout.
 *   - "sending": the connection opened, but writing the ESC/POS bytes to it
 *     didn't complete in time.
 *   - "response": the Device Server never answered the POS's HTTP request
 *     at all within the client-side timeout — this is the "iPad Safari's
 *     timeout may be too short" case, distinct from the two above (which
 *     both mean the Device Server DID respond, just with a failure).
 *   - null: not a timeout (e.g. missing configuration, HTTP error status). */
export type PrintStage = "connecting" | "sending" | "response";

export class PrinterConnectionError extends Error {
  stage: PrintStage | null;
  constructor(message: string, stage: PrintStage | null = null) {
    super(message);
    this.stage = stage;
  }
}

// The Device Server always advertises itself on the LAN at this fixed
// hostname via mDNS/Bonjour (see printer-server/server.js). iPadOS resolves
// ".local" names via its own OS-level Bonjour resolver — the same mechanism
// AirPrint/AirPlay use — so a plain fetch() to this hostname just works
// without the browser needing any special mDNS API (which doesn't exist in
// Safari) and without the owner ever typing an IP address. If the PC's IP
// changes later, this hostname keeps resolving to the new one automatically.
export const MDNS_HOSTNAME = "sanky-device.local";
export const DEFAULT_DEVICE_SERVER_PORT = 9200;

export interface PrinterServerTarget {
  host: string;
  port: number;
}

export interface NetworkPrinterTarget {
  ip: string;
  port: number;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  return bytes;
}

function serverUrl(server: PrinterServerTarget, path: string): string {
  return `https://${server.host}:${server.port}${path}`;
}

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  // Tracked separately from the AbortError itself: fetch() throws the same
  // generic error whether the client gave up waiting or the connection
  // failed outright, so this is the only way to tell "we timed out" from
  // "it was refused/unreachable" apart afterward.
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (timedOut) {
      throw new PrinterConnectionError(
        `Timeout waiting for HTTP response from the Device Server (no reply after ${Math.round(timeoutMs / 1000)}s).`,
        "response"
      );
    }
    throw new PrinterConnectionError(
      "Could not reach the Local Printer Server. Make sure it's running and the address in Settings → Devices is correct."
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new PrinterConnectionError(`Local Printer Server returned an error (${res.status}).`);
  }
  return res.json();
}

/** Pings the Local Printer Server itself (not the printer) — distinguishes
 * "server not running" from "printer unreachable". */
export async function isPrintServerReachable(server: PrinterServerTarget): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(serverUrl(server, "/health"), { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** Asks the Local Printer Server to test its raw TCP connection to the
 * printer (the server does this, not the browser, since only it can open
 * a real socket). */
export async function testPrinterConnection(server: PrinterServerTarget, printer: NetworkPrinterTarget): Promise<boolean> {
  const data = await postJson(serverUrl(server, "/relay/test-connection"), { host: printer.ip, port: printer.port }, 5000);
  return !!data.online;
}

/** Sends raw bytes (ESC/POS commands) to the printer via the Local Printer
 * Server's generic relay.
 *
 * 25s client-side timeout (up from 8s): the Device Server's own internal
 * per-attempt timeout is 8s, so this leaves ample margin for it to always
 * respond with a specific staged error before the POS itself gives up —
 * iPad Safari in particular can add real latency to establishing the
 * HTTPS connection on some networks, and 8s wasn't leaving enough room for
 * that on top of the server's own timeout window. */
export async function sendRawToPrinter(server: PrinterServerTarget, printer: NetworkPrinterTarget, bytes: Uint8Array): Promise<void> {
  const data = await postJson(
    serverUrl(server, "/relay/print"),
    { host: printer.ip, port: printer.port, dataHex: bytesToHex(bytes) },
    25000
  );
  if (!data.success) {
    const rawError = typeof data.error === "string" ? data.error : "Could not reach the printer.";
    const stage = data.stage === "connecting" || data.stage === "sending" ? data.stage : null;
    const timedOut = data.timedOut === true;
    // Prefer the Device Server's own exact, specific label (e.g. "Connection
    // refused", "Printer reset the connection") over the old generic
    // "Timeout connecting/waiting" wording — falls back to that older
    // phrasing only if talking to a pre-1.9.0 Device Server that doesn't
    // send friendlyError yet. Either way, the raw error text is always
    // appended, never replaced — this is what surfaces in the cashier's
    // toast and the system log, not just the Devices diagnostics page.
    const friendly =
      typeof data.friendlyError === "string" && data.friendlyError
        ? data.friendlyError
        : timedOut
        ? stage === "connecting"
          ? "Timeout connecting to printer"
          : stage === "sending"
          ? "Timeout waiting for printer"
          : null
        : null;
    const errorCode = typeof data.errorCode === "string" ? data.errorCode : null;
    const label = friendly ? `${friendly}${errorCode ? ` (${errorCode})` : ""}` : null;
    throw new PrinterConnectionError(label ? `${label}: ${rawError}` : rawError, timedOut ? stage : null);
  }
}

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/** Times how long the Device Server takes to answer /health, from the POS's
 * own perspective — this is the number that actually matters for "is this
 * till going to hang waiting on a print," not a server-side self-report. */
export async function checkHealthLatency(server: PrinterServerTarget): Promise<HealthCheckResult> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(serverUrl(server, "/health"), { signal: controller.signal });
    const latencyMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start);
    return { ok: res.ok, latencyMs };
  } catch (err) {
    const latencyMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start);
    return { ok: false, latencyMs, error: err instanceof Error ? err.message : "unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

export interface PrinterCheckSnapshot {
  ip: string;
  port: number;
  online: boolean;
  at: string;
  latencyMs: number;
  reason: string | null;
}

export interface PrintJobSnapshot {
  ip: string;
  port: number;
  success: boolean;
  at: string;
  bytes: number;
  error: string | null;
  /** Which stage of the print job failed ("connecting" | "sending"), or
   * null on success — lets the UI say "Timeout connecting to printer"
   * instead of a generic "Timed Out". */
  stage: string | null;
  /** Whether the failure was specifically a timeout, vs. e.g. an immediate
   * connection refusal at the same stage — those need different wording. */
  timedOut: boolean;
  /** Raw Node.js socket error code (e.g. "ECONNREFUSED", "ECONNRESET"),
   * or a validation code ("INVALID_PAYLOAD", "MISSING_FIELDS") — never
   * hidden behind the friendly label, always shown alongside it. */
  errorCode?: string | null;
  /** Exact, specific phrase for errorCode (e.g. "Connection refused"),
   * shown next to — never instead of — the raw error/errorCode above. */
  friendlyError?: string | null;
}

/** Full structured diagnostics for one print job — every stage of the
 * POS -> Device Server -> Printer pipeline stamped with a timestamp as it
 * happened, plus the exact client/printer address actually received (not
 * assumed from stored config). Powers the Devices page's Print Job Log. */
export interface PrintJobRecord {
  id: string;
  clientIp: string;
  printerIp: string;
  printerPort: number;
  bytes: number;
  attempts: number;
  stages: {
    requestReceivedAt: string | null;
    connectStartAt: string | null;
    connectedAt: string | null;
    bytesWrittenAt: string | null;
    socketClosedAt: string | null;
  };
  success: boolean | null;
  error: {
    code: string | null;
    message: string;
    friendly: string;
    stage: string | null;
    timedOut: boolean;
  } | null;
}

export interface DiagnosticsStatus {
  server: {
    ok: boolean;
    uptimeSec: number;
    boundHost: string;
    httpsPort: number;
    httpPort: number;
    addresses: string[];
    now: string;
  };
  lastPrinterCheck: PrinterCheckSnapshot | null;
  lastPrintJob: PrintJobSnapshot | null;
}

/** Full state snapshot from the Device Server itself — uptime, what it's
 * bound to, and the last printer check/print job it ran (even if the POS
 * wasn't the one that triggered them, e.g. a Test Print from another till). */
export async function fetchDiagnosticsStatus(server: PrinterServerTarget): Promise<DiagnosticsStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    let res: Response;
    try {
      res = await fetch(serverUrl(server, "/diagnostics/status"), { signal: controller.signal });
    } catch {
      throw new PrinterConnectionError("Could not reach the Device Server.");
    }
    if (!res.ok) throw new PrinterConnectionError(`Device Server returned an error (${res.status}).`);
    return (await res.json()) as DiagnosticsStatus;
  } finally {
    clearTimeout(timeout);
  }
}

/** The full recent history of print jobs (not just the last one) — every
 * stage timestamped, the exact client/printer IP:port actually received,
 * and on failure the raw error code/message plus a friendly label. */
export async function fetchPrintJobHistory(server: PrinterServerTarget): Promise<PrintJobRecord[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    let res: Response;
    try {
      res = await fetch(serverUrl(server, "/diagnostics/print-jobs"), { signal: controller.signal });
    } catch {
      throw new PrinterConnectionError("Could not reach the Device Server.");
    }
    if (!res.ok) throw new PrinterConnectionError(`Device Server returned an error (${res.status}).`);
    const data = await res.json();
    return Array.isArray(data.jobs) ? (data.jobs as PrintJobRecord[]) : [];
  } finally {
    clearTimeout(timeout);
  }
}

export interface LogEntry {
  time: string;
  category: string;
  message: string;
}

/** The last 100 log lines straight from the Device Server's own console —
 * lets the owner see exactly what happened without opening that terminal. */
export async function fetchDiagnosticsLogs(server: PrinterServerTarget): Promise<LogEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    let res: Response;
    try {
      res = await fetch(serverUrl(server, "/diagnostics/logs"), { signal: controller.signal });
    } catch {
      throw new PrinterConnectionError("Could not reach the Device Server.");
    }
    if (!res.ok) throw new PrinterConnectionError(`Device Server returned an error (${res.status}).`);
    const data = await res.json();
    return Array.isArray(data.logs) ? (data.logs as LogEntry[]) : [];
  } finally {
    clearTimeout(timeout);
  }
}

export interface DiscoveredServer {
  host: string;
  port: number;
  friendlyName: string;
  version: string;
  latencyMs: number;
  /** The Device Server's current LAN IP, shown to the owner purely as
   * informational status (e.g. for cross-checking in a router's device
   * list) — never required as input, since the hostname is what's actually
   * used to connect. */
  ipAddress: string | null;
  /** When this Device Server's TLS certificate was generated (ISO string),
   * or null if it's running an older version that doesn't report this.
   * Comparing this against the last value this device saw is how the POS
   * detects "this is a different certificate than before" (e.g. after
   * .certs/ was deleted/reinstalled) and tells the owner they need to
   * trust it again, instead of a silent, confusing connection failure. */
  certGeneratedAt: string | null;
}

export interface DiscoveryResult {
  server: DiscoveredServer | null;
  /** The raw error `fetch()` threw (e.g. "Failed to fetch" in Chrome,
   * "Load failed" in Safari) when discovery failed. Browsers deliberately
   * do NOT expose the specific underlying reason (cert untrusted, CORS
   * blocked, connection refused, DNS failure, etc.) to page JavaScript —
   * that level of detail only ever appears in the browser's own DevTools
   * console, never in a catch block, for anti-fingerprinting/security
   * reasons. This is the most detail that is honestly obtainable here. */
  error: string | null;
}

/** "Find Device Server": tries a specific host:port directly — there's no
 * way to browse/enumerate arbitrary services or read an advertised SRV/TXT
 * port from Safari (no such web API exists; mDNS service records are only
 * queryable by native Bonjour-aware clients, not by fetch()), so this isn't
 * a network scan — it's a single, fast check of one address.
 *
 * The port the Device Server actually listens on is fixed and known ahead
 * of time (DEFAULT_DEVICE_SERVER_PORT, 9200) — it's not something that
 * varies per-install, so callers should always probe that port for the
 * canonical `MDNS_HOSTNAME`. `port`/`host` are only overridable for the
 * Advanced manual-entry fallback — never pass a value read back from
 * possibly-stale local storage as the automatic/primary attempt, or a
 * stale port silently keeps getting reused forever instead of ever being
 * corrected. */
export async function discoverDeviceServer(
  port: number = DEFAULT_DEVICE_SERVER_PORT,
  host: string = MDNS_HOSTNAME
): Promise<DiscoveryResult> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`https://${host}:${port}/health`, { signal: controller.signal });
    if (!res.ok) return { server: null, error: `Device Server responded with HTTP ${res.status}.` };
    const data = await res.json();
    const latencyMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start);
    return {
      server: {
        host,
        port,
        friendlyName: typeof data.friendlyName === "string" ? data.friendlyName : "Sanky Device Server",
        version: typeof data.version === "string" ? data.version : "unknown",
        latencyMs,
        ipAddress: Array.isArray(data.addresses) && typeof data.addresses[0] === "string" ? data.addresses[0] : null,
        certGeneratedAt: typeof data.certGeneratedAt === "string" ? data.certGeneratedAt : null,
      },
      error: null,
    };
  } catch (err) {
    return { server: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

export interface DiscoveredPrinter {
  ip: string;
  port: number;
  latencyMs: number;
}

/** Asks the Device Server to scan its local subnet for anything answering
 * on the given port (default 9100) — this only works because the Device
 * Server is a real OS process with raw socket access; it's the same reason
 * the whole relay architecture exists in the first place (browsers can't
 * do this scan themselves). A full /24 sweep takes a few seconds, hence
 * the generous timeout. */
export async function discoverPrinters(server: PrinterServerTarget, port = 9100, timeoutMs = 15000): Promise<DiscoveredPrinter[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${serverUrl(server, "/relay/discover-printers")}?port=${port}`, { signal: controller.signal });
    if (!res.ok) throw new PrinterConnectionError(`Device Server returned an error (${res.status}).`);
    const data = await res.json();
    return Array.isArray(data.printers) ? (data.printers as DiscoveredPrinter[]) : [];
  } catch (err) {
    if (err instanceof PrinterConnectionError) throw err;
    throw new PrinterConnectionError("Could not reach the Device Server to scan for printers.");
  } finally {
    clearTimeout(timeout);
  }
}
