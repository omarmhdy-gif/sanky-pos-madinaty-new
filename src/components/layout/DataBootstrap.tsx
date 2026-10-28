"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { clearShopAccountNumber, getShopAccountNumber, supabase } from "@/lib/supabase/client";
import { checkShopSubscription } from "@/lib/shopSubscription";
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
  const [hasAuthSession, setHasAuthSession] = useState(false);
  const [desktopSessionChecked, setDesktopSessionChecked] = useState(false);
  const [desktopDeviceSessionValid, setDesktopDeviceSessionValid] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const fetchBranches = useBranchStore((s) => s.fetchBranches);
  const branchesLoaded = useBranchStore((s) => s.loaded);
  const branchesError = useBranchStore((s) => s.error);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);

  const fetchAll = useDataStore((s) => s.fetchAll);
  const dataLoaded = useDataStore((s) => s.loaded);
  const canLoadAppData = desktopMode === true
    ? authReady && desktopSessionChecked && desktopDeviceSessionValid
    : authReady && hasAuthSession && isAuthenticated;

  useEffect(() => {
    const isDesktop = Boolean(window.sankyDesktop?.isDesktop);
    setDesktopMode(isDesktop);

    let active = true;
    const checkDeviceSession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
      setHasAuthSession(Boolean(session));
      if (!isDesktop) return;
      if (!session) {
        if (active) {
          setDesktopDeviceSessionValid(false);
          setDesktopSessionChecked(true);
        }
        return;
      }
      const accountNumber = getShopAccountNumber();
      const { data, error } = accountNumber
        ? await supabase.rpc("verify_shop_device_session", { p_account_number: accountNumber })
        : { data: false, error: null };
      if (!active) return;
      const valid = !error && data === true;
      setDesktopDeviceSessionValid(valid);
      setDesktopSessionChecked(true);
      if (!valid) {
        clearShopAccountNumber();
        await supabase.auth.signOut();
      }
    };
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      void checkDeviceSession(session);
      if (event === "SIGNED_OUT") {
        clearShopAccountNumber();
        logout();
      }
      if (
        event === "PASSWORD_RECOVERY" &&
        session &&
        window.location.pathname !== "/reset-password/" &&
        window.location.pathname !== "/reset-password"
      ) {
        window.location.replace("/reset-password/");
      }
    });

    // Some email clients strip or override the requested redirect path. The
    // Supabase client may already have exchanged the recovery code by then, so
    // also honor the recovery marker from the callback URL on initial load.
    const callbackParams = new URLSearchParams(`${window.location.search}&${window.location.hash.slice(1)}`);
    if (callbackParams.get("type") === "recovery") {
      window.location.replace(`/reset-password/${window.location.search}${window.location.hash}`);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      void checkDeviceSession(data.session);
      if (!data.session) {
        clearShopAccountNumber();
        logout();
      }
      setAuthReady(true);
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [logout]);

  // Don't load branch lists before authentication. This also makes the first
  // Electron launch land on the activation form instead of an anonymous sync.
  useEffect(() => {
    if (desktopMode === true && canLoadAppData) void fetchBranches();
    if (desktopMode === false && authReady && hasAuthSession) void fetchBranches();
  }, [desktopMode, authReady, hasAuthSession, canLoadAppData, fetchBranches]);

  useEffect(() => {
    if (currentBranchId && canLoadAppData) {
      void fetchAll().then((synced) => {
        if (synced && desktopMode === true) void checkShopSubscription(true);
      });
    }
  }, [currentBranchId, canLoadAppData, desktopMode, fetchAll]);

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

  const stillLoading = desktopMode === null
    || !authReady
    || (desktopMode && hasAuthSession && !desktopSessionChecked)
    || (canLoadAppData && !branchesLoaded)
    || (canLoadAppData && currentBranchId !== null && !dataLoaded);

  if (stillLoading) {
    return <BrandSplash />;
  }

  return <>{children}</>;
}
