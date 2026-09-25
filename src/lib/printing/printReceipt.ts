import type { Order, Shift, ShopSettings } from "@/lib/types";
import { buildReceiptBytes, buildDrawerKickBytes, buildShiftReportBytes } from "@/lib/printing/escpos";
import { sendRawToPrinter, PrinterConnectionError, bytesToHex } from "@/lib/printing/printerServerClient";
import { useDeviceSettingsStore } from "@/lib/store/useDeviceSettingsStore";
import { usePrintQueueStore } from "@/lib/store/usePrintQueueStore";
import { useSystemStatusStore } from "@/lib/store/useSystemStatusStore";
import { useSystemLogStore } from "@/lib/store/useSystemLogStore";

/**
 * Prints a completed order's receipt through the Local Printer Server (see
 * printer-server/ and printerServerClient.ts) — not window.print(). This
 * is a plain fetch() call, so it isn't subject to Safari's restriction on
 * programmatic printing; it works the same whether triggered automatically
 * right after payment or by a manual "Print Receipt" tap.
 *
 * "Never lose a receipt": on failure, the exact bytes are queued (see
 * usePrintQueueStore) so the background monitor retries automatically once
 * the printer/Device Server come back, and the owner can see/reprint it
 * manually from Devices → Queued Receipts. Still throws afterward —
 * callers show their own toast, this doesn't change that contract, it just
 * adds queueing as a side effect. Pass `skipQueue: true` for diagnostic
 * prints (Test Print) that aren't real receipts and shouldn't be retried.
 */
export async function printOrderReceipt(opts: {
  order: Order;
  settings: ShopSettings;
  branchName: string;
  locale: "en" | "ar";
  openDrawer: boolean;
  skipQueue?: boolean;
}): Promise<void> {
  const device = useDeviceSettingsStore.getState();
  if (!device.printServerHost || !device.printerIp) {
    throw new PrinterConnectionError("Printer not configured yet — set it up in Settings → Devices.");
  }

  const receiptBytes = buildReceiptBytes(opts.order, opts.settings, opts.branchName, opts.locale);
  const drawerBytes = opts.openDrawer ? buildDrawerKickBytes() : new Uint8Array();
  const combined = new Uint8Array(receiptBytes.length + drawerBytes.length);
  combined.set(receiptBytes, 0);
  combined.set(drawerBytes, receiptBytes.length);

  try {
    await sendRawToPrinter(
      { host: device.printServerHost, port: device.printServerPort },
      { ip: device.printerIp, port: device.printerPort },
      combined
    );
    useSystemStatusStore.getState().set({ lastPrintAt: new Date().toISOString(), lastPrintError: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach the printer.";
    useSystemStatusStore.getState().set({ lastPrintError: message });
    if (!opts.skipQueue) {
      usePrintQueueStore.getState().enqueue({
        label: `Order #${opts.order.orderNumber || opts.order.id.slice(0, 8)}`,
        dataHex: bytesToHex(combined),
        printerIp: device.printerIp,
        printerPort: device.printerPort,
      });
      useSystemLogStore.getState().log(`Receipt queued for retry: Order #${opts.order.orderNumber} (${message})`, "warning");
    }
    throw err;
  }
}

/**
 * Prints a closed shift's report through the exact same Local Printer
 * Server pipeline as printOrderReceipt() above — same device config, same
 * sendRawToPrinter() call, same failure -> print-queue fallback, same
 * status/log side effects. Never a drawer kick (a shift report isn't a
 * cash transaction). Callers must not let a failure here affect shift
 * state — closing the shift and printing its report are independent
 * actions; this function only throws so the caller can show a toast.
 */
export async function printShiftReport(opts: {
  shift: Shift;
  settings: ShopSettings;
  branchName: string;
  locale: "en" | "ar";
  skipQueue?: boolean;
}): Promise<void> {
  const device = useDeviceSettingsStore.getState();
  if (!device.printServerHost || !device.printerIp) {
    throw new PrinterConnectionError("Printer not configured yet — set it up in Settings → Devices.");
  }

  const reportBytes = buildShiftReportBytes(opts.shift, opts.settings, opts.branchName, opts.locale);

  try {
    await sendRawToPrinter(
      { host: device.printServerHost, port: device.printServerPort },
      { ip: device.printerIp, port: device.printerPort },
      reportBytes
    );
    useSystemStatusStore.getState().set({ lastPrintAt: new Date().toISOString(), lastPrintError: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach the printer.";
    useSystemStatusStore.getState().set({ lastPrintError: message });
    if (!opts.skipQueue) {
      usePrintQueueStore.getState().enqueue({
        label: `Shift Report — ${opts.shift.cashierName} (${opts.shift.closedAt ? new Date(opts.shift.closedAt).toLocaleString() : ""})`,
        dataHex: bytesToHex(reportBytes),
        printerIp: device.printerIp,
        printerPort: device.printerPort,
      });
      useSystemLogStore.getState().log(`Shift report queued for retry: ${opts.shift.cashierName} (${message})`, "warning");
    }
    throw err;
  }
}
