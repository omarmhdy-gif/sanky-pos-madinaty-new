"use strict";

// Sanky POS — Local Printer Server
//
// Architecture: iPad (POS, HTTPS) --> this server (LAN) --> EPSON ESC/POS
// printer (raw TCP, usually port 9100) --> cash drawer (wired to printer).
//
// The POS never talks to the printer directly — it can't; browsers have no
// raw TCP socket API. This tiny server is the bridge: the POS sends it
// print jobs over plain HTTPS, and this server relays the raw bytes to the
// printer's IP over a real TCP socket, something only a real OS process
// (not a browser tab) can do.
//
// It's a generic relay, not printer-specific — any future device (kitchen
// printer, label printer, a second receipt printer) just needs its own
// host/port and its own byte payload from the POS side; this server never
// needs to change for that.

const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const selfsigned = require("selfsigned");
const { Bonjour } = require("bonjour-service");

const HTTPS_PORT = process.env.PORT ? Number(process.env.PORT) : 9200;
const HTTP_PORT = HTTPS_PORT + 1; // plain-HTTP fallback, in case the POS is ever loaded over http:// on the LAN

const CERT_DIR = path.join(__dirname, ".certs");
const CERT_PATH = path.join(CERT_DIR, "cert.pem");
const KEY_PATH = path.join(CERT_DIR, "key.pem");
const CERT_META_PATH = path.join(CERT_DIR, "meta.json");

// A fixed, well-known hostname the server advertises via mDNS/Bonjour, so
// the POS never needs to know this machine's IP address — the OS-level
// Bonjour resolver on iPad/iPhone/Mac resolves "sanky-device.local" to
// whatever this machine's current IP actually is, the same mechanism
// AirPrint/AirPlay use. If the IP ever changes (DHCP renewal, moving to a
// different router), the hostname keeps resolving correctly with zero
// reconfiguration — that's the whole point of using it instead of a raw IP.
const MDNS_HOST_LABEL = "sanky-device";
const MDNS_HOSTNAME = `${MDNS_HOST_LABEL}.local`;
const SERVER_FRIENDLY_NAME = "Sanky Device Server";
const SERVER_VERSION = "1.9.1";

const START_TIME = Date.now();

function timestamp() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

/** The requesting device's LAN IP, for the "is the POS even sending what I
 * think it's sending" class of question — every print/test-connection
 * request logs this. IPv4-mapped-IPv6 form (::ffff:192.168.1.10, which
 * Node reports for IPv4 clients on a dual-stack socket) is unwrapped to
 * plain IPv4 since that's what anyone reading the log actually expects. */
