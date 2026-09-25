"use client";

import type { Order } from "@/lib/types";
import { useI18n, bilingual } from "@/lib/i18n";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useDeviceSettingsStore } from "@/lib/store/useDeviceSettingsStore";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { externalPaymentName } from "@/lib/externalPayment";

export function ReceiptView({ order }: { order: Order }) {
  const { t, locale } = useI18n();
  const settings = useDataStore((s) => s.settings);
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const paperWidth = useDeviceSettingsStore((s) => s.paperWidth);

  const branchName = bilingual(
    branches.find((b) => b.id === currentBranchId)?.name ?? { en: "", ar: "" },
    locale
  );

  return (
    <div
      id="receipt-print"
      className="mx-auto font-mono text-xs text-foreground"
      style={{ width: paperWidth === "58" ? "58mm" : "80mm", maxWidth: "100%" }}
    >
      <div className="text-center">
        <p className="text-sm font-bold">{settings.shopName}</p>
        {branchName && <p className="text-[10px] text-muted-foreground">{branchName}</p>}
        {settings.address && <p className="text-[10px] text-muted-foreground">{settings.address}</p>}
        {settings.phone && <p className="text-[10px] text-muted-foreground">{settings.phone}</p>}
      </div>
      <div className="my-2 border-t border-dashed border-border" />
      <div className="flex justify-between">
        <span>{t.pos.orderNumber}</span>
        <span className="font-semibold">{order.orderNumber ? `#${order.orderNumber}` : t.pos.pendingSyncLabel}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>{formatDateTime(order.createdAt, locale)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>{order.cashierName}</span>
      </div>
      <div className="my-2 border-t border-dashed border-border" />
      <div className="space-y-1">
        {order.lines.map((line) => {
          const unitPrice = line.unitPrice + line.modifiers.reduce((s, m) => s + m.priceDelta, 0);
          return (
            <div key={line.lineId} className="flex justify-between gap-2">
              <span className="flex-1">
                {line.qty}x {bilingual(line.name, locale)}
                {line.modifiers.length > 0 && (
                  <span className="block text-[10px] text-muted-foreground">
                    {line.modifiers.map((m) => bilingual(m.name, locale)).join(", ")}
                  </span>
                )}
                {line.qty > 1 && (
                  <span className="block text-[10px] text-muted-foreground">
                    {formatMoney(unitPrice, "")} {t.pos.each}
                  </span>
                )}
              </span>
              <span>{formatMoney(unitPrice * line.qty, "")}</span>
            </div>
          );
        })}
      </div>
      <div className="my-2 border-t border-dashed border-border" />
      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>{t.common.subtotal}</span>
          <span>{formatMoney(order.subtotal, "")}</span>
        </div>
        {order.discountAmount > 0 && (
          <div className="flex justify-between">
            <span>{t.common.discount}</span>
            <span>-{formatMoney(order.discountAmount, "")}</span>
          </div>
        )}
        {order.taxAmount > 0 && (
          <div className="flex justify-between">
            <span>
              {t.common.tax} ({order.taxRate}%)
            </span>
            <span>{formatMoney(order.taxAmount, "")}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold">
          <span>{t.common.total}</span>
          <span>{formatMoney(order.total, settings.currencySymbol)}</span>
        </div>
      </div>
      <div className="my-2 border-t border-dashed border-border" />
      <div className="flex justify-between capitalize">
        <span>{t.pos.payment}</span>
        <span>
          {order.payment.method === "talabat" ? bilingual(externalPaymentName(settings), locale) : order.payment.method}
        </span>
      </div>
      {order.payment.tenderedAmount !== undefined && (
        <div className="flex justify-between">
          <span>{t.pos.amountTendered}</span>
          <span>{formatMoney(order.payment.tenderedAmount, "")}</span>
        </div>
      )}
      {order.payment.changeDue !== undefined && order.payment.changeDue > 0 && (
        <div className="flex justify-between">
          <span>{t.pos.changeDue}</span>
          <span>{formatMoney(order.payment.changeDue, "")}</span>
        </div>
      )}
      {order.payment.method === "waste" && order.wasteReason && (
        <div className="flex justify-between gap-2">
          <span>{t.pos.wasteReason}</span>
          <span className="text-end">{order.wasteReason}</span>
        </div>
      )}
      {settings.receiptFooter && (
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          {bilingual(settings.receiptFooter, locale)}
        </p>
      )}
    </div>
  );
}
