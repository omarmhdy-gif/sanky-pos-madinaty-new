const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sankyDesktop", Object.freeze({
  isDesktop: true,
  appName: "Sanky POS",
  updater: Object.freeze({
    check: () => ipcRenderer.invoke("sanky:app:check-update"),
    download: () => ipcRenderer.invoke("sanky:app:download-update"),
    install: () => ipcRenderer.invoke("sanky:app:install-update"),
    onProgress: (callback) => {
      const handler = (_event, progress) => callback(progress);
      ipcRenderer.on("sanky:app:update-progress", handler);
      return () => ipcRenderer.removeListener("sanky:app:update-progress", handler);
    },
  }),
  renderer: Object.freeze({
    sync: () => ipcRenderer.invoke("sanky:renderer:sync"),
    apply: (version) => ipcRenderer.invoke("sanky:renderer:apply", version),
  }),
  printer: Object.freeze({
    listUsb: () => ipcRenderer.invoke("sanky:printer:list-usb"),
    scanNetwork: (port) => ipcRenderer.invoke("sanky:printer:scan-network", port),
    testNetwork: (ip, port) => ipcRenderer.invoke("sanky:printer:test-network", ip, port),
    print: (config) => ipcRenderer.invoke("sanky:printer:print", config),
  }),
}));