function clientIp(req) {
  let ip = req.socket.remoteAddress || "unknown";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

// Maps a raw Node.js socket error code to the exact, specific phrase the
// owner actually needs to act on — "Timed Out" alone doesn't say whether
// the printer refused the connection, was unreachable, or was just slow,
// and each of those points to a different fix (wrong IP vs. powered off
// vs. flaky Wi-Fi). Always paired with the raw code/message too (never
// shown instead of it) — see buildErrorInfo below.
const ERROR_LABELS = {
  ECONNREFUSED: "Connection refused",
  EHOSTUNREACH: "Printer unreachable (no route to host)",
  ENETUNREACH: "Printer unreachable (network unreachable)",
  ECONNRESET: "Printer reset the connection",
  EPIPE: "Broken pipe — printer closed the connection unexpectedly",
  ENOTFOUND: "Printer address could not be resolved",
  EHOSTDOWN: "Printer host is down",
};

// Buffer.from(hex, "hex") silently STOPS at the first invalid byte pair
// instead of throwing — a malformed dataHex string (odd length, non-hex
// characters, e.g. from a client-side bug or version mismatch) would
// otherwise produce a silently truncated/garbled buffer sent straight to
// the printer with no error at all. Validate explicitly so that class of
// bug surfaces as "Invalid ESC/POS payload" instead of a mysteriously
// garbled or partial receipt.
function isValidHexPayload(hex) {
  return typeof hex === "string" && hex.length > 0 && hex.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(hex);
}

function friendlyErrorLabel(code, stage, timedOut) {
  if (code === "INVALID_PAYLOAD") return "Invalid ESC/POS payload";
  if (code === "MISSING_FIELDS") return "Missing required fields in print request";
  if (timedOut) return stage === "sending" ? "Write timeout" : "Connection timeout";
  if (code && ERROR_LABELS[code]) return ERROR_LABELS[code];
  if (stage === "sending") return "Write failed";
  if (stage === "connecting") return "Connection failed";
  return "Unknown error";
}

/** Full structured info for one failure: the raw Node error code AND
 * message (never hidden or paraphrased away) plus the friendly label
 * above, so the Devices page can show both "what exactly happened at the
 * OS/socket level" and "what that means" side by side. */
function buildErrorInfo(err) {
  const code = (err && err.code) || null;
  const stage = err instanceof PrintStageError ? err.stage : null;
  const timedOut = err instanceof PrintStageError ? !!err.timedOut : false;
  return {
    code,
    message: (err && err.message) || String(err),
    friendly: friendlyErrorLabel(code, stage, timedOut),
    stage,
    timedOut,
  };
}

// A rolling buffer of the last 100 log entries, exposed via GET
// /diagnostics/logs so the POS can show a "Live Logs" view without anyone
// needing to open this terminal window. Every log() call is tagged with a
// category (server/request/connection/print/error) so the POS can color
// and filter them.
const LOG_BUFFER = [];
const MAX_LOG_ENTRIES = 100;

function log(category, ...args) {
  const message = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  console.log(`[${timestamp()}] [${category}]`, ...args);
  LOG_BUFFER.push({ time: timestamp(), category, message });
  if (LOG_BUFFER.length > MAX_LOG_ENTRIES) LOG_BUFFER.shift();
}

// Common virtual/software adapter name fragments — VPN clients, hypervisor
// host-only/NAT adapters, container bridges. Node's os.networkInterfaces()
// has no "is this virtual" flag (only `internal`, which just means
// loopback — a VMware/Hyper-V/VPN adapter is NOT internal, so it would
// otherwise be reported as if it were a real LAN address the POS could
// reach). Matched case-insensitively against the interface's OS-assigned
// name (the object key from os.networkInterfaces(), e.g. "Wi-Fi",
// "Ethernet", "VMware Network Adapter VMnet1", "vEthernet (Default
// Switch)"). Not exhaustive by nature — no name-pattern list can be — but
// covers the adapters that actually show up on a normal Windows till PC.
const VIRTUAL_ADAPTER_NAME_PATTERN = /vmware|virtualbox|vbox|hyper-v|vethernet|virtual|tailscale|zerotier|wireguard|openvpn|tap-|tun\d|docker|wsl|loopback|npcap|pdanet/i;

/** Every real, currently-reachable LAN IPv4 address on this machine — Wi-Fi
 * and Ethernet alike, since the OS reports both the same way and this
 * doesn't special-case either. Deliberately NOT cached: call this fresh
 * everywhere it's reported (see /health and /diagnostics/status below),
 * never store its result in a variable that outlives a single call. A
 * cached snapshot is effectively a hardcoded value for the rest of the
 * process's life — if this runs before DHCP has assigned the Wi-Fi/
 * Ethernet adapter an address yet (a real startup-ordering race for a
 * Windows Service that auto-starts at boot), a cached empty result would
 * stay empty forever even after the network comes up moments later. This
 * was the actual cause of a real regression: computing it once at module
 * load and reusing that value for the life of the process. */
function localIPv4Addresses() {
  const ips = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_ADAPTER_NAME_PATTERN.test(name)) continue;
    for (const iface of ifaces || []) {
      // Node has always reported `family` as the string "IPv4"/"IPv6" for
      // os.networkInterfaces() (unlike dns.lookup(), which uses numeric 4/6
      // on newer Node versions) — but comparing loosely against both forms
      // costs nothing and removes any dependency on which exact Node
      // version/platform this runs on.
      const isIPv4 = iface.family === "IPv4" || iface.family === 4;
      if (isIPv4 && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

// The POS is served over HTTPS (Vercel) — a browser will refuse to fetch()
// a plain http:// address from an https:// page ("mixed content"), so this
// server must speak HTTPS too. There's no certificate authority for a
// private LAN IP, so this generates a self-signed one covering every local
// IP this machine has PLUS the mDNS hostname (Safari validates the cert's
// SAN against whatever hostname was actually used in the URL — an IP-only
// cert would fail hostname-mismatch when accessed via sanky-device.local,
// even after the user trusts it once). The browser will still show a "not
// private" warning the first time — that's an unavoidable, one-time step
// for ANY self-signed local server, not a bug here.
//
// Generated EXACTLY ONCE and reused forever after that — this is
// deliberate and load-bearing, not just an optimization: every device
// that has ever trusted this certificate (tapped through Safari's warning
// once) must keep trusting it across every future restart, or the owner
// would have to re-trust it on every iPad, every time, forever. The only
// things that can make this regenerate are (a) `.certs/` genuinely being
// missing — first install, or the owner deleting it on purpose as an
// explicit reset — or (b) the cached files being corrupt/unreadable. A
// changed DHCP IP does NOT trigger regeneration: the primary connection
// path is the mDNS hostname (a DNS-name SAN entry, which never changes),
// not the IP-address SAN entries, so an IP change doesn't actually break
// the certificate's validity for how the app connects day to day.
function getOrCreateCert() {
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH) && fs.existsSync(CERT_META_PATH)) {
    try {
      const meta = JSON.parse(fs.readFileSync(CERT_META_PATH, "utf8"));
      // meta.json files written before certGeneratedAt tracking existed
      // don't have this field — backfill it from the cert file's own
      // mtime (a reasonable stand-in for "when it was generated") and
      // persist that going forward, rather than reporting "undefined"
      // forever. This never touches the actual cert/key bytes.
      let generatedAt = meta.generatedAt;
      if (!generatedAt) {
        generatedAt = fs.statSync(CERT_PATH).mtime.toISOString();
        fs.writeFileSync(CERT_META_PATH, JSON.stringify({ ...meta, generatedAt }));
      }
      return { cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH), generatedAt, isNew: false };
    } catch (err) {
      log("error", `Existing certificate files are unreadable/corrupt (${err.message}) — regenerating.`);
    }
  }

  const ips = ["127.0.0.1", ...localIPv4Addresses()];
  const dnsNames = ["localhost", MDNS_HOSTNAME];
  const altNames = ips.map((ip) => ({ type: 7, ip })); // type 7 = iPAddress SAN
  for (const name of dnsNames) altNames.push({ type: 2, value: name }); // type 2 = dNSName SAN

  const pems = selfsigned.generate([{ name: "commonName", value: MDNS_HOSTNAME }], {
    days: 3650,
    keySize: 2048,
    extensions: [{ name: "subjectAltName", altNames }],
  });

  const generatedAt = new Date().toISOString();
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(CERT_PATH, pems.cert);
  fs.writeFileSync(KEY_PATH, pems.private);
  fs.writeFileSync(CERT_META_PATH, JSON.stringify({ ips, dnsNames, generatedAt }));
  return { cert: pems.cert, key: pems.private, generatedAt, isNew: true };
}

