"use client";

import { useEffect, useRef } from "react";
import { useSystemStatusStore } from "@/lib/store/useSystemStatusStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

// Runs once per POS session: waits for <SystemMonitor>'s first health-check
// pass (mounted app-wide in the root layout) to land, then shows a single
// non-blocking summary. Purely informational — the cashier can always start
// selling regardless of the result; this never gates or delays checkout.
export function StartupValidation() {
  const { t } = useI18n();
  const announced = useRef(false);
  const status = useSystemStatusStore();

  useEffect(() => {
    if (announced.current || !status.lastCheckedAt) return;
    announced.current = true;

    const issues: string[] = [];
    if (status.deviceServer !== "online") issues.push(t.devices.deviceServerCard);
    if (status.printer === "offline") issues.push(t.devices.receiptPrinter);
    if (status.supabase !== "online") issues.push(t.devices.supabaseLabel);
    if (status.internet !== "online") issues.push(t.devices.internetLabel);

    if (issues.length === 0) {
      toast(t.devices.readyForSales, "success");
    } else {
      toast(`${t.devices.attentionNeeded}: ${issues.join(", ")}`, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.lastCheckedAt]);

  return null;
}
