"use client";

import { Coffee } from "lucide-react";
import { useDataStore } from "@/lib/store/useDataStore";
import { cn } from "@/lib/utils";

export function ShopLogo({ className }: { className?: string }) {
  const logo = useDataStore((s) => s.settings.logo);

  if (logo) {
    return <img src={logo} alt="" className={cn("object-cover", className)} />;
  }

  return (
    <div className={cn("flex items-center justify-center bg-primary text-primary-foreground", className)}>
      <Coffee className="h-[55%] w-[55%]" />
    </div>
  );
}