// "Access-Control-Allow-Private-Network" is a separate browser security
// layer from ordinary CORS (Chrome's Private Network Access policy): when a
// page loaded from a public origin (like sanky-pos.vercel.app) requests a
// private-network address (a LAN IP, or a .local mDNS hostname — both count
// as "more private" than the public internet), Chrome sends an automatic
// CORS preflight asking for explicit permission, and silently blocks the
// request if the server doesn't answer with this header — with NO details
// surfaced to page JavaScript (just a generic "Failed to fetch"), only
// visible in the browser's own DevTools console. Without this, requests
// from the POS would be blocked by Chrome even with a fully-trusted
// certificate and otherwise-correct CORS headers.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
};

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

// A 204 response must have no body at all (that's what "No Content" means)
// — sending one anyway can make some browsers treat the CORS preflight as
// malformed and silently fail every POST request that needs one.
function sendNoContent(res) {
  res.writeHead(204, CORS_HEADERS);
  res.end();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) req.destroy(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Snapshots of the most recent printer TCP check and print job, kept in
// memory so the Diagnostics page can show "Last Connection Time" / "Last
// Print Job" without the POS having to trigger a fresh one just to display
// history.
let lastPrinterCheck = null;
let lastPrintJob = null;

// Full structured history of every print job (not just the last one) —
// every stage of the POS -> Device Server -> Printer pipeline is stamped
// with a timestamp as it happens (see newPrintJob()/stamp() below), so the
// Devices page can show exactly where a failed job got to, not just that
// it failed. Capped so a busy till's memory usage stays bounded; older
// jobs just fall off the end.
const PRINT_JOB_HISTORY = [];
const MAX_PRINT_JOB_HISTORY = 50;
let printJobCounter = 0;

function newPrintJob({ clientIp: ip, printerIp, printerPort, bytes }) {
  return {
    id: `pj_${Date.now().toString(36)}_${(++printJobCounter).toString(36)}`,
    clientIp: ip,
    printerIp,
    printerPort,
    bytes,
    attempts: 0,
    stages: {
      requestReceivedAt: timestamp(),
      connectStartAt: null,
      connectedAt: null,
      bytesWrittenAt: null,
      socketClosedAt: null,
    },
    success: null,
    error: null,
  };
}

function recordPrintJob(job) {
  PRINT_JOB_HISTORY.unshift(job);
  if (PRINT_JOB_HISTORY.length > MAX_PRINT_JOB_HISTORY) PRINT_JOB_HISTORY.length = MAX_PRINT_JOB_HISTORY;
}

// Thrown by sendRawBytes so the caller can report exactly which stage of
// the print job failed ("connecting" | "sending"), AND whether it was
// specifically a timeout versus some other error (e.g. connection refused
// is stage "connecting" but is NOT a timeout — it fails immediately, not
// after waiting) — conflating the two would mislabel an instant refusal as
// "Timeout connecting to printer", which is actively misleading. Also
// carries the raw Node.js socket error `code` (e.g. "ECONNREFUSED",
// "ECONNRESET") through untouched, which is what buildErrorInfo() above
// maps to an exact, specific phrase instead of a generic "Timed Out".
class PrintStageError extends Error {
  constructor(message, stage, timedOut, code = null) {
    super(message);
    this.stage = stage;
    this.timedOut = timedOut;
    this.code = code;
  }
}

/** Opens a single TCP connection attempt to the target device. Resolves
 * with the connected socket, or rejects with a PrintStageError(stage:
 * "connecting"). `setNoDelay(true)` disables Nagle's algorithm — ESC/POS
 * payloads are typically well under 1KB, and on a flaky/lossy Wi-Fi link
 * Nagle can hold a small write back waiting to coalesce with more data
 * that never comes, adding avoidable latency and a wider exposure window
 * for the write to land during a transient Wi-Fi drop. */
function connectOnce(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        socket.destroy();
        reject(err);
      } else {
        resolve(socket);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish(new PrintStageError(`Timed out connecting to ${host}:${port}`, "connecting", true, "ETIMEDOUT")));
    socket.once("error", (err) => finish(new PrintStageError(err.message, "connecting", false, err.code || null)));
    socket.connect(port, host, () => {
      socket.setNoDelay(true);
      finish(null);
    });
  });
}

