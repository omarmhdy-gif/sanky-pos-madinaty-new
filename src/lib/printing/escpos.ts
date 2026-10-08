import type { Order, ShopSettings, Shift } from "@/lib/types";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { bilingual } from "@/lib/i18n";
import { externalPaymentLabel } from "@/lib/externalPayment";

/** Printed/human label for a payment method — "talabat" specifically needs
 * this rather than the raw stored string, per explicit requirement (the
 * on-screen ReceiptView gets the same effect for free via CSS
 * `capitalize`, but ESC/POS text has no such thing — it's raw bytes).
 * `externalName` is the branch's configured display name (Talabat by
 * default) — the stored payment.method value itself never changes. */
function paymentMethodLabel(order: Order, settings: ShopSettings, locale: "en" | "ar"): string {
  const method = order.payment.method;
  if (method === "talabat") return externalPaymentLabel(order.payment, settings, locale);
  if (method === "waste") return "Waste";
  return method.charAt(0).toUpperCase() + method.slice(1);
}

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;

/**
 * Encodes text as single-byte, printable-ASCII-safe bytes for a standard
 * ESC/POS code page (PC437/USA). This is the actual fix for receipts coming
 * out as garbled "Chinese/Japanese" characters: `TextEncoder().encode()`
 * produces UTF-8, which is *multi-byte* for anything outside ASCII (e.g.
 * Arabic branch/product names) — an ESC/POS printer interprets every byte
 * as one single-byte glyph from its active code page, so those multi-byte
 * UTF-8 sequences render as garbage double-byte-looking glyphs. Thermal
 * ESC/POS printers also generally have no Arabic code page at all, so
 * there's no safe way to print Arabic text as real glyphs here — anything
 * outside printable ASCII is replaced with '?' rather than risk corrupting
 * the rest of the receipt. `\n`/`\r` pass through untouched as real control
 * bytes (line breaks), not filtered as "non-ASCII".
 */
function textBytes(s: string): number[] {
  const bytes: number[] = [];
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code === 0x0a || code === 0x0d) {
      bytes.push(code);
    } else if (code >= 0x20 && code <= 0x7e) {
      bytes.push(code);
    } else {
      bytes.push(0x3f); // '?'
    }
  }
  return bytes;
}

/** Builds a plain-text ESC/POS byte stream for a receipt: init, cancel
 * Kanji/double-byte mode, select code page, centered header, left-aligned
 * body, cut. Real thermal-printer commands, relayed to the printer by the
 * Local Printer Server (see printerServerClient.ts) — browsers can't open a
 * raw TCP socket themselves, which is why that relay exists at all. */
export function buildReceiptBytes(order: Order, settings: ShopSettings, branchName: string, locale: "en" | "ar"): Uint8Array {
  const bytes: number[] = [];
  const line = (s = "") => bytes.push(...textBytes(s + "\n"));
  const center = () => bytes.push(ESC, 0x61, 1);
  const left = () => bytes.push(ESC, 0x61, 0);
  const bold = (on: boolean) => bytes.push(ESC, 0x45, on ? 1 : 0);

  bytes.push(ESC, 0x40); // initialize printer
  bytes.push(FS, 0x2e); // FS . — cancel Kanji/double-byte character mode
  bytes.push(ESC, 0x74, 0); // ESC t 0 — select character code table 0 (PC437: USA, Standard Europe)
  center();
  bold(true);
  line(settings.shopName);
  bold(false);
  if (branchName) line(branchName);
  if (settings.address) line(settings.address);
  if (settings.phone) line(settings.phone);
  line("--------------------------------");
  left();
  line(order.orderNumber ? `Order #${order.orderNumber}` : "Order (pending sync)");
  line(formatDateTime(order.createdAt, locale));
  line(`Cashier: ${order.cashierName}`);
  line("--------------------------------");
  order.lines.forEach((l) => {
    const unit = l.unitPrice + l.modifiers.reduce((s, m) => s + m.priceDelta, 0);
    line(`${l.qty}x ${bilingual(l.name, locale)}`);
    line(`  ${formatMoney(unit, "")} each = ${formatMoney(unit * l.qty, "")}`);
  });
  line("--------------------------------");
  line(`Subtotal: ${formatMoney(order.subtotal, settings.currencySymbol)}`);
  if (order.discountAmount > 0) line(`Discount: -${formatMoney(order.discountAmount, settings.currencySymbol)}`);
  if (order.taxAmount > 0) line(`Tax (${order.taxRate}%): ${formatMoney(order.taxAmount, settings.currencySymbol)}`);
  bold(true);
  line(`Total: ${formatMoney(order.total, settings.currencySymbol)}`);
  bold(false);
  line(`Payment: ${paymentMethodLabel(order, settings, locale)}`);
  if (order.payment.tenderedAmount !== undefined) {
    line(`Cash Received: ${formatMoney(order.payment.tenderedAmount, settings.currencySymbol)}`);
  }
  if (order.payment.changeDue !== undefined && order.payment.changeDue > 0) {
    line(`Change: ${formatMoney(order.payment.changeDue, settings.currencySymbol)}`);
  }
  if (order.payment.method === "waste" && order.wasteReason) {
    line(`Waste Reason: ${order.wasteReason}`);
  }
  if (settings.receiptFooter) {
    line("--------------------------------");
    center();
    line(bilingual(settings.receiptFooter, locale));
  }
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(GS, 0x56, 1); // partial cut

  return new Uint8Array(bytes);
}

