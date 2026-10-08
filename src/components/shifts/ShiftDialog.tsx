"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useOrderQueueStore } from "@/lib/store/useOrderQueueStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { formatMoney, formatNumber, formatDateTime } from "@/lib/utils";
import { shiftSalesSplit, posOrders, talabatOrders } from "@/lib/analytics";
import { externalPaymentName } from "@/lib/externalPayment";
import { printShiftReport } from "@/lib/printing/printReceipt";
import type { Shift } from "@/lib/types";

type Step = "summary" | "closing" | "report";

export function ShiftDialog({
  shift,
  open,
  onOpenChange,
  onFinished,
}: {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFinished?: () => void;
}) {
  const { t, locale } = useI18n();
  const orders = useDataStore((s) => s.orders);
  const settings = useDataStore((s) => s.settings);
  const closeShift = useDataStore((s) => s.closeShift);
  const fetchOrdersForShift = useDataStore((s) => s.fetchOrdersForShift);
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);

  const [step, setStep] = useState<Step>("summary");
  const [actualCash, setActualCash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<Shift | null>(null);
  const [printing, setPrinting] = useState(false);

  const branchName = bilingual(branches.find((b) => b.id === currentBranchId)?.name ?? { en: "", ar: "" }, locale);
  const externalName = bilingual(externalPaymentName(settings), locale);

  // Audit finding: an offline order queued while this shift was open still
  // carries this shift's id in its payload (captured at queue time), but if
  // it hasn't synced yet, close_shift can't see it — the shift's cash_sales/
  // orders_count would be permanently frozen without it once closed, while
  // Dashboard/Reports pick it up later once it syncs. That's the exact
  // "shift report vs real cash" mismatch this was built to catch — blocking
  // the close here (not changing any calculation) is the safe fix.
  const pendingOfflineForShift = useOrderQueueStore(
    (s) => s.queue.filter((q) => q.payload.shiftId === shift?.id).length
  );

  // fetchAll() no longer preloads any order history (see api.ts's fetchAll
  // doc comment) — this shift's own orders are naturally small (one till's
  // sales for one shift), so they're fetched directly here instead. Gated
  // on `open` (not just `shift?.id`, which the Topbar keeps around even
  // while this dialog is closed) so it only fires when the cashier actually
  // opens this dialog, not on every render while a shift happens to be open.
  useEffect(() => {
    if (open && shift?.id) fetchOrdersForShift(shift.id);
  }, [open, shift?.id, fetchOrdersForShift]);

  // Best-effort, non-blocking: printing failure only affects print-queue/
  // toast state, never the shift/report state. Closing the shift has
  // already fully succeeded by the time this is ever called.
  const handlePrint = async (target: Shift) => {
    setPrinting(true);
    try {
      await printShiftReport({ shift: target, settings, branchName, locale });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to print shift report", "error");
    } finally {
      setPrinting(false);
    }
  };

  const shiftOrders = useMemo(
    () => orders.filter((o) => o.shiftId === shift?.id && o.status === "completed"),
    [orders, shift]
  );
  // Live preview before closing — POS-only, exactly matching what
  // close_shift will compute server-side; Talabat is shown in its own
  // separate live line below, never folded into these totals.
  const posShiftOrders = useMemo(() => posOrders(shiftOrders), [shiftOrders]);
  const liveTalabatOrders = useMemo(() => talabatOrders(shiftOrders), [shiftOrders]);
  const live = shiftSalesSplit(shiftOrders);

  const handleClose = (v: boolean) => {
    if (!v) {
      setStep("summary");
      setActualCash("");
      setReport(null);
    }
    onOpenChange(v);
  };

  const handleConfirmClose = async () => {
    if (!shift) return;
    if (pendingOfflineForShift > 0) {
      toast(t.shifts.pendingOfflineOrdersBlock, "error");
      return;
    }
    const parsed = parseFloat(actualCash);
    if (!actualCash || Number.isNaN(parsed) || parsed < 0) {
      toast(t.common.required, "error");
      return;
    }
    setSubmitting(true);
    try {
      const result = await closeShift(shift.id, parsed);
      // The shift is now closed for good — nothing below this line may
      // ever cause it to reopen or roll back. Printing is fired after the
      // report is already showing, and its own errors are caught inside
      // handlePrint so they can never bubble back up into this try/catch.
      setReport(result);
      setStep("report");
      handlePrint(result);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to close shift", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Closing the shift makes it no longer "open," so Topbar's `openShift`
  // (passed in as `shift`) recomputes to null the instant closeShift()
  // resolves — right when we're supposed to be showing the report. Only
  // bail out early if there's truly nothing to show; once `report` is set
  // the JSX below only ever reads from `report`, never `shift`, so it's
  // safe to keep rendering with a null `shift`.
  if (!shift && !report) return null;

  const difference = report?.difference ?? 0;
  const diffLabel = difference === 0 ? t.shifts.balanced : difference > 0 ? t.shifts.over : t.shifts.short;
  const diffVariant = difference === 0 ? "success" : difference > 0 ? "outline" : "destructive";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm" hideClose={step === "report"}>
        {step === "summary" && shift && (
          <>
            <DialogHeader>
              <DialogTitle>{t.shifts.shiftSummary}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <Row label={t.shifts.cashier} value={shift.cashierName} />
              <Row label={t.shifts.startTime} value={formatDateTime(shift.startedAt, locale)} />
              <Row label={t.shifts.ordersCount} value={formatNumber(posShiftOrders.length)} />
              <Row label={t.shifts.cashSales} value={formatMoney(live.cashSales, settings.currencySymbol)} />
              <Row label={t.shifts.cardSales} value={formatMoney(live.cardSales, settings.currencySymbol)} />
              {liveTalabatOrders.length > 0 && (
                <>
                  <div className="my-1 border-t border-dashed border-border" />
                  <Row label={t.shifts.externalOrders.replace("{name}", externalName)} value={formatNumber(liveTalabatOrders.length)} />
                  <Row
                    label={t.shifts.externalRevenue.replace("{name}", externalName)}
                    value={formatMoney(liveTalabatOrders.reduce((s, o) => s + o.total, 0), settings.currencySymbol)}
                  />
                </>
              )}
            </div>
            {pendingOfflineForShift > 0 && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                {t.shifts.pendingOfflineOrdersBlock}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                {t.common.close}
              </Button>
              <Button variant="destructive" disabled={pendingOfflineForShift > 0} onClick={() => setStep("closing")}>
                {t.shifts.closeShift}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "closing" && (
          <>
            <DialogHeader>
              <DialogTitle>{t.shifts.closeShift}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t.shifts.actualCashDesc}</p>
              <div>
                <Label>{t.shifts.actualCash}</Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  autoFocus
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("summary")}>
                {t.common.back}
              </Button>
              <Button disabled={submitting} onClick={handleConfirmClose}>
                {t.shifts.closeShift}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "report" && report && (
          <>
            <DialogHeader>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <DialogTitle>{t.shifts.shiftReport}</DialogTitle>
                <Badge variant={diffVariant as any}>{diffLabel}</Badge>
              </div>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <Row label={t.shifts.cashier} value={report.cashierName} />
              <Row label={t.shifts.startTime} value={formatDateTime(report.startedAt, locale)} />
              <Row label={t.shifts.endTime} value={report.closedAt ? formatDateTime(report.closedAt, locale) : "—"} />
              <Row label={t.shifts.ordersCount} value={formatNumber(report.ordersCount ?? 0)} />
              <Row label={t.shifts.openingCash} value={formatMoney(report.openingCash, settings.currencySymbol)} />
              <Row label={t.shifts.cashSales} value={formatMoney(report.cashSales ?? 0, settings.currencySymbol)} />
              <Row label={t.shifts.cardSales} value={formatMoney(report.cardSales ?? 0, settings.currencySymbol)} />
              <Row label={t.shifts.expenses} value={formatMoney(report.expensesTotal ?? 0, settings.currencySymbol)} />
              <div className="my-2 border-t border-dashed border-border" />
              <Row label={t.shifts.expectedCash} value={formatMoney(report.expectedCash ?? 0, settings.currencySymbol)} />
              <Row label={t.shifts.actualCash} value={formatMoney(report.actualCash ?? 0, settings.currencySymbol)} />
              <Row
                label={t.shifts.difference}
                value={`${formatMoney(report.difference ?? 0, settings.currencySymbol)} · ${diffLabel}`}
                bold
              />
            </div>
            {/* The configurable external-marketplace payment method,
                deliberately kept out of the grand total above and shown
                here as its own separate section, matching the printed
                report exactly. */}
            <div className="space-y-2 rounded-lg border border-[#FF5A00]/30 p-3 text-sm">
              <p className="text-xs font-semibold text-[#FF5A00]">{t.shifts.externalSectionTitle.replace("{name}", externalName)}</p>
              <Row label={t.shifts.externalOrders.replace("{name}", externalName)} value={formatNumber(report.talabatOrdersCount ?? 0)} />
              <Row label={t.shifts.externalRevenue.replace("{name}", externalName)} value={formatMoney(report.talabatRevenue ?? 0, settings.currencySymbol)} />
            </div>
            <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
              <Button variant="outline" disabled={printing} onClick={() => handlePrint(report)}>
                <Printer className="h-4 w-4" />
                {t.shifts.printReport}
              </Button>
              <Button onClick={() => { handleClose(false); onFinished?.(); }}>{t.shifts.finish}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