/** Root-cause fix for "printer occasionally disconnects, needs a restart":
 * cheap ESC/POS network modules commonly run a minimal single-connection
 * TCP stack that briefly refuses or hangs on a new connection right after
 * finishing a previous job, or after a short Wi-Fi drop — and recovers on
 * its own within a couple of seconds without any power cycle. A single
 * connect attempt treats that transient window as a hard failure (and,
 * historically, is exactly what taught cashiers "just restart the
 * printer"). This retries the CONNECT step only — never the write, so a
 * job is never partially re-sent — a bounded number of times with a short
 * backoff, well inside the POS's own 25s client-side budget.
 *
 * `job` (optional) is the structured diagnostics record for this print job
 * (see newPrintJob()) — stamped with connectStartAt/connectedAt and the
 * real attempt count as they happen, so the Devices page can show exactly
 * how long connecting took and whether the printer needed a retry to
 * recover, not just pass/fail. */
async function connectWithRetry(host, port, job, attempts = 3, perAttemptTimeoutMs = 3000, backoffsMs = [400, 1200]) {
  let lastErr;
  if (job && !job.stages.connectStartAt) job.stages.connectStartAt = timestamp();
  for (let i = 0; i < attempts; i++) {
    if (job) job.attempts = i + 1;
    try {
      if (i > 0) log("print", `  Connecting to printer ${host}:${port} (retry ${i}/${attempts - 1})...`);
      else log("print", `  Connecting to printer ${host}:${port}...`);
      const socket = await connectOnce(host, port, perAttemptTimeoutMs);
      if (job) job.stages.connectedAt = timestamp();
      if (i > 0) log("print", `  Connected after ${i} retr${i > 1 ? "ies" : "y"} — printer recovered on its own`);
      else log("print", `  Connected`);
      return socket;
    } catch (err) {
      lastErr = err;
      log("error", `  Connect attempt ${i + 1}/${attempts} failed: [${err.code || "?"}] ${err.message}`);
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, backoffsMs[Math.min(i, backoffsMs.length - 1)]));
      }
    }
  }
  throw lastErr;
}

