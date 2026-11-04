"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useSidebarUIStore } from "@/lib/store/useSidebarUIStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { bilingual, useI18n } from "@/lib/i18n";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { SyncButton } from "@/components/layout/SyncButton";
import { DiningTableSync } from "@/components/layout/DiningTableSync";

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const sidebarCollapsed = useSidebarUIStore((s) => s.collapsed);
  const toggleSidebar = useSidebarUIStore((s) => s.toggleCollapsed);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const { locale } = useI18n();
  const businessName = useDataStore((s) => s.settings.shopName.trim());
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const currentBranch = branches.find((branch) => branch.id === currentBranchId);
  const [desktopMode, setDesktopMode] = useState(false);

  useEffect(() => {
    setDesktopMode(Boolean(window.sankyDesktop?.isDesktop));
  }, []);

  const desktopShell = (
    <div className="sanky-app flex h-app w-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-5">
        <div className="flex items-center gap-3">
          <img src="/nova-mark-transparent.svg" alt="" className="h-8 w-8 object-contain" />
          <div className="min-w-0">
            <p className="max-w-56 truncate text-sm font-semibold leading-tight">{businessName || "NOVA"}</p>
            {currentBranch && <p className="mt-0.5 max-w-56 truncate text-[10px] leading-tight text-muted-foreground">{bilingual(currentBranch.name, locale)}</p>}
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{title}</span>
        </div>
        <div className="flex items-center gap-2">
        <SyncButton />
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
        >
          <LogOut className="h-4 w-4" />
          {locale === "ar" ? "تسجيل الخروج" : "Log out"}
        </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );

  return (
    <AuthGuard>
      <DiningTableSync />
      {desktopMode ? desktopShell : (
        <div className="sanky-app flex h-app w-full overflow-hidden">
          <Sidebar collapsed={sidebarCollapsed} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar title={title} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
            <main className="flex-1 overflow-y-auto no-scrollbar">{children}</main>
            <BottomNav />
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
