"use strict";
// Removes the Windows Service installed by install-service.js. Also needs
// to be run as Administrator. Does not touch .certs/ or any settings — the
// certificate and configuration survive, so reinstalling the service later
// (npm run install-service) picks up exactly where it left off.
const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "SankyPrinterServer",
  script: path.join(__dirname, "server.js"),
});

svc.on("uninstall", () => {
  console.log("Service uninstalled. The printer-server no longer starts automatically with Windows.");
  console.log("You can still run it manually any time with: npm start");
});

svc.on("error", (err) => {
  console.error("Service uninstall error:", err);
  process.exitCode = 1;
});

svc.uninstall();
