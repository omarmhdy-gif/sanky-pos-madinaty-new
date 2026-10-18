export {};

declare global {
  interface Window {
    sankyDesktop?: {
      isDesktop: boolean;
      appName: string;
      updater: {
        check: () => Promise<{ status: "unsupported" | "current" | "available" | "unavailable"; currentVersion: string; version?: string; message?: string }>;
        download: () => Promise<{ status: "downloaded"; version: string | null }>;
        install: () => Promise<{ status: "installing"; version: string }>;
        onProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
      };
      printer: {
        listUsb: () => Promise<{ name: string; portName: string; driverName: string }[]>;
        scanNetwork: (port?: number) => Promise<{ ip: string; port: number }[]>;
        testNetwork: (ip: string, port: number) => Promise<boolean>;
        print: (config: {
          connectionType: "network" | "usb";
          ip?: string;
          port?: number;
          usbPrinterName?: string;
          dataHex: string;
        }) => Promise<void>;
      };
    };
  }
}
