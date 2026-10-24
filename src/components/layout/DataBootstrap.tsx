"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { supabase } from "@/lib/supabase/client";
import { BrandSplash } from "@/components/layout/BrandSplash";

// Loads branches on mount (needed even before login, for Branch Select), then
// loads that branch's data once one is chosen. Renders a splash screen while
// either fetch is in flight, and re-fetches app data whenever the selected
// branch changes (e.g. "Switch Branch"). On failure, shows the real error
// message and a Retry button instead of hanging silently — this is the one
// screen every user hits before login, so it needs to be debuggable without
// opening DevTools.
export function DataBootstrap({ children }: { children: React.ReactNode }) {
  const [desktopMode, setDesktopMode] = useState<boolean | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const fetchBranches = useBranchStore((s) => s.fetchBranches);
  const branchesLoaded = useBranchStore((s) => s.loaded);
  const branchesError = useBranchStore((s) => s.error);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);

  const fetchAll = useDataStore((s) => s.fetchAll);
  const dataLoaded = useDataStore((s) => s.loaded);
  const canLoadAppData = desktopMode === true || (authReady && isAuthenticated);

  useEffect(() => {
    const isDesktop = Boolean(window.sankyDesktop?.isDesktop);
    setDesktopMode(isDesktop);
    if (isDesktop) {
      setAuthReady(true);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) logout();
      setAuthReady(true);
    });
    return () => { active = false; };
  }, [logout]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    if (currentBranchId && canLoadAppData) {
      fetchAll();
    }
  }, [currentBranchId, canLoadAppData, fetchAll]);

  if (branchesError) {
    return (
      <div className="flex h-app w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium">Couldn&apos;t connect to the database</p>
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

  const stillLoading = !branchesLoaded || desktopMode === null || (desktopMode === false && !authReady) || (canLoadAppData && currentBranchId !== null && !dataLoaded);

  if (stillLoading) {
    return <BrandSplash />;
  }

  return <>{children}</>;
}
