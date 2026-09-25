"use strict";
// Installs the Sanky Printer Server as a real Windows Service, so it:
//   - starts automatically when Windows boots (before anyone logs in)
//   - restarts itself automatically if it ever crashes
//   - runs with no visible terminal window and no need to keep this
//     folder, VS Code, or a command prompt open
//
// MUST be run from an elevated (Administrator) terminal — installing a
// Windows Service is an OS-level operation that plain user permissions
// can't do. Right-click PowerShell/cmd -> "Run as administrator", cd into
// this folder, then: npm run install-service
//
// This only needs to be done once, ever. After this, the server survives
// reboots, power cuts, and crashes with zero manual intervention.
const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "SankyPrinterServer",
  description:
    "Sanky POS Local Printer Server — relays print jobs from the POS to the EPSON receipt printer and cash drawer. Starts automatically with Windows.",
  script: path.join(__dirname, "server.js"),
  // node-windows wraps the script in its own watchdog process that
  // restarts it on a crash; these tune how persistent that is (don't give
  // up after a handful of failures — a printer-server that silently stops
  // retrying after a bad patch of Wi-Fi is exactly what this is supposed
  // to prevent).
  maxRestarts: 60,
  maxRetries: 60,
  wait: 2,
  grow: 0.25,
});

svc.on("invalidinstallation", () => {
  console.error("This doesn't look like a valid install — check server.js exists in this folder.");
  process.exitCode = 1;
});

svc.on("alreadyinstalled", () => {
  console.log("Already installed as a Windows Service. Use 'npm run uninstall-service' first if you need to reinstall it.");
});

svc.on("install", () => {
  console.log("Service installed. Starting it now...");
  svc.start();
});

svc.on("start", () => {
  console.log("");
  console.log("Sanky Printer Server is now running as a Windows Service:");
  console.log("  - Starts automatically every time this PC boots, before any login.");
  console.log("  - Restarts itself automatically if it ever crashes.");
  console.log("  - Runs with no visible window — you never need to open a terminal again.");
  console.log("");
  console.log("Check it any time via Windows: Start -> \"Services\" -> \"Sanky Printer Server\".");
  console.log("To remove it later: npm run uninstall-service (also as Administrator).");
});

svc.on("error", (err) => {
  console.error("Service install error:", err);
  process.exitCode = 1;
});

svc.install();
