"use client";

import { useI18n } from "@/lib/i18n";

export function BrandSplash() {
  const { locale } = useI18n();
  const label = locale === "ar" ? "جارٍ تجهيز البرنامج" : "Preparing Sanky POS";

  return (
    <main className="sanky-splash flex h-app w-full items-center justify-center overflow-hidden px-6" role="status" aria-live="polite" aria-label={label}>
      <div className="sanky-splash-orb" aria-hidden="true" />
      <section className="sanky-splash-content relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <div className="sanky-splash-mark" aria-hidden="true">
          <span className="sanky-splash-ring sanky-splash-ring-outer" />
          <span className="sanky-splash-ring sanky-splash-ring-inner" />
          <img src="/sanky-brand-mark.png" alt="" className="h-[4.5rem] w-[4.5rem] object-contain" />
        </div>
        <img src="/sanky-brand-lockup.png" alt="SANKY" className="sanky-splash-wordmark mt-5 h-auto w-[min(82vw,18rem)] object-contain" />
        <p className="mt-5 text-sm font-medium tracking-wide text-stone-600 dark:text-stone-300">
          {locale === "ar" ? "بنجهّز مساحة العمل…" : "Getting your workspace ready…"}
        </p>
        <div className="sanky-splash-track mt-4" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}
