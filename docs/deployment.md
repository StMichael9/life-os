# Deployment and operations

## Current state

Local source, tests, web production build and Electron bundle are available. No
Vercel project, Neon database, live application, signed installer or credential has
been provisioned by this run. The public foundation preview contains no private data.
Do not deploy personal-data functionality before authenticated ownership checks,
CSRF, rate limits and session recovery have been implemented and tested.

## Environment separation

| Environment     | App                                | Database                                                           | Credentials                                         |
| --------------- | ---------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| Development     | Next dev at loopback port 3000     | Optional isolated local PostgreSQL                                 | Local dev only                                      |
| Test            | Production Next build on loopback  | PGlite for migration suite; separate PostgreSQL for staging checks | Fixtures only                                       |
| Preview/staging | Separate Vercel project/deployment | Separate Neon branch/database                                      | Independent sessions/secrets                        |
| Production      | Stable HTTPS origin                | Dedicated Neon database                                            | Restricted runtime role and separate migration role |

Never reuse production cookies or databases in preview deployments. Environment
variables belong to the server/deployment platform, never source control. No
`NEXT_PUBLIC_DATABASE_URL`. The root `.env.example` describes variables; shell
migration commands require exported variables and do not implicitly load a file.

## Web / API target

Use a personal-use Vercel tier if eligible and a Neon free tier for PostgreSQL.
Their quotas and terms can change; verify current eligibility, region, database
size, compute hours, connection limits and backup retention before release. No
paid API is required by the code. A stable default hosting subdomain is sufficient;
a custom domain and Windows code signing may have separate costs. Avoid promising
zero cost beyond realistic personal usage and provider limits.

Suggested Vercel configuration:

1. Import the repository; use `apps/web` as project root and enable access to files
   outside that directory for the monorepo.
2. Use Node 24 and the pinned pnpm version. Install from the workspace root with the
   frozen lockfile; build command `pnpm --filter @life-os/web build` from the root,
   or `pnpm build` when Vercel's current directory is `apps/web`.
3. Set the server-only pooled `DATABASE_URL` once authenticated APIs are introduced,
   using provider-recommended TLS certificate validation. Set `APP_ORIGIN` to the
   exact HTTPS deployment origin for CSRF checks in the auth slice.
4. Apply reviewed migrations once through a controlled release step with a separate
   DDL credential; never race migrations from web requests or every server instance.
   Prefer a direct migration connection and a pooled runtime connection.
5. Check HTTPS, nonced CSP, no-store private responses, authentication, multi-user
   isolation, and browser/desktop login before enabling real personal data.

The code uses portable Next.js and standard PostgreSQL, without Vercel-specific
state or Neon-specific schema. Migrate hosting by moving the app build, exporting
PostgreSQL and updating environment variables. No local database is packaged in
Electron. Serverless connections use a small pool per warm instance; validate pool
behavior with actual provider limits before release.

## Electron / Windows

Development: run the web dev server, then `pnpm desktop:dev`. Electron 44 distributes
an explicit binary installer: if needed, run `pnpm --filter @life-os/desktop exec
install-electron` once on the development machine. Windows end users will run the
installed application, never these commands.

On a Windows build runner, embed the deployed origin and package:

```powershell
$env:LIFE_OS_WEB_URL = 'https://your-life-os-host.example'
pnpm --filter @life-os/desktop package:win
```

`electron-builder.yml` targets NSIS and creates Start-menu/desktop shortcuts. This
configuration is not evidence of a tested installer. Packaged builds refuse the
development HTTP URL. Use a release-only icon, signing credentials and supported
Electron version. Test installation, start, offline retry, upgrade, logout, token
rotation, DPAPI storage and deletion on Windows before shipping. The foundation
has memory-only sessions, no tray, auto-update, native notifications or app lock.
Do not enable auto-update until signed metadata and rollback behavior are designed.

## Security and privacy

The web preview enforces per-response nonced script CSP, frame denial, MIME sniffing
protection, no-referrer, and denies camera/microphone/location. CSS permits inline
styles to support framework rendering; production scripts do not permit unsafe-eval.
Production HTTPS gets HSTS. Node/Electron/database packages are kept out of shared
renderer imports. Browsers use HTTPS only in production and receive no database
credential. The Electron shell blocks navigation outside the embedded origin,
window creation, webviews and permissions; there is no privileged IPC.

Session encryption and app lock are separate: DPAPI protects stored tokens at rest,
not a signed-in unlocked workstation. Do not claim end-to-end encryption. Hosted
PostgreSQL administrators can access application data; encryption-at-rest and strict
service access do not change that. Export and account deletion need authenticated,
explicit flows before real private data is accumulated.

## Backups and recovery design

Before storing important private data: verify actual provider restore retention,
keep encrypted logical exports outside the active database, restrict export access,
and rehearse restoration into a separate database. A free tier may offer little or
no point-in-time recovery. Target a daily encrypted backup (24-hour RPO) and restore
within one day (24-hour RTO), but these are **unverified targets**, not guarantees.
Choose storage and scheduling only after confirming cost and access requirements.

Migration practice: take a verified backup, apply on a staging branch, verify
constraints and application compatibility, then deploy an additive migration before
code depending on it. For destructive changes use expand/migrate/contract across
releases. Restore drills verify credentials, schema, record counts, ownership and
recent sample entries. Never send raw journals, prayers or finances to CI artifacts.
No automated production backup/export job exists yet.

## Verification commands

`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
`pnpm test:e2e` run in CI. PGlite validates real migrations without a paid database.
Browser tests use the built app at desktop/mobile widths, local midnight transitions,
CSP-compatible hydration and axe WCAG checks. The mobile test uses Chromium with
an iPhone viewport; actual iOS Safari and Windows Electron still require testing.

In a managed sandbox, pass writable cache/store paths to installation as needed:
`XDG_CACHE_HOME=/tmp/life-os-cache XDG_DATA_HOME=/tmp/life-os-data pnpm install
--store-dir /tmp/life-os-pnpm-store`. For Electron downloads through the configured
proxy on Node 24, `NODE_USE_ENV_PROXY=1` preserves that proxy route. These are
workspace operational settings, not product runtime requirements.
