"use client";

import { usePathname } from "next/navigation";
import { DataBootstrap } from "@/components/layout/DataBootstrap";
import { SystemMonitor } from "@/components/layout/SystemMonitor";

/**
 * The owner-console preview is isolated from the shop runtime. It must not
 * bootstrap branch data, ping the shop database, flush offline queues, or
 * contact local printer services.
 */
export function AppRuntime({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/platform-admin")) return <>{children}</>;

  return (
    <>
      <SystemMonitor />
      <DataBootstrap>{children}</DataBootstrap>
    </>
  );
}
