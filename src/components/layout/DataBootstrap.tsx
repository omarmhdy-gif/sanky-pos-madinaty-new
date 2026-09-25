"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { ShopLogo } from "@/components/layout/ShopLogo";

// Loads branches on mount (needed even before login, for Branch Select), then
// loads that branch's data once one is chosen. Renders a splash screen while
// either fetch is in flight, and re-fetches app data whenever the selected
// branch changes (e.g. "Switch Branch"). On failure, shows the real error
// message and a Retry button instead of hanging silently — this is the one
// screen every user hits before login, so it needs to be debuggable without
// opening DevTools.
export function DataBootstrap({ children }: { children: React.ReactNode }) {
  const fetchBranches = useBranchStore((s) => s.fetchBranches);
  const branchesLoaded = useBranchStore((s) => s.loaded);
  const branchesError = useBranchStore((s) => s.error);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);

  const fetchAll = useDataStore((s) => s.fetchAll);
  const dataLoaded = useDataStore((s) => s.loaded);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    if (currentBranchId) {
      fetchAll();
    }
  }, [currentBranchId, fetchAll]);

  if (branchesError) {
    return (
      <div className="flex h-app w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium">Couldn't connect to the database</p>
        <p className="max-w-md break-words text-xs text-muted-foreground">{branchesError}</p>
        <button
          onClick={() => fetchBranches()}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  const stillLoading = !branchesLoaded || (currentBranchId !== null && !dataLoaded);

  if (stillLoading) {
    return (
      <div className="flex h-app w-full flex-col items-center justify-center gap-3 bg-background">
        <ShopLogo className="h-12 w-12 rounded-xl animate-pulse" />
        <p className="text-sm text-muted-foreground">Connecting…</p>
      </div>
    );
  }

  return <>{children}</>;
}
