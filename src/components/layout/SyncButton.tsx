"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/lib/store/useDataStore";
import { useOrderQueueStore } from "@/lib/store/useOrderQueueStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SyncButton() {
  const { locale } = useI18n();
  const fetchAll = useDataStore((state) => state.fetchAll);
  const loading = useDataStore((state) => state.loading);
  const pendingSales = useOrderQueueStore((state) => state.queue.length);
  const [syncing, setSyncing] = useState(false);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const busy = syncing || loading;
  const isArabic = locale === "ar";

  useEffect(() => {
    if (!downloadingUpdate || !window.sankyDesktop?.isDesktop) return;
    return window.sankyDesktop.updater.onProgress((progress) => setDownloadProgress(progress.percent));
  }, [downloadingUpdate]);

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
        if (window.sankyDesktop?.isDesktop) {
          try {
            const update = await window.sankyDesktop.updater.check();
            if (update.status === "available" && update.version) {
              setAvailableVersion(update.version);
              setUpdateDownloaded(false);
              if (pending) toast(isArabic ? `تم تحديث بيانات الفرع. يوجد ${pending} طلب غير مرسل؛ أرسل الطلبات قبل تثبيت تحديث البرنامج.` : `Branch data refreshed. ${pending} sale(s) are still queued; send them before restarting to install the app update.`, "info");
              else toast(isArabic ? `تم تحديث بيانات الفرع. يتوفر تحديث للبرنامج ${update.version}.` : `Branch data synced. App update ${update.version} is available.`, "success");
              return;
            }
            if (update.status === "unavailable" || update.status === "unsupported") {
              toast(isArabic ? "تم تحديث بيانات الموقع، لكن تعذر التحقق من تحديث برنامج الكمبيوتر." : "Website data synced, but the desktop app update service couldn't be reached.", "info");
              return;
            }
          } catch (error) {
            console.warn("Desktop update check failed after data sync:", error);
            toast(isArabic ? "تم تحديث بيانات الموقع، لكن تعذر التحقق من تحديث برنامج الكمبيوتر." : "Website data synced, but the desktop app update check failed.", "info");
            return;
          }
        }
        toast(
          pending
            ? (isArabic ? `تم تحديث بيانات الفرع. ${pending} طلب بيع محفوظ على الجهاز وسيُعاد إرساله عند عودة الاتصال.` : `Branch data refreshed. ${pending} offline sale(s) will retry automatically when online.`)
            : (isArabic ? "تمت مزامنة بيانات الفرع." : "Branch data synced."),
          pending ? "info" : "success"
        );
      } else {
        toast(isArabic ? "تعذرت المزامنة؛ بقيت البيانات المحفوظة على الجهاز." : "Sync couldn't reach the server. Saved device data was kept.", "error");
      }
    } catch (error) {
      console.error("POS sync failed:", error);
      toast(isArabic ? "تعذرت مزامنة بيانات الموقع. تحقق من الاتصال ثم أعد المحاولة." : "Website data sync failed. Check the connection and try again.", "error");
    } finally {
      setSyncing(false);
    }
  };

  const downloadUpdate = async () => {
    if (!window.sankyDesktop?.isDesktop || pendingSales > 0) return;
    setDownloadingUpdate(true);
    setDownloadProgress(0);
    try {
      await window.sankyDesktop.updater.download();
      setUpdateDownloaded(true);
      toast(isArabic ? "تم تنزيل تحديث البرنامج. أعد تشغيله لتثبيته." : "App update downloaded. Restart to install it.", "success");
    } catch {
      toast(isArabic ? "تعذر تنزيل تحديث البرنامج. تحقق من اتصال الإنترنت ثم أعد المحاولة." : "Couldn't download the app update. Check the internet connection and try again.", "error");
    } finally {
      setDownloadingUpdate(false);
    }
  };

  const installUpdate = async () => {
    if (!window.sankyDesktop?.isDesktop || !updateDownloaded || pendingSales > 0) return;
    try {
      await window.sankyDesktop.updater.install();
    } catch {
      toast(isArabic ? "تعذر بدء التثبيت. قد تحتاج لتسجيل الدخول بحساب ويندوز العادي للموافقة على التحديث." : "Couldn't start installation. Windows may require approval from your regular administrator account.", "error");
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={syncNow} disabled={busy} title={isArabic ? "تحديث بيانات الموقع والتحقق من تحديث البرنامج" : "Refresh website data and check for app updates"}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        <span>{busy ? (isArabic ? "جاري المزامنة" : "Syncing") : (isArabic ? "مزامنة" : "Sync")}</span>
        {pendingSales > 0 && <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{pendingSales}</span>}
      </Button>

      <Dialog open={Boolean(availableVersion)} onOpenChange={(open) => { if (!open && !downloadingUpdate) setAvailableVersion(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isArabic ? `يتوفر تحديث للبرنامج ${availableVersion ?? ""}` : `Sanky POS update ${availableVersion ?? ""} is available`}</DialogTitle>
            <DialogDescription>
              {pendingSales > 0
                ? (isArabic ? `لديك ${pendingSales} طلب بيع غير مرسل. أرسلها أولًا قبل إعادة تشغيل البرنامج.` : `${pendingSales} sale(s) are waiting to sync. Send them before restarting the app.`)
                : downloadingUpdate
                  ? (isArabic ? `جاري تنزيل التحديث: ${downloadProgress}%` : `Downloading update: ${downloadProgress}%`)
                  : updateDownloaded
                    ? (isArabic ? "التحديث جاهز. إعادة التشغيل ستغلق البرنامج وتثبت النسخة الجديدة." : "The update is ready. Restarting will close Sanky and install the new version.")
                    : (isArabic ? "سيتم تنزيل تحديث البرنامج. قد يطلب ويندوز موافقة المسؤول عند التثبيت." : "The app update will download. Windows may request administrator approval to install it.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {updateDownloaded ? (
              <Button type="button" onClick={installUpdate} disabled={pendingSales > 0}>
                {isArabic ? "إعادة التشغيل والتثبيت" : "Restart and install"}
              </Button>
            ) : (
              <Button type="button" onClick={downloadUpdate} disabled={downloadingUpdate || pendingSales > 0}>
                {downloadingUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {downloadingUpdate ? (isArabic ? "جاري التنزيل" : "Downloading") : (isArabic ? "تنزيل التحديث" : "Download update")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
