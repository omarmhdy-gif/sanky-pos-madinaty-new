const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const { createHash } = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const APP_ID = "com.sanky.pos";
const USER_DATA_ROOT = path.join(app.getPath("appData"), "SankyPOS");
app.setPath("userData", USER_DATA_ROOT);
const SERVER_PORT = 41737;
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const PRODUCTION_ORIGIN = "https://sanky-pos-madinaty-new.vercel.app";
const BUNDLED_STATIC_ROOT = path.join(app.getAppPath(), "out");
const RENDERER_ROOT = path.join(USER_DATA_ROOT, "renderers");
const RENDERER_POINTER = path.join(USER_DATA_ROOT, "renderer-current.json");
const MAX_RENDERER_FILES = 15000;
const MAX_RENDERER_FILE_BYTES = 200 * 1024 * 1024;
const MAX_RENDERER_TOTAL_BYTES = 1024 * 1024 * 1024;
const POS_ROUTES = new Set(["/", "/login", "/login/", "/branch-select", "/branch-select/", "/pos", "/pos/"]);
const MIME_TYPES = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

let staticServer;
let activeStaticRoot = BUNDLED_STATIC_ROOT;
let activeRendererVersion = null;
let downloadedUpdateVersion = null;

function isSafeRendererPath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.includes("\\") || relativePath.startsWith("/")) return false;
  const segments = relativePath.split("/");
  if (segments.some((part) => !part || part === "." || part === "..")) return false;
  return true;
}

function validateRendererManifest(manifest) {
  if (!manifest || manifest.schema !== 1 || !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > MAX_RENDERER_FILES) {
    throw new Error("The website returned an unsupported renderer manifest.");
  }
  let totalBytes = 0;
  const seen = new Set();
  for (const file of manifest.files) {
    if (!isSafeRendererPath(file?.path) || seen.has(file.path)) throw new Error("The website renderer manifest contains an invalid path.");
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_RENDERER_FILE_BYTES || !/^[a-f\d]{64}$/i.test(file.sha256 || "")) {
      throw new Error("The website renderer manifest contains invalid file metadata.");
    }
    seen.add(file.path);
    totalBytes += file.size;
    if (totalBytes > MAX_RENDERER_TOTAL_BYTES) throw new Error("The website renderer update is larger than the supported limit.");
  }
  if (!seen.has("pos/index.html") || !seen.has("login/index.html") || !seen.has("branch-select/index.html")) {
    throw new Error("The website renderer manifest is missing a cashier entry page.");
  }
  const version = createHash("sha256").update(JSON.stringify(manifest.files)).digest("hex");
  if (manifest.version !== version) throw new Error("The website renderer manifest version does not match its file list.");
  return { version, totalBytes };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

