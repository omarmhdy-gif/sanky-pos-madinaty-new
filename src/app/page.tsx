"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { defaultRouteFor } from "@/lib/permissions";
import { BrandSplash } from "@/components/layout/BrandSplash";

export default function RootPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.currentUser);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);

  useEffect(() => {
    if (!currentBranchId) {
      router.replace("/branch-select");
    } else if (!isAuthenticated || !currentUser) {
      router.replace("/login");
    } else {
      router.replace(defaultRouteFor(currentUser) ?? "/dashboard");
    }
  }, [currentBranchId, isAuthenticated, currentUser, router]);

  return <BrandSplash />;
}
