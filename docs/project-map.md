# Project map (read the relevant section only)

## UI and shell
Next.js App Router in src/app/: pos, dashboard, products, recipes, inventory, orders, reports, finance, hr, employees, attendance, customers, settings, devices, login, reset-password, branch-select, platform-admin. Components follow domains under src/components/; reusable controls are in ui/. The root layout and AppShell compose shared behavior. AppRuntime skips shop bootstrapping, sync queues and printer monitoring on the localhost-only platform-admin preview. DataBootstrap waits for Supabase Auth on web before loading shop data; SystemMonitor waits for a web Auth session before checking/syncing queues. Desktop cashier login remains PIN-based. DiningTableSync handles table synchronization.

POS entry: src/app/pos/page.tsx. Checkout: components/pos/PaymentDialog.tsx and CartPanel.tsx; product selection: ProductGrid.tsx, CategoryTabs.tsx, ModifierDialog.tsx; receipt preview: ReceiptView.tsx. Read only the component involved.

Translations: src/lib/i18n/{index.tsx,ar.ts,en.ts}. Theme: src/hooks/useTheme.tsx, src/app/globals.css, tailwind.config.ts. Shared domain types: src/lib/types.ts; desktop bridge types: src/types/desktop.d.ts.

## Data and offline behavior
Zustand stores: src/lib/store/. Start with useDataStore for shared domain data, useCartStore for active sale, useHeldOrdersStore for held orders, useAuthStore for staff/PIN, useBranchStore for branch scope, useTableStore for tables. API: src/lib/supabase/api.ts; client: client.ts; conversion: mappers.ts in that same directory. Web owner login uses Supabase email/password plus the private `shop_accounts` mapping and account RPCs; password reset is in `src/app/reset-password/`. Desktop cashier PIN remains separate. Search the action/RPC name before reading these large files.

Subscription enforcement uses `src/lib/shopSubscription.ts` before POS checkout. It reads only `status`, `expires_at`, and `tenant_project_ref` from the central platform database using the public key plus an RLS policy scoped to the matching tenant project reference; no service-role key or cashier JWT is sent. Platform shops must have `tenant_project_ref` set to the shop database project reference; the platform dashboard edits that binding and displays expiry days. The central-only grant/policy is tracked in `supabase/migrations/20261024130000_platform_shop_license_read.sql`.

Offline/sync touchpoints: useOrderQueueStore.ts, offlineSnapshot.ts, storage.ts and components/layout/SystemMonitor.tsx. Printing has a separate usePrintQueueStore.ts. Trace the relevant queue before editing retries; preserve duplicate prevention, branch scope and existing error behavior.

Database source: supabase/schema.sql plus migration_*.sql. Search only the relevant table/function across SQL files; inspect matching definitions and subsequent redefinitions. Filenames alone do not prove execution order or which migrations are applied remotely. seed.sql and import_real_menu.sql contain data operations, not routine verification steps.

## Printing and Windows
src/lib/printing/printReceipt.ts orchestrates printing/queue fallback; escpos.ts builds bytes; printerServerClient.ts handles transports; logoRaster.ts handles logo rasterization. Device settings/status/log stores are in src/lib/store/. SystemMonitor retries queues. UI: app/devices/page.tsx and components/pos/DesktopPrinterDialog.tsx.

Browser/network bridge: printer-server/server.js and its README.md (read only the relevant setup/troubleshooting section). Preserve printer-server/.certs during updates. Windows USB/network IPC: desktop/main.cjs, desktop/preload.cjs, src/types/desktop.d.ts. Trace the actual transport before assuming every receipt uses the network bridge.

## Build and release
package.json declares dev/build/start/lint and desktop:build. Next config uses static export and trailingSlash; output is out/. Electron entry is desktop/main.cjs; packaging and GitHub publish destination are in package.json. Installer scripts are under desktop/. Windows packaging copies the static renderer to resources/out and desktop/main.cjs serves that path. Keep out/ in extraResources because the directory is Git-ignored; desktop:build runs scripts/verify-desktop-renderer.mjs to check all renderer manifest sizes and hashes before creating installers. `build.npmRebuild=false` is set because Electron main/preload use built-ins and the renderer is static; revisit if a native runtime dependency is added. .github/workflows/desktop-release.yml builds Windows releases on matching master pushes or manual dispatch; it uses Node 22, public Supabase build variables and publishes via electron-builder. Documentation-only paths are not in its push path filter.

Web hosting is described as Vercel in README.md; live deployment state has not been verified. Do not read .vercel internals or secrets unless needed by a separately authorized deployment task. scripts/ includes production data tools: inspect a specific script before considering execution.
