"use client";

import { useEffect, useRef } from "react";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useDataStore } from "@/lib/store/useDataStore";
import { useTableStore, type DiningSection, type DiningTable } from "@/lib/store/useTableStore";

function validLayout(value: unknown): value is { sections: DiningSection[]; tables: DiningTable[] } {
  if (!value || typeof value !== "object") return false;
  const layout = value as { sections?: unknown; tables?: unknown };
  return Array.isArray(layout.sections) && Array.isArray(layout.tables)
    && layout.sections.every((section) => section && typeof section.id === "string" && typeof section.name === "string")
    && layout.tables.every((table) => table && typeof table.id === "string" && typeof table.sectionId === "string"
      && typeof table.name === "string" && Number.isFinite(table.seats) && Number.isFinite(table.position));
}

export function DiningTableSync() {
  const branchId = useBranchStore((state) => state.currentBranchId);
  const loaded = useDataStore((state) => state.loaded);
  const diningLayout = useDataStore((state) => state.settings.diningLayout);
  const updateSettings = useDataStore((state) => state.updateSettings);
  const appliedRemote = useRef(false);
  const migratedBranches = useRef(new Set<string>());
  const applyingRemote = useRef(false);

  useEffect(() => {
    appliedRemote.current = false;
  }, [branchId]);

  useEffect(() => {
    if (!branchId || !loaded || appliedRemote.current) return;
    if (validLayout(diningLayout)) {
      const local = useTableStore.getState();
      const remoteSignature = JSON.stringify({ sections: diningLayout.sections, tables: diningLayout.tables });
      const localSignature = JSON.stringify({ sections: local.sections, tables: local.tables });
      if (remoteSignature !== localSignature) {
        applyingRemote.current = true;
        local.applyRemoteLayout(diningLayout);
        applyingRemote.current = false;
      }
      appliedRemote.current = true;
      return;
    }

    // Migrate an existing browser layout to Supabase once. A fresh Windows app
    // starts with defaults and must never overwrite a website layout.
    if (!window.sankyDesktop?.isDesktop && !migratedBranches.current.has(branchId)) {
      migratedBranches.current.add(branchId);
      const { sections, tables } = useTableStore.getState();
      void updateSettings({ diningLayout: { sections, tables } });
    }
    appliedRemote.current = true;
  }, [branchId, diningLayout, loaded, updateSettings]);

  useEffect(() => {
    if (!branchId || !loaded) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useTableStore.subscribe((state, previous) => {
      if (applyingRemote.current || (state.sections === previous.sections && state.tables === previous.tables)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void updateSettings({ diningLayout: { sections: state.sections, tables: state.tables } });
      }, 500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [branchId, loaded, updateSettings]);

  return null;
}
