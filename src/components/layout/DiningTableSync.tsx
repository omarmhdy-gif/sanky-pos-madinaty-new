"use client";

import { useEffect, useRef } from "react";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useDataStore } from "@/lib/store/useDataStore";
import { useTableStore, type DiningSection, type DiningTable, type TableOrderDraft } from "@/lib/store/useTableStore";
import { supabase } from "@/lib/supabase/client";

type SharedDiningLayout = {
  sections: DiningSection[];
  tables: DiningTable[];
  occupiedTableIds?: string[];
  tableOrders?: Record<string, TableOrderDraft>;
};

function validLayout(value: unknown): value is SharedDiningLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<SharedDiningLayout>;
  return Array.isArray(layout.sections) && Array.isArray(layout.tables)
    && layout.sections.every((section) => section && typeof section.id === "string" && typeof section.name === "string")
    && layout.tables.every((table) => table && typeof table.id === "string" && typeof table.sectionId === "string"
      && typeof table.name === "string" && Number.isFinite(table.seats) && Number.isFinite(table.position))
    && (layout.occupiedTableIds === undefined || (Array.isArray(layout.occupiedTableIds)
      && layout.occupiedTableIds.every((id) => typeof id === "string")))
    && (layout.tableOrders === undefined || (layout.tableOrders !== null && typeof layout.tableOrders === "object"));
}

function layoutSnapshot(state: ReturnType<typeof useTableStore.getState>): SharedDiningLayout {
  return {
    sections: state.sections,
    tables: state.tables,
    occupiedTableIds: state.occupiedTableIds,
    tableOrders: state.tableOrders,
  };
}

function signature(layout: SharedDiningLayout): string {
  return JSON.stringify({
    sections: layout.sections,
    tables: layout.tables,
    occupiedTableIds: layout.occupiedTableIds ?? [],
    tableOrders: layout.tableOrders ?? {},
  });
}

export function DiningTableSync() {
  const branchId = useBranchStore((state) => state.currentBranchId);
  const loaded = useDataStore((state) => state.loaded);
  const diningLayout = useDataStore((state) => state.settings.diningLayout);
  const updateSettings = useDataStore((state) => state.updateSettings);
  const refreshSettings = useDataStore((state) => state.refreshSettings);
  const lastRemoteSignature = useRef<string | null>(null);
  const migratedBranches = useRef(new Set<string>());
  const applyingRemote = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    lastRemoteSignature.current = null;
  }, [branchId]);

  // Apply every newer remote layout, including manual Sync refreshes and
  // automatic Supabase Realtime updates. The previous one-shot guard meant
  // that only the first load could ever reach the table UI.
  useEffect(() => {
    if (!branchId || !loaded) return;
    if (validLayout(diningLayout)) {
      const remoteSignature = signature(diningLayout);
      if (remoteSignature !== lastRemoteSignature.current) {
        if (writeTimer.current) {
          clearTimeout(writeTimer.current);
          writeTimer.current = undefined;
        }
        lastRemoteSignature.current = remoteSignature;
        applyingRemote.current = true;
        try {
          useTableStore.getState().applyRemoteLayout(diningLayout);
        } finally {
          applyingRemote.current = false;
        }
      }
      return;
    }

    // Migrate the existing browser floor plan once. A desktop install starts
    // from local defaults and must never replace the website's saved layout.
    if (!window.sankyDesktop?.isDesktop && !migratedBranches.current.has(branchId)) {
      migratedBranches.current.add(branchId);
      void updateSettings({ diningLayout: layoutSnapshot(useTableStore.getState()) });
    }
  }, [branchId, diningLayout, loaded, updateSettings]);

  // Save both the floor plan and each open table's draft/occupied state so
  // another POS client can restore the same live dining session.
  useEffect(() => {
    if (!branchId || !loaded) return;
    const unsubscribe = useTableStore.subscribe((state, previous) => {
      if (applyingRemote.current) return;
      if (state.sections === previous.sections && state.tables === previous.tables
        && state.occupiedTableIds === previous.occupiedTableIds && state.tableOrders === previous.tableOrders) return;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        writeTimer.current = undefined;
        void updateSettings({ diningLayout: layoutSnapshot(state) });
      }, 350);
    });
    return () => {
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
        writeTimer.current = undefined;
      }
      unsubscribe();
    };
  }, [branchId, loaded, updateSettings]);

  // Stream shop-settings changes to the other client. A short poll is kept as
  // recovery for offline periods or dropped Realtime connections; it is also
  // the fallback while the channel reconnects.
  useEffect(() => {
    if (!branchId || !loaded) return;
    let realtimeConnected = false;
    let active = true;
    const channel = supabase
      .channel(`pos-settings-${branchId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "shop_settings",
        filter: `branch_id=eq.${branchId}`,
      }, () => {
        if (active) void refreshSettings();
      })
      .subscribe((status, error) => {
        realtimeConnected = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED" && active) void refreshSettings();
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && error) {
          console.warn("POS settings live sync disconnected:", error);
        }
      });
    const recoveryPoll = setInterval(() => {
      if (active && !realtimeConnected && navigator.onLine) void refreshSettings();
    }, 8000);
    const onOnline = () => { if (active) void refreshSettings(); };
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      clearInterval(recoveryPoll);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [branchId, loaded, refreshSettings]);

  return null;
}
