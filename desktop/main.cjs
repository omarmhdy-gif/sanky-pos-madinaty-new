const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const APP_ID = "com.sanky.pos";
const SERVER_PORT = 41737;
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const STATIC_ROOT = path.join(app.getAppPath(), "out");
const POS_ROUTES = new Set(["/", "/login", "/login/", "/branch-select", "/branch-select/", "/pos", "/pos/"]);
const MIME_TYPES = {
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
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

let staticServer;
let downloadedUpdateVersion = null;

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
    let filePath = path.resolve(STATIC_ROOT, relativePath);
    if (!filePath.startsWith(STATIC_ROOT + path.sep) && filePath !== STATIC_ROOT) {
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
        "Cache-Control": path.extname(filePath) === ".html" ? "no-store" : "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(contents);
    });
  });
}

async function startStaticServer() {
  if (!fs.existsSync(path.join(STATIC_ROOT, "pos", "index.html"))) {
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
app.setPath("userData", path.join(app.getPath("appData"), "SankyPOS"));

app.whenReady().then(async () => {
  try {
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
