"use client";

import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { getCachedShopLogo } from "@/lib/store/shopLogoCache";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function useShopLogoUrl(): string | undefined {
  const logo = useDataStore((s) => s.settings.logo);
  const branchId = useBranchStore((s) => s.currentBranchId);
  const [cachedLogo, setCachedLogo] = useState<string | undefined>();

  useEffect(() => {
    setCachedLogo(getCachedShopLogo(branchId));
  }, [branchId]);

  return logo || cachedLogo;
}

export function ShopLogo({ className }: { className?: string }) {
  const logo = useShopLogoUrl();
  const shopName = useDataStore((s) => s.settings.shopName);

  if (logo) {
    return <img src={logo} alt={shopName || "Shop logo"} className={cn("bg-transparent object-contain", className)} />;
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
