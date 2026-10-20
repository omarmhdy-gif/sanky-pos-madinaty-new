"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/lib/store/useDataStore";
import { useCartStore } from "@/lib/store/useCartStore";
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
          let rendererUnavailable = false;
          try {
            const renderer = await window.sankyDesktop.renderer.sync();
            if (renderer.status === "staged") {
              if (!renderer.version) throw new Error("The staged website renderer has no version.");
              const cartIsClear = useCartStore.getState().lines.length === 0;
              const queueIsClear = useOrderQueueStore.getState().queue.length === 0;
              if (cartIsClear && queueIsClear && renderer.version) {
                const applied = await window.sankyDesktop.renderer.apply(renderer.version);
                if (applied.status === "updated" || applied.status === "current") {
                  toast(isArabic ? "تم تحديث بيانات الموقع وواجهة الكاشير. جاري إعادة تحميل البرنامج." : "Website data and cashier interface updated. Reloading the POS.", "success");
                  window.setTimeout(() => window.location.reload(), 250);
                  return;
                }
                if (applied.status === "unavailable") rendererUnavailable = true;
              }
              toast(isArabic
                ? `واجهة موقع أحدث جاهزة (${renderer.version.slice(0, 10)}). أرسل الطلبات وأفرغ الطلب الحالي، ثم اضغط مزامنة لتطبيقها.`
                : `A newer website interface is ready (${renderer.version.slice(0, 10)}). Send queued sales and clear the current cart, then Sync again to apply it.`, "info");
              return;
            }
            rendererUnavailable = renderer.status === "unavailable";
          } catch (error) {
            console.warn("Website renderer sync failed after data sync:", error);
            rendererUnavailable = true;
          }
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
              toast(rendererUnavailable
                ? (isArabic ? "تم تحديث البيانات، لكن تعذر تنزيل واجهة الموقع أو التحقق من تحديث الكمبيوتر." : "Data synced, but the website interface download and desktop update check were unavailable.")
                : (isArabic ? "تم تحديث بيانات الموقع." : "Website data synced."), "info");
              return;
            }
          } catch (error) {
            console.warn("Desktop update check failed after data sync:", error);
            toast(rendererUnavailable
              ? (isArabic ? "تم تحديث البيانات، لكن تعذر تنزيل واجهة الموقع أو التحقق من تحديث الكمبيوتر." : "Data synced, but the website interface download and desktop update check failed.")
              : (isArabic ? "تم تحديث بيانات الموقع." : "Website data synced."), "info");
            return;
          }
        }
        toast(
          pending
            ? (isArabic ? `تم تحديث بيانات الموقع. ${pending} طلب بيع محفوظ على الجهاز وسيُعاد إرساله عند عودة الاتصال.` : `Website data refreshed. ${pending} offline sale(s) will retry automatically when online.`)
            : (isArabic ? "تمت مزامنة بيانات الموقع." : "Website data synced."),
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