/** Opens a raw TCP connection to the target device (with connect-retry, see
 * above) and writes the given bytes. This is the one thing a browser
 * fundamentally cannot do — it's the whole reason this server exists.
 *
 * Logs every stage with a millisecond timestamp (via log()) so a slow or
 * stuck print job can be pinned to an exact step from the server's own
 * console / Live Logs, instead of just "it timed out somewhere." Resolves
 * as soon as the bytes are handed to the OS's TCP send buffer — that's the
 * point at which the printer will actually receive them; waiting for the
 * full connection teardown before letting the HTTP response go out would
 * just make the POS wait longer for no benefit.
 *
 * `job` (optional) gets every remaining stage stamped: bytesWrittenAt and
 * socketClosedAt (the latter from the socket's real "close" event, not
 * just the moment .end() was called — so it reflects the connection
 * actually finishing, including if the printer resets it mid-teardown). */
async function sendRawBytes(host, port, buffer, job, timeoutMs = 8000) {
  const socket = await connectWithRetry(host, port, job);

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve();
    };
    socket.once("close", (hadError) => {
      if (job) job.stages.socketClosedAt = timestamp();
      log("print", `  Socket closed${hadError ? " (with error/reset)" : ""}`);
    });

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => {
      log("error", `  [sending] timed out after ${timeoutMs}ms writing to ${host}:${port}`);
      socket.destroy();
      done(new PrintStageError(`Timed out while sending to ${host}:${port}`, "sending", true, "ETIMEDOUT"));
    });
    socket.once("error", (err) => {
      log("error", `  [sending] socket error: [${err.code || "?"}] ${err.message}`);
      socket.destroy();
      done(new PrintStageError(err.message, "sending", false, err.code || null));
    });

    log("print", `  Sending ESC/POS data (${buffer.length} bytes)...`);
    socket.write(buffer, (err) => {
      if (err) {
        log("error", `  [sending] write error: [${err.code || "?"}] ${err.message}`);
        socket.destroy();
        return done(new PrintStageError(err.message, "sending", false, err.code || null));
      }
      if (job) job.stages.bytesWrittenAt = timestamp();
      log("print", `  Bytes written: ${buffer.length}`);
      log("print", `  Closing socket`);
      socket.end();
      done();
    });
  });
}

function testTcpConnectionOnce(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (online, reason) => {
      if (settled) return;
      settled = true;
      socket.end();
      socket.destroy();
      resolve({ online, reason: reason || null });
    };
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => finish(false, "timed out"));
    socket.on("error", (err) => finish(false, err.message));
    socket.connect(port, host, () => finish(true));
  });
}

/** One quick retry before reporting "offline" — this is the status probe
 * used both by the periodic background health check and the manual Test
 * Connection button, so a single transient blip (the same brief
 * printer-stack hiccup connectWithRetry recovers from during a real print)
 * would otherwise flip the displayed status to offline and back every
 * cycle for no real reason. */
async function testTcpConnection(host, port, timeoutMs = 3000) {
  const startedAt = Date.now();
  let result = await testTcpConnectionOnce(host, port, timeoutMs);
  if (!result.online) {
    await new Promise((r) => setTimeout(r, 400));
    result = await testTcpConnectionOnce(host, port, timeoutMs);
  }
  const latencyMs = Date.now() - startedAt;
  lastPrinterCheck = { ip: host, port, online: result.online, at: timestamp(), latencyMs, reason: result.reason };
  log(
    "connection",
    `-> test-connection to ${host}:${port}: ${result.online ? "ONLINE" : "OFFLINE"}${result.reason ? ` (${result.reason})` : ""} (${latencyMs} ms)`
  );
  return result.online;
}

/** A single, silent TCP probe used only by the network scan below — unlike
 * testTcpConnection() it doesn't update lastPrinterCheck or log every
 * attempt (a /24 sweep is ~254 of these; logging each one would flood
 * Live Logs for no benefit). */
function probeTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const startedAt = Date.now();
    const finish = (online) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(online ? Date.now() - startedAt : null);
    };
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.connect(port, host, () => finish(true));
  });
}

