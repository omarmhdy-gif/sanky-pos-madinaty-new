"use client";

import { useDataStore } from "@/lib/store/useDataStore";
import { cn } from "@/lib/utils";

export function ShopLogo({ className }: { className?: string }) {
  const logo = useDataStore((s) => s.settings.logo);

  if (logo) {
    return <img src={logo} alt="" className={cn("bg-white object-contain p-1", className)} />;
  }

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-neutral-950", className)}>
      <img
        src="/sanky-logo.jpg"
        alt=""
        className="absolute inset-0 h-full w-full max-w-none object-cover"
        style={{ transform: "translate(4px, 12px) scale(2.8)" }}
      />
      <span className="sr-only">Sanky</span>
    </div>
  );
}
