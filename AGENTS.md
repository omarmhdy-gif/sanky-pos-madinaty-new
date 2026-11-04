# Sanky POS: task-focused working map

Read this file first. Read only the matching skill and relevant section of docs/project-map.md; do not load all docs or skills by default.

## Context discipline
- Start from the requested screen, error, function or domain. Search a named directory with `rg -n` and a result limit; read the relevant function and its immediate callers/types.
- Expand one dependency at a time only when needed. Do not recursively read the repository, all routes, stores, SQL migrations, or logs to establish context.
- Exclude node_modules/, .git/, .next/, out/, .production-build-check/, .electron-runtime/, release*/, usb-release/, backups/, printer-server/node_modules/, printer-server/.certs/, archives and generated logs from routine discovery.
- Check git status before editing; preserve unrelated changes. Never print .env.local, credentials, certificates or production data.
- The user explicitly forbids touching the Kiosk folder or its files. Do not search, read, list, modify, build, or otherwise interact with anything inside it.
- Use docs/project-state.md for known observations and limits; verify only facts relevant to the current request. Update the map when paths or workflows actually change, not after every task.

## Task routes
| Task | Read on demand | Start here |
| --- | --- | --- |
| POS/UI, Arabic/RTL | .agents/skills/pos-ui/SKILL.md | src/app/<screen>/page.tsx, src/components/<domain>/ |
| Supabase, sync, data | .agents/skills/supabase/SKILL.md | src/lib/store/<relevant store>, src/lib/supabase/api.ts |
| Receipts, devices, USB | .agents/skills/printing/SKILL.md | src/lib/printing/, src/app/devices/page.tsx |
| Web/Windows release | .agents/skills/deploy/SKILL.md | package.json, next.config.mjs, .github/workflows/desktop-release.yml |

Shared types: src/lib/types.ts. Shell: src/app/layout.tsx and src/components/layout/AppShell.tsx. Prefer the existing store/API path for writes; trace the relevant action before changing behavior.

## Validation and boundaries
Use checks proportional to the edit. Documentation-only changes need path/link/frontmatter and diff checks, not builds. For code changes, inspect package.json: `npm run build` builds a static export; lint is separately configured and skipped during build. There is no test script declared. Do not describe a build as proof of lint, database, hardware or offline behavior.

This setup authorizes documentation and skill changes only. Do not change app logic, dependencies, schema, environment or runtime configuration as part of setup. Do not run production-reset/backup scripts, migrations, publishing, service installation or device actions merely to inspect the project. Later tasks retain their own user-authorized scope.