async function rendererDirectoryIsComplete(directory, manifest) {
  try {
    const saved = JSON.parse(await fs.promises.readFile(path.join(directory, "renderer-manifest.json"), "utf8"));
    if (saved.version !== manifest.version) return false;
    for (const entry of manifest.files) {
      const filePath = path.resolve(directory, entry.path);
      if (!filePath.startsWith(directory + path.sep)) return false;
      const fileStat = await fs.promises.stat(filePath);
      if (!fileStat.isFile() || fileStat.size !== entry.size || await hashFile(filePath) !== entry.sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function activateRenderer(version, directory) {
  const pointer = { version, appVersion: app.getVersion() };
  const temporaryPointer = `${RENDERER_POINTER}.${process.pid}.tmp`;
  await fs.promises.mkdir(path.dirname(RENDERER_POINTER), { recursive: true });
  await fs.promises.writeFile(temporaryPointer, JSON.stringify(pointer), "utf8");
  await fs.promises.rename(temporaryPointer, RENDERER_POINTER);
  activeStaticRoot = directory;
  activeRendererVersion = version;
}

async function loadRendererRoot() {
  const bundledManifestPath = path.join(BUNDLED_STATIC_ROOT, "renderer-manifest.json");
  try {
    const bundledManifest = JSON.parse(await fs.promises.readFile(bundledManifestPath, "utf8"));
    if (typeof bundledManifest.version === "string") activeRendererVersion = bundledManifest.version;
  } catch {
    // Older or development builds can continue from their packaged export.
  }
  try {
    const pointer = JSON.parse(await fs.promises.readFile(RENDERER_POINTER, "utf8"));
    if (pointer.appVersion !== app.getVersion() || !/^[a-f\d]{64}$/i.test(pointer.version || "")) return;
    const directory = path.resolve(RENDERER_ROOT, `release-${pointer.version}`);
    if (!directory.startsWith(RENDERER_ROOT + path.sep) || !fs.existsSync(path.join(directory, "pos", "index.html"))) return;
    activeStaticRoot = directory;
    activeRendererVersion = pointer.version;
  } catch {
    // A missing pointer means the packaged website is the offline fallback.
  }
}

async function syncRenderer() {
  if (!app.isPackaged || process.platform !== "win32") return { status: "unsupported" };
  const response = await fetch(`${PRODUCTION_ORIGIN}/renderer-manifest.json`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!response.ok) throw new Error(`Could not retrieve the website renderer manifest (HTTP ${response.status}).`);
  const manifest = await response.json();
  const { version } = validateRendererManifest(manifest);
  if (version === activeRendererVersion) return { status: "current", version };

  const rendererDirectory = path.join(RENDERER_ROOT, `release-${version}`);
  if (!await rendererDirectoryIsComplete(rendererDirectory, manifest)) {
    const stagingDirectory = path.join(RENDERER_ROOT, `staging-${version}-${process.pid}`);
    await fs.promises.mkdir(RENDERER_ROOT, { recursive: true });
    await fs.promises.rm(stagingDirectory, { recursive: true, force: true });
    await fs.promises.mkdir(stagingDirectory, { recursive: true });
    try {
      let completedBytes = 0;
      for (const entry of manifest.files) {
        const segments = entry.path.split("/").map((part) => encodeURIComponent(part));
        const fileResponse = await fetch(`${PRODUCTION_ORIGIN}/${segments.join("/")}`, { signal: AbortSignal.timeout(60000), cache: "no-store" });
        if (!fileResponse.ok) throw new Error(`Could not download website renderer file ${entry.path} (HTTP ${fileResponse.status}).`);
        const bytes = Buffer.from(await fileResponse.arrayBuffer());
        if (bytes.length !== entry.size || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
          throw new Error(`Website renderer file verification failed for ${entry.path}.`);
        }
        completedBytes += bytes.length;
        if (completedBytes > MAX_RENDERER_TOTAL_BYTES) throw new Error("The website renderer update is larger than the supported limit.");
        const destination = path.resolve(stagingDirectory, entry.path);
        if (!destination.startsWith(stagingDirectory + path.sep)) throw new Error("The website renderer manifest contains an invalid path.");
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        await fs.promises.writeFile(destination, bytes);
      }
      await fs.promises.writeFile(path.join(stagingDirectory, "renderer-manifest.json"), JSON.stringify(manifest), "utf8");
      await fs.promises.rm(rendererDirectory, { recursive: true, force: true });
      await fs.promises.rename(stagingDirectory, rendererDirectory);
    } catch (error) {
      await fs.promises.rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  return { status: "staged", version };
}

async function applyStagedRenderer(version) {
  if (!app.isPackaged || process.platform !== "win32") return { status: "unsupported" };
  if (typeof version !== "string" || !/^[a-f\d]{64}$/i.test(version)) throw new Error("Invalid website renderer version.");
  if (version === activeRendererVersion) return { status: "current", version };
  const directory = path.resolve(RENDERER_ROOT, `release-${version}`);
  if (!directory.startsWith(RENDERER_ROOT + path.sep)) throw new Error("Invalid website renderer path.");
  const manifest = JSON.parse(await fs.promises.readFile(path.join(directory, "renderer-manifest.json"), "utf8"));
  const validated = validateRendererManifest(manifest);
  if (validated.version !== version || !await rendererDirectoryIsComplete(directory, manifest)) {
    throw new Error("The staged website renderer is incomplete.");
  }
  await activateRenderer(version, directory);
  return { status: "updated", version };
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.on("download-progress", (progress) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("sanky:app:update-progress", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  }
});
autoUpdater.on("update-downloaded", (info) => {
  downloadedUpdateVersion = info.version;
});

ipcMain.handle("sanky:app:check-update", async () => {
  if (!app.isPackaged || process.platform !== "win32") {
    return { status: "unsupported", currentVersion: app.getVersion() };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) {
      return { status: "current", currentVersion: app.getVersion() };
    }
    return { status: "available", currentVersion: app.getVersion(), version: result.updateInfo.version };
  } catch (error) {
    return { status: "unavailable", currentVersion: app.getVersion(), message: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("sanky:app:download-update", async () => {
  if (!app.isPackaged || process.platform !== "win32") throw new Error("App updates are only available in the installed Windows app.");
  await autoUpdater.downloadUpdate();
  return { status: "downloaded", version: downloadedUpdateVersion };
});

ipcMain.handle("sanky:app:install-update", () => {
  if (!downloadedUpdateVersion) throw new Error("Download the update before installing it.");
  autoUpdater.quitAndInstall(false, true);
  return { status: "installing", version: downloadedUpdateVersion };
});

ipcMain.handle("sanky:renderer:sync", async () => {
  try {
    return await syncRenderer();
  } catch (error) {
    console.error("Website renderer sync failed:", error);
    return { status: "unavailable", message: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("sanky:renderer:apply", async (_event, version) => {
  try {
    return await applyStagedRenderer(version);
  } catch (error) {
    console.error("Website renderer activation failed:", error);
    return { status: "unavailable", message: error instanceof Error ? error.message : String(error) };
  }
});

function validHexPayload(hex) {
  return typeof hex === "string" && hex.length > 0 && hex.length % 2 === 0 && hex.length <= 2_000_000 && /^[\da-f]+$/i.test(hex);
}

async function listUsbPrinters() {
  if (process.platform !== "win32") return [];
  const command = "Get-Printer | Select-Object Name,PortName,DriverName | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 });
  const rows = JSON.parse(stdout || "[]");
  return (Array.isArray(rows) ? rows : [rows])
    .filter((printer) => printer?.Name && /^USB/i.test(printer.PortName || ""))
    .map((printer) => ({ name: printer.Name, portName: printer.PortName, driverName: printer.DriverName || "" }));
}

function testTcpPrinter(ip, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port });
    const finish = (online) => { socket.destroy(); resolve(online); };
    socket.setTimeout(1500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function scanNetworkPrinters(port = 9100) {
  const candidates = new Set();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const item of entries ?? []) {
      if (item.family !== "IPv4" || item.internal) continue;
      const parts = item.address.split(".");
      if (parts.length !== 4) continue;
      for (let host = 1; host <= 254; host++) candidates.add(`${parts[0]}.${parts[1]}.${parts[2]}.${host}`);
    }
  }
  const queue = [...candidates];
  const found = [];
  const workers = Array.from({ length: 32 }, async () => {
    while (queue.length) {
      const ip = queue.shift();
      if (ip && await testTcpPrinter(ip, port)) found.push({ ip, port });
    }
  });
  await Promise.all(workers);
  return found;
}

async function printRawToUsb(printerName, bytes) {
  const printers = await listUsbPrinters();
  if (!printers.some((printer) => printer.name === printerName)) throw new Error("USB printer is not connected or installed in Windows.");
  const filePath = path.join(app.getPath("temp"), `sanky-desktop-print-${process.pid}-${Date.now()}.bin`);
  await fs.promises.writeFile(filePath, bytes);
  const source = String.raw`
using System;
using System.Runtime.InteropServices;
public static class SankyUsbPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DOC_INFO_1 { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr handle, int level, ref DOC_INFO_1 info);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  public static void Send(string name, byte[] bytes) {
    IntPtr handle; if (!OpenPrinter(name, out handle, IntPtr.Zero)) throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    try { var info = new DOC_INFO_1 { pDocName="Sanky POS Receipt", pOutputFile=null, pDataType="RAW" }; if (StartDocPrinter(handle, 1, ref info) == 0) throw new Exception("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
      try { if (!StartPagePrinter(handle)) throw new Exception("StartPagePrinter failed: " + Marshal.GetLastWin32Error()); int written; if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length) throw new Exception("WritePrinter failed: " + Marshal.GetLastWin32Error()); EndPagePrinter(handle); }
      finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }
}`;
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `Add-Type -TypeDefinition @'\n${source}\n'@; [SankyUsbPrinter]::Send($env:SANKY_USB_NAME, [IO.File]::ReadAllBytes($env:SANKY_USB_FILE))`], {
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, SANKY_USB_NAME: printerName, SANKY_USB_FILE: filePath },
    });
  } finally {
    await fs.promises.unlink(filePath).catch(() => {});
  }
}

ipcMain.handle("sanky:printer:list-usb", () => listUsbPrinters());
ipcMain.handle("sanky:printer:scan-network", (_event, port) => scanNetworkPrinters(Number.isInteger(port) && port > 0 && port < 65536 ? port : 9100));
ipcMain.handle("sanky:printer:test-network", (_event, ip, port) => {
  if (typeof ip !== "string" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Enter a valid printer IP address and port.");
  return testTcpPrinter(ip, port);
});
ipcMain.handle("sanky:printer:print", async (_event, config) => {
  if (!config || !validHexPayload(config.dataHex)) throw new Error("Invalid printer data.");
  const bytes = Buffer.from(config.dataHex, "hex");
  if (config.connectionType === "usb") return printRawToUsb(String(config.usbPrinterName || ""), bytes);
  if (typeof config.ip !== "string" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(config.ip) || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("Enter a valid printer IP address and port.");
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.ip, port: config.port });
    socket.setTimeout(8000, () => socket.destroy(new Error("Printer connection timed out.")));
    socket.once("error", reject);
    socket.once("connect", () => socket.end(bytes, resolve));
  });
});

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, ORIGIN).pathname);
  if (pathname === "/" || POS_ROUTES.has(pathname)) return pathname;
  if (pathname.startsWith("/_next/") || pathname.startsWith("/images/") || pathname === "/favicon.ico") return pathname;
  // Public menu/product images are static assets. They cannot navigate the app.
  if (path.extname(pathname)) return pathname;
  return null;
}

function createStaticServer() {
  return http.createServer((request, response) => {
    let pathname;
    try {
      pathname = resolveRequestPath(request.url ?? "/");
    } catch {
      response.writeHead(400).end("Invalid request");
      return;
    }

    if (!pathname) {
      response.writeHead(404).end("This Windows copy only includes the POS module.");
      return;
    }

    if (pathname === "/") {
      response.writeHead(302, { Location: "/login/" }).end();
      return;
    }

    const relativePath = pathname.replace(/^\/+/, "");
    let filePath = path.resolve(activeStaticRoot, relativePath);
    if (!filePath.startsWith(activeStaticRoot + path.sep) && filePath !== activeStaticRoot) {
      response.writeHead(400).end("Invalid path");
      return;
    }

    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      } else if (!path.extname(filePath) && POS_ROUTES.has(pathname)) {
        filePath = path.join(filePath, "index.html");
      }
    } catch {
      response.writeHead(404).end("Not found");
      return;
    }

    fs.readFile(filePath, (error, contents) => {
      if (error) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(contents);
    });
  });
}

async function startStaticServer() {
  if (!fs.existsSync(path.join(activeStaticRoot, "pos", "index.html"))) {
    throw new Error("The POS website files are missing. Rebuild the app before packaging it.");
  }
  staticServer = createStaticServer();
  await new Promise((resolve, reject) => {
    staticServer.once("error", reject);
    staticServer.listen(SERVER_PORT, "127.0.0.1", resolve);
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    kiosk: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, navigationUrl) => {
    let parsed;
    try {
      parsed = new URL(navigationUrl);
    } catch {
      event.preventDefault();
      return;
    }
    if (parsed.origin !== ORIGIN || !POS_ROUTES.has(parsed.pathname)) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  window.loadURL(`${ORIGIN}/login/`);
}

app.setAppUserModelId(APP_ID);

app.whenReady().then(async () => {
  try {
    await loadRendererRoot();
    await startStaticServer();
    createWindow();
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "Sanky POS",
      message: "The POS app could not start.",
      detail: error instanceof Error ? error.message : String(error),
    });
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => staticServer?.close());