/** Scans this machine's local /24 subnet(s) for anything answering on the
 * given port (default 9100, the standard raw ESC/POS port) — this is only
 * possible because this server is a real Node process with raw socket
 * access; it's the same "browsers can't do this" reason the whole relay
 * exists. Bounded concurrency keeps a full /24 sweep to a few seconds
 * instead of hammering the network with 254 simultaneous connections. */
async function scanForPrinters(port = 9100, timeoutMs = 400, concurrency = 32) {
  const candidates = [];
  for (const base of localIPv4Addresses()) {
    const prefix = base.split(".").slice(0, 3).join(".");
    for (let i = 1; i <= 254; i++) candidates.push(`${prefix}.${i}`);
  }
  const found = [];
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const ip = candidates[cursor++];
      const latencyMs = await probeTcp(ip, port, timeoutMs);
      if (latencyMs !== null) found.push({ ip, port, latencyMs });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  return found;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    return sendNoContent(res);
  }

  const origin = req.headers.origin;
  log("request", `${req.method} ${url.pathname}${origin ? ` (Origin: ${origin})` : ""}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      name: "sanky-printer-server",
      friendlyName: SERVER_FRIENDLY_NAME,
      version: SERVER_VERSION,
      mdnsHostname: MDNS_HOSTNAME,
      // Computed live, every request — never a startup-time snapshot (see
      // localIPv4Addresses()'s own comment for why that was a real bug).
      addresses: localIPv4Addresses(),
      // Lets the POS detect "this is a different certificate than the one
      // I trusted before" (e.g. after .certs/ was deleted/reinstalled) and
      // tell the owner clearly, instead of a silent/confusing connection
      // failure — see requirement 6, "notify the owner clearly."
      certGeneratedAt: CERT_GENERATED_AT,
    });
  }

  if (req.method === "GET" && url.pathname === "/diagnostics/status") {
    return sendJson(res, 200, {
      server: {
        ok: true,
        uptimeSec: Math.round((Date.now() - START_TIME) / 1000),
        boundHost: BIND_HOST,
        httpsPort: HTTPS_PORT,
        httpPort: HTTP_PORT,
        addresses: localIPv4Addresses(),
        now: timestamp(),
      },
      lastPrinterCheck,
      lastPrintJob,
    });
  }

  if (req.method === "GET" && url.pathname === "/diagnostics/logs") {
    return sendJson(res, 200, { logs: LOG_BUFFER });
  }

  // Full structured per-job history (see newPrintJob()) — every stage
  // timestamp, the exact client/printer IPs and port actually received,
  // and (on failure) the raw error code/message plus a friendly label.
  // This is what powers the Devices page's "Print Job Log", distinct from
  // /diagnostics/status's single lastPrintJob snapshot.
  if (req.method === "GET" && url.pathname === "/diagnostics/print-jobs") {
    return sendJson(res, 200, { jobs: PRINT_JOB_HISTORY });
  }

  if (req.method === "GET" && url.pathname === "/relay/discover-printers") {
    const portParam = Number(url.searchParams.get("port")) || 9100;
    log("connection", `Scanning local subnet for printers on port ${portParam}...`);
    const startedAt = Date.now();
    const printers = await scanForPrinters(portParam);
    log("connection", `Scan complete in ${Date.now() - startedAt}ms — found ${printers.length} device(s) on port ${portParam}`);
    return sendJson(res, 200, { printers });
  }

  if (req.method === "POST" && url.pathname === "/relay/test-connection") {
    const ip = clientIp(req);
    const body = await readJsonBody(req);
    log("request", `  test-connection request: client=${ip} printer=${body.host}:${body.port}`);
    if (!body.host || !body.port) {
      log("error", "  -> rejected: host and port are required");
      return sendJson(res, 400, { error: "host and port are required" });
    }
    const online = await testTcpConnection(body.host, Number(body.port));
    return sendJson(res, 200, { online });
  }

  if (req.method === "POST" && url.pathname === "/relay/print") {
    const ip = clientIp(req);
    log("print", `Request received from ${ip}`);
    const body = await readJsonBody(req);
    const byteCount = typeof body.dataHex === "string" ? Math.floor(body.dataHex.length / 2) : 0;
    // Log the ACTUAL values received, verbatim — never assume the stored
    // POS-side config matches what actually arrived over the wire. This is
    // the single log line to check first for "is the POS even sending the
    // printer IP/port I think it's sending."
    log(
      "request",
      `  print request: client=${ip} printer=${body.host}:${body.port} bytes=${byteCount}`
    );

    if (!body.host || !body.port || !body.dataHex) {
      const info = { code: "MISSING_FIELDS", message: "host, port, and dataHex are required", friendly: friendlyErrorLabel("MISSING_FIELDS", null, false), stage: "validation", timedOut: false };
      log("error", `  -> rejected: ${info.message}`);
      return sendJson(res, 400, { success: false, error: info.message, errorCode: info.code, friendlyError: info.friendly, stage: info.stage, timedOut: false });
    }

    const printerIp = body.host;
    const printerPort = Number(body.port);
    const job = newPrintJob({ clientIp: ip, printerIp, printerPort, bytes: byteCount });

    if (!isValidHexPayload(body.dataHex)) {
      const info = { code: "INVALID_PAYLOAD", message: `dataHex is not valid ESC/POS hex (length=${body.dataHex.length})`, friendly: friendlyErrorLabel("INVALID_PAYLOAD", null, false), stage: "validation", timedOut: false };
      job.success = false;
      job.error = info;
      recordPrintJob(job);
      lastPrintJob = { ip: printerIp, port: printerPort, success: false, at: timestamp(), bytes: byteCount, error: info.message, stage: info.stage, timedOut: false, errorCode: info.code, friendlyError: info.friendly };
      log("error", `  -> rejected: ${info.friendly} — ${info.message}`);
      return sendJson(res, 400, { success: false, error: info.message, errorCode: info.code, friendlyError: info.friendly, stage: info.stage, timedOut: false });
    }

    try {
      const buffer = Buffer.from(body.dataHex, "hex");
      await sendRawBytes(printerIp, printerPort, buffer, job);
      job.success = true;
      recordPrintJob(job);
      lastPrintJob = { ip: printerIp, port: printerPort, success: true, at: timestamp(), bytes: buffer.length, error: null, stage: null, timedOut: false, errorCode: null, friendlyError: null };
      log("print", `-> print SUCCESS (${buffer.length} bytes sent to ${printerIp}:${printerPort}, client=${ip}, attempts=${job.attempts})`);
      log("print", `Returning HTTP 200`);
      return sendJson(res, 200, { success: true });
    } catch (err) {
      const info = buildErrorInfo(err);
      job.success = false;
      job.error = info;
      recordPrintJob(job);
      lastPrintJob = {
        ip: printerIp,
        port: printerPort,
        success: false,
        at: timestamp(),
        bytes: byteCount,
        error: info.message,
        stage: info.stage,
        timedOut: info.timedOut,
        errorCode: info.code,
        friendlyError: info.friendly,
      };
      log("error", `-> print FAILED [${info.code || "?"}] stage="${info.stage}" timedOut=${info.timedOut}: ${info.friendly} — ${info.message}`);
      log("print", `Returning HTTP 200 (success:false)`);
      return sendJson(res, 200, {
        success: false,
        error: info.message,
        errorCode: info.code,
        friendlyError: info.friendly,
        stage: info.stage,
        timedOut: info.timedOut,
      });
    }
  }

  log("request", `  -> 404 not found`);
  sendJson(res, 404, { error: "Not found" });
}

function onError(res) {
  return (err) => {
    log("error", "Unhandled error:", err);
    try {
      sendJson(res, 500, { error: err.message || "Internal error" });
    } catch {
      // response already sent/closed — nothing more to do
    }
  };
}

const { cert, key, generatedAt: CERT_GENERATED_AT, isNew: CERT_IS_NEW } = getOrCreateCert();

// Bind explicitly to 0.0.0.0 (all IPv4 interfaces) rather than leaving the
// host argument out. Leaving it out asks Node for its platform default,
// which on some Windows machines (IPv6 disabled/misconfigured, VPN
// adapters, dual-stack quirks) can end up NOT accepting connections from
// other devices on the LAN even though it works fine from localhost on the
// same PC — exactly the "works here, Offline from the iPad" symptom this
// is fixing. 0.0.0.0 removes that ambiguity entirely.
const BIND_HOST = "0.0.0.0";

https
  .createServer({ cert, key }, (req, res) => {
    handleRequest(req, res).catch(onError(res));
  })
  .listen(HTTPS_PORT, BIND_HOST, () => {
    log("server", "Sanky Printer Server running.");
    if (CERT_IS_NEW) {
      log("server", `  Generated a NEW certificate (first run, or .certs/ was missing/reset) at ${CERT_GENERATED_AT}.`);
      log("server", "  Every device (each iPad, any browser) will need to trust it once — see step 5 in the README.");
    } else {
      log("server", `  Reusing the existing certificate, generated ${CERT_GENERATED_AT} — no re-trust needed on any device.`);
    }
    log("server", `  HTTPS: listening on ${BIND_HOST}:${HTTPS_PORT} (all network interfaces)`);
    // Computed fresh right here, not read from a startup-time constant —
    // if the network genuinely isn't up yet at this exact moment (e.g. a
    // Windows Service racing DHCP at boot), this line may legitimately log
    // nothing, but that no longer poisons /health or /diagnostics/status
    // for the rest of the process's life the way the old cached value did.
    const startupIps = localIPv4Addresses();
    if (startupIps.length === 0) {
      log("server", "    (no LAN IPv4 address yet — network may still be initializing; /health rechecks this live on every request)");
    }
    for (const ip of startupIps) log("server", `    -> https://${ip}:${HTTPS_PORT}`);
    log("server", "  Enter one of the addresses above as the Printer Server Address in Settings -> Devices.");
    log("server", "  First time only: open that same address directly in the browser on the iPad once");
    log("server", "  and accept the security warning, so it trusts this server going forward.");
    log("server", "  If the iPad still can't reach this, check Windows Firewall: the first time this runs,");
    log("server", "  Windows may prompt 'Windows Defender Firewall has blocked some features of node.js' —");
    log("server", "  make sure 'Private networks' is checked and click Allow. If that prompt was dismissed");
    log("server", "  or missed, add an inbound rule manually for this port (see README).");
    log("server", "  Live diagnostics: Settings -> Devices -> Diagnostics tab in Sanky POS.");
  });

