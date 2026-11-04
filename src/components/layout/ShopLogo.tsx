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
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-transparent", className)}>
      <img
        src="/nova-mark-transparent.svg"
        alt=""
        className="h-full w-full object-contain"
      />
      <span className="sr-only">NOVA</span>
    </div>
  );
}
