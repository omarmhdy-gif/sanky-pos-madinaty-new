# Observed project state

Checked 2026-10-20 with a limited local inspection; this is not a runtime or production audit.

- Local project: C:/Users/Foodics/Desktop/sanky madinty pos/sanky-pos. Package/product name is Sanky POS; the request called it Sync POS.
- Stack declared locally: Next.js 15.5.20, React 19, TypeScript, Zustand, Tailwind, Supabase JS, Electron 44.7.2. package.json remains the source of current versions.
- App is configured for static export, with a companion network printer server and Windows desktop printing paths.
- No existing AGENTS.md or SKILL.md was found by the scoped search excluding generated/dependency/release trees. No AGENTS.md was found in the checked user/Desktop/project-parent directories.
- Version mismatch observed: package.json is now 1.0.7, src/lib/version.ts exposes APP_VERSION 1.0.0, printer-server/package.json is 1.9.1. Do not silently reconcile these during unrelated work. Windows CI generates its own release version.
- No test script is declared. Build skips lint; the declared next lint command has not been verified against the installed toolchain.
- App behavior, production data, applied migrations, physical printers and deployed web state were not tested during documentation setup.

## Maintenance
Update only the affected paragraph when architecture, commands or entry points change. Keep task history in task reports rather than growing AGENTS.md. New tasks should read AGENTS.md, then one matching skill and the necessary map section.

## Windows packaging note (2026-10-24)

- The default electron-builder native-dependency rebuild failed on this host with `EPERM` while `@electron/rebuild` called `realpath` on `node_modules` inside the restricted execution environment. Electron main/preload use Electron and Node built-ins, while the POS renderer is static, so `build.npmRebuild=false` is now set in package.json. Revisit only if a native runtime npm dependency is introduced.
- The first packaged desktop artifact contained `out/renderer-manifest.json` but omitted the rest of `out/` because the renderer export is Git-ignored and electron-builder's app-file matching did not package that ignored directory. Keep `out/` under `build.extraResources` (outside app.asar) and `BUNDLED_STATIC_ROOT` pointed at `process.resourcesPath/out`; verify every manifest path exists there before delivering an installer.
- A normal sandboxed packaging attempt may also fail to resolve `github.com` while downloading Electron/NSIS tooling; rerun the approved build with network access. This is separate from the `EPERM` issue.