/** Builds a plain-text ESC/POS byte stream for a closed shift's report —
 * same init/code-page/cut structure as buildReceiptBytes above, so it goes
 * through the exact same Local Printer Server / cash-drawer-less pipeline. */
export function buildShiftReportBytes(shift: Shift, settings: ShopSettings, branchName: string, locale: "en" | "ar"): Uint8Array {
  const bytes: number[] = [];
  const line = (s = "") => bytes.push(...textBytes(s + "\n"));
  const center = () => bytes.push(ESC, 0x61, 1);
  const left = () => bytes.push(ESC, 0x61, 0);
  const bold = (on: boolean) => bytes.push(ESC, 0x45, on ? 1 : 0);
  const externalName = locale === "ar" ? "المدفوعات الخارجية" : "External payments";

  bytes.push(ESC, 0x40); // initialize printer
  bytes.push(FS, 0x2e); // FS . — cancel Kanji/double-byte character mode
  bytes.push(ESC, 0x74, 0); // ESC t 0 — select character code table 0 (PC437: USA, Standard Europe)
  center();
  bold(true);
  line(settings.shopName);
  bold(false);
  if (branchName) line(branchName);
  line("SHIFT REPORT");
  line("--------------------------------");
  left();
  line(`Cashier: ${shift.cashierName}`);
  line(`Start: ${formatDateTime(shift.startedAt, locale)}`);
  line(`End: ${shift.closedAt ? formatDateTime(shift.closedAt, locale) : "-"}`);
  line(`Orders: ${shift.ordersCount ?? 0}`);
  line("--------------------------------");
  line(`Cash Sales: ${formatMoney(shift.cashSales ?? 0, settings.currencySymbol)}`);
  line(`Card Sales: ${formatMoney(shift.cardSales ?? 0, settings.currencySymbol)}`);
  line("--------------------------------");
  line(`Opening Cash: ${formatMoney(shift.openingCash, settings.currencySymbol)}`);
  line(`Expected Cash: ${formatMoney(shift.expectedCash ?? 0, settings.currencySymbol)}`);
  line(`Actual Cash: ${formatMoney(shift.actualCash ?? 0, settings.currencySymbol)}`);
  bold(true);
  line(`Difference: ${formatMoney(shift.difference ?? 0, settings.currencySymbol)}`);
  bold(false);
  // The external-marketplace payment method (Talabat by default) is
  // deliberately excluded from every total above (Orders/Cash Sales/Card
  // Sales/Expected Cash), and printed here as its own separate section
  // instead, per explicit requirement.
  line("--------------------------------");
  center();
  bold(true);
  line(externalName.toUpperCase());
  bold(false);
  left();
  line(`Orders: ${shift.talabatOrdersCount ?? 0}`);
  line(`Revenue: ${formatMoney(shift.talabatRevenue ?? 0, settings.currencySymbol)}`);
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(GS, 0x56, 1); // partial cut

  return new Uint8Array(bytes);
}

/** Standard ESC/POS cash-drawer "kick" pulse (pin 2, ~25ms on / ~250ms off). */
export function buildDrawerKickBytes(): Uint8Array {
  return new Uint8Array([ESC, 0x70, 0, 25, 250]);
}
