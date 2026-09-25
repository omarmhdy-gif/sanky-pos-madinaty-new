"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { StartShiftDialog } from "@/components/shifts/StartShiftDialog";
import { useShiftUIStore } from "@/lib/store/useShiftUIStore";

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const startShiftOpen = useShiftUIStore((s) => s.startShiftOpen);
  const closeStartShift = useShiftUIStore((s) => s.closeStartShift);

  return (
    <AuthGuard>
      <div className="flex h-app w-full overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar title={title} />
          <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
          <BottomNav />
        </div>
      </div>
      <StartShiftDialog open={startShiftOpen} onOpenChange={closeStartShift} />
    </AuthGuard>
  );
}
