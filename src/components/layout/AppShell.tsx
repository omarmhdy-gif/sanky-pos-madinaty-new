"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { StartShiftDialog } from "@/components/shifts/StartShiftDialog";
import { useShiftUIStore } from "@/lib/store/useShiftUIStore";
import { useSidebarUIStore } from "@/lib/store/useSidebarUIStore";

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const startShiftOpen = useShiftUIStore((s) => s.startShiftOpen);
  const startShiftRequired = useShiftUIStore((s) => s.startShiftRequired);
  const closeStartShift = useShiftUIStore((s) => s.closeStartShift);
  const sidebarCollapsed = useSidebarUIStore((s) => s.collapsed);
  const toggleSidebar = useSidebarUIStore((s) => s.toggleCollapsed);

  return (
    <AuthGuard>
      <div className="sanky-app flex h-app w-full overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar title={title} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
          <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
          <BottomNav />
        </div>
      </div>
      <StartShiftDialog
        open={startShiftOpen}
        required={startShiftRequired}
        onOpenChange={closeStartShift}
      />
    </AuthGuard>
  );
}