http
  .createServer((req, res) => {
    handleRequest(req, res).catch(onError(res));
  })
  .listen(HTTP_PORT, BIND_HOST, () => {
    log("server", `  HTTP (fallback): listening on ${BIND_HOST}:${HTTP_PORT} (all network interfaces)`);
  });

// Advertises this server on the LAN via mDNS/Bonjour so the POS can find it
// as "sanky-device.local" instead of the owner ever typing an IP address —
// the same discovery mechanism AirPrint printers and AirPlay speakers use.
// Errors here (e.g. multicast blocked by the router/AP) are caught and
// logged, never fatal — direct IP/port entry in the Devices page's Advanced
// section still works as a fallback if mDNS isn't available on this network.
const bonjour = new Bonjour(undefined, (err) => {
  log("error", `mDNS error: ${err.message}`);
});

let bonjourService = null;
try {
  bonjourService = bonjour.publish({
    name: SERVER_FRIENDLY_NAME,
    host: MDNS_HOSTNAME,
    type: "sanky-device",
    protocol: "tcp",
    port: HTTPS_PORT,
    // The port is already carried by the SRV record (the `port` field
    // above) per the DNS-SD spec — that's the canonical place a real
    // Bonjour-aware client reads it from. It's duplicated into the TXT
    // record too so it's trivially human-readable with any generic mDNS
    // browser (e.g. `dns-sd -L`, `avahi-browse -r`) for debugging, even
    // though Safari itself can query neither record type directly (see
    // README — that's why the POS still connects via a fixed known port
    // rather than parsing this out of a live query).
    txt: { version: SERVER_VERSION, https: "true", port: String(HTTPS_PORT) },
  });
  log("server", `mDNS: advertising as ${MDNS_HOSTNAME} (service _sanky-device._tcp) on port ${HTTPS_PORT}`);
  log("server", "  The POS can now find this server automatically via Devices -> Find Device Server —");
  log("server", "  no IP address needed. If discovery doesn't find it, the network may be blocking");
  log("server", "  multicast traffic (some routers/guest networks do) — see README.");
} catch (err) {
  log("error", `mDNS advertisement failed to start: ${err.message}`);
}

function shutdown() {
  log("server", "Shutting down...");
  const done = () => process.exit(0);
  if (bonjourService) {
    bonjour.unpublishAll(done);
  } else {
    done();
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
