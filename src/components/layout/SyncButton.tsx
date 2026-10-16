"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/lib/store/useDataStore";
import { useOrderQueueStore } from "@/lib/store/useOrderQueueStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

export function SyncButton() {
  const { locale } = useI18n();
  const fetchAll = useDataStore((state) => state.fetchAll);
  const loading = useDataStore((state) => state.loading);
  const pendingSales = useOrderQueueStore((state) => state.queue.length);
  const [syncing, setSyncing] = useState(false);
  const busy = syncing || loading;
  const isArabic = locale === "ar";

  const syncNow = async () => {
    if (busy) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast(isArabic ? "لا يوجد اتصال بالإنترنت؛ بيانات الجهاز المحفوظة ما زالت متاحة." : "You're offline. Saved device data is still available.", "info");
      return;
    }
    setSyncing(true);
    try {
      const refreshed = await fetchAll();
      if (refreshed) {
        const pending = useOrderQueueStore.getState().queue.length;
        toast(
          pending
            ? (isArabic ? `تم تحديث بيانات الفرع. يوجد ${pending} طلب بيع ينتظر تفعيل مزامنة الطلبات.` : `Branch data refreshed. ${pending} offline sale(s) still need order sync enabled.`)
            : (isArabic ? "تمت مزامنة بيانات الفرع." : "Branch data synced."),
          pending ? "info" : "success"
        );
      } else {
        toast(isArabic ? "تعذرت المزامنة؛ بقيت البيانات المحفوظة على الجهاز." : "Sync couldn't reach the server. Saved device data was kept.", "error");
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={syncNow} disabled={busy} title={isArabic ? "تحديث البيانات من الموقع" : "Refresh data from the website"}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      <span>{busy ? (isArabic ? "جاري المزامنة" : "Syncing") : (isArabic ? "مزامنة" : "Sync")}</span>
      {pendingSales > 0 && <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{pendingSales}</span>}
    </Button>
  );
}
