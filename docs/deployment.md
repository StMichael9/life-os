# Deployment and operations

## Current state

Authenticated Phase 1 daily execution works in the production build against isolated PostgreSQL.
Vercel Hobby project life-os and the user-selected Neon Free/PG18 project now exist.
Neon staging received migrations/grants; its production branch remains empty. No web
deployment, personal account, signed installer or Vercel application secret exists.
Work is paused at the user's request. See progress for exact IDs and pending credentials. Vercel monorepo configuration, redacted
configuration validation, separate-role SQL, migration/grant verification and encrypted
backup/restore commands now exist. Real PG17 operations and a verified local HTTPS
production-Next workflow are rehearsed; hosted provider behavior is still unverified.
Follow [release-runbook.md](release-runbook.md) for exact setup and acceptance steps. The public Today preview remains
separate from the authenticated daily workspace. The separate Windows chat reports native synthetic DPAPI/cookie and GUI security checks
passing; installer and real hosted-backend verification remain incomplete.

## Environment separation

| Environment     | App                                | Database                                                         | Credentials                                         |
| --------------- | ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| Development     | Next dev at loopback port 3000     | Isolated local PostgreSQL for all authenticated Phase 1 features | Local dev only                                      |
| Test            | Production Next build on loopback  | PGlite plus disposable PostgreSQL 17 for auth and browser tests  | Fixtures only                                       |
| Preview/staging | Separate Vercel project/deployment | Separate Neon branch/database                                    | Independent sessions/secrets                        |
| Production      | Stable HTTPS origin                | Dedicated Neon database                                          | Restricted runtime role and separate migration role |

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
3. Set the server-only pooled `DATABASE_URL`,
   with `sslmode=verify-full` and system CA certificate/hostname validation. Set `APP_ORIGIN` to the
   exact HTTPS deployment origin (no path or trailing slash) for CSRF checks.
   Set a unique random `AUTH_SECRET` of at least 32 bytes; generate with
   `openssl rand -base64 48`. Leave `AUTH_ALLOW_HTTP_LOOPBACK` unset in deployment.
   A secret change invalidates existing CSRF signatures and rotation recovery;
   plan session revocation when rotating it.
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
configuration is not evidence of a tested installer. The separate Local Windows
chat/check-out follows [windows-handoff.md](windows-handoff.md). Packaged builds refuse the
development HTTP URL. Use a release-only icon, signing credentials and supported
Electron version. Test installation, start, offline retry, upgrade, logout, token
rotation, DPAPI storage and deletion on Windows before shipping. The memory-only cookie partition is restored from a validated main-process
`safeStorage` ciphertext file for the embedded HTTPS origin. OS encryption must
be available; Linux `basic_text` and development HTTP are nonpersistent. There is
no plaintext fallback, tray, auto-update, native notification or app lock.
Do not enable auto-update until signed metadata and rollback behavior are designed.

## Security and privacy

The web application enforces per-response nonced script CSP, frame denial, MIME sniffing
protection, no-referrer, and denies camera/microphone/location. CSS permits inline
styles to support framework rendering; production scripts do not permit unsafe-eval.
Production HTTPS gets HSTS. Node/Electron/database packages are kept out of shared
renderer imports. Browsers use HTTPS only in production and receive no database
credential. The Electron shell blocks navigation outside the embedded origin,
window creation, webviews and permissions; there is no privileged IPC.

Session encryption and app lock are separate: DPAPI protects stored tokens at rest,
not a signed-in unlocked workstation. Do not claim end-to-end encryption. Hosted
PostgreSQL administrators can access application data; encryption-at-rest and strict
service access do not change that. Export and account deletion remain missing; plan these flows and backups before
relying on this application for important private data.

## Backups and recovery design

Before storing important private data: verify actual provider restore retention,
keep encrypted logical exports outside the active database, restrict export access,
and rehearse restoration into a separate database. A free tier may offer little or
no point-in-time recovery. Target a daily encrypted backup (24-hour RPO) and restore
within one day (24-hour RTO), but these are **unverified targets**, not guarantees.
The encrypted logical backup/restore implementation is tested against local PG17,
including restored account login, private capture recovery, auth-state exclusion and
tampering/nonempty-target refusal. Choose actual storage and scheduling only after
confirming cost and access requirements; follow the release runbook.

Migration practice: take a verified backup, apply on a staging branch, verify
constraints and application compatibility, then deploy an additive migration before
code depending on it. For destructive changes use expand/migrate/contract across
releases. Restore drills verify credentials, schema, record counts, ownership and
recent sample entries. Never send raw journals, prayers or finances to CI artifacts.
No automated production backup job/offsite store exists yet. Operator `pnpm backup`
and guarded `pnpm restore` commands exist; keys and operations URLs never enter Vercel.

## Initialize controlled accounts

Export `MIGRATION_DATABASE_URL` for migrations; use `DATABASE_URL` only for the
intended runtime or temporarily for the controlled account operator. Set `AUTH_SECRET`
and `APP_ORIGIN` for the intended environment.
Apply migrations with the separate DDL credential, then use an operator credential
with permission to insert `app_user` and `auth_credential`:

```sh
pnpm release:migrate
# Apply ops/postgres/grants.sql as the migrator, then use the operator DATABASE_URL:
pnpm account:create
```

The CLI requires a terminal, hides password input and confirms it; it takes no
password argv/env option. Do not use production credentials in test commands or
shell history. Do not store account passwords in `.env` or CI. No registration,
invitation, password-reset or email-verification route exists. The operator must
securely deliver the initial password; recovery currently requires an additional
implementation, not editing a hash manually.

Runtime needs SELECT on `app_user` and `auth_credential`; SELECT/INSERT on `vision`;
SELECT/INSERT/UPDATE on `auth_session`, `season`, `goal`, `milestone`, `project` and `task`;
SELECT/INSERT/UPDATE/DELETE on `auth_rate_limit`; SELECT/INSERT on `inbox_item` and
`category`; additionally UPDATE(processed_at) on `inbox_item` for conversion; SELECT/INSERT/DELETE on `season_allocation`; and public schema USAGE.
Direction and Task transactions SELECT the owner's `app_user` row FOR UPDATE without changing
it. PostgreSQL requires an UPDATE privilege for this lock; grant **UPDATE(id)** on
`app_user`, not general profile/credential writes. Give the operator separate INSERT
permissions for controlled account creation. Keep DDL, TRUNCATE, credential writes,
unrelated record deletion and later-domain writes out of the deployed runtime role.
Phase 1 additionally needs SELECT/INSERT/UPDATE on `daily_plan`, `daily_big_three`,
`schedule_block`, `focus_session`, `focus_interval`, `routine`, `routine_completion`
and `vault_item`; DELETE only on `daily_big_three`, `schedule_block` and
`routine_completion` for explicit replacements/removal/reopening.
`execution_receipt` needs SELECT/INSERT, not DELETE/UPDATE. Focus completion needs
Task UPDATE for actual duration/version. Vault promotion needs existing Goal/Project
INSERT. Inbox archive/conversion keeps original text and only updates processed_at.

Isolated PostgreSQL 17 tests exercise Direction, Task and daily execution grants via SET LOCAL ROLE,
including authenticated save/activation/read/isolation and denial of account creation
and DDL; the Task role also cannot delete captures. This verifies SQL privileges locally, not provider login/TLS/pooling or actual
staging grants. Provision and verify the intended login role on staging before
production. RLS is not enabled.

Migration 0002 rounds Inbox created timestamps to milliseconds, adds retry keys and
expires pre-existing sessions at migration time. Back up and apply to staging first.
If release validation fails, roll back the application while keeping additive
columns. Restore a rehearsed backup into a separate database if original timestamp
precision is needed; do not drop columns or reverse a migration in place without
a recovery plan. Migration 0003 adds version columns to the existing four Direction tables. Deploy
it before the Direction code; no destructive rollback is needed for old code. A
pre-0003 upgrade test verifies preservation of notes, dates and hierarchy links;
other migration tests also exercise fresh databases. Migration 0004 adds Task
versions/priority/completion and owned conversion provenance. Its SQL adds the Inbox
owner key before the source FK. Apply before Task code. A seeded pre-0004 upgrade
test preserves captures, Task notes, due instants, durations and Project links.
Migration 0005 adds the five daily execution tables and versioned planning/schedule/
Focus fields plus Project priority. Migration 0006 separates per-owner retry keys
from generated receipt row IDs; it backfills old receipts before enforcing uniqueness.
Apply both before the daily execution code. A seeded pre-0005 upgrade preserves
existing plans, outcomes, schedule, Focus durations and Project notes. An isolated
PostgreSQL upgrade also applies 0006 to existing receipts. Roll back code while
retaining additive schema if needed; do not erase planning/reflection history.
No production deployment or destructive rollback was performed.

## Verification commands

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:generate
pnpm build
pnpm peers check
pnpm audit --prod --audit-level=high
```

`pnpm test` includes original migration/constraint tests plus auth, HTTP and Electron
adapter tests, applying the committed migrations to in-memory PGlite. To repeat on
real PostgreSQL, create five **disposable empty databases** ending in `_tests` and
`_e2e` (auth, Direction, Tasks and daily execution use separate fixture databases), then export fixture-only URLs:

```sh
export LIFE_OS_TEST_DATABASE_URL='postgresql://fixture_user:fixture_password@127.0.0.1:5432/life_os_auth_tests'
export LIFE_OS_DIRECTION_TEST_DATABASE_URL='postgresql://fixture_user:fixture_password@127.0.0.1:5432/life_os_direction_tests'
export LIFE_OS_TASKS_TEST_DATABASE_URL='postgresql://fixture_user:fixture_password@127.0.0.1:5432/life_os_tasks_tests'
export LIFE_OS_EXECUTION_TEST_DATABASE_URL='postgresql://fixture_user:fixture_password@127.0.0.1:5432/life_os_execution_tests'
export LIFE_OS_E2E_DATABASE_URL='postgresql://fixture_user:fixture_password@127.0.0.1:5432/life_os_e2e'
pnpm exec vitest run packages/api/src/auth-inbox.test.ts
pnpm exec vitest run packages/api/src/direction.test.ts
pnpm exec vitest run packages/api/src/tasks.test.ts
pnpm exec vitest run packages/api/src/execution.test.ts
pnpm exec playwright install chromium
pnpm test:e2e
```

All four server suites migrate and **TRUNCATE fixtures**; never point them at important data.
Suffix guards are an extra check, not permission to use an existing data-bearing DB.
Browser fixture accounts and secrets are test-only, internal imports never exposed
through app routes. Without the E2E URL the 40 authenticated browser cases
explicitly skip; the six public-preview cases still run. The three restricted-role unit
cases are PostgreSQL-only and skip in the default PGlite run. CI provisions PostgreSQL 17
and runs all 46 browser cases. A production build must precede browser tests. Use
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for an installed Chromium if needed.

Local Cloud verification used PostgreSQL 17 in a disposable container. This verifies
actual SQL, transactions, locking, ownership, restricted Direction/Task/execution grants and persistence; it does not verify
Neon pooled connections, production TLS/provider roles, provider quotas or hosted restore operations.
Encrypted logical backup/restore is now verified against separate local PG17 fixture databases.
Mobile checks use Chromium with an iPhone viewport, not iOS Safari.

### Required local Windows checks (not performed in Cloud)

- Launch Electron against staging HTTPS and verify the same account/data as web.
- Confirm native `safeStorage` encryption availability and protected user-data ACLs;
  inspect stored files for absence of plaintext session tokens or capture content.
- Restart, exercise rotation after 15 minutes, and verify restoration of the latest
  session. Logout must remove ciphertext and prevent reuse/restart authentication.
- Corrupt/expire the ciphertext and verify a sign-in prompt; unavailable OS encryption
  must require sign-in after restart without creating any plaintext fallback.
- Verify sandbox, context isolation, Node denial, blocked foreign navigation/windows,
  certificate failures, denied permissions, offline retry and shutdown persistence.
- Test NSIS install/upgrade/uninstall, shortcuts, signing and supported Windows versions.

Mocked encryption/cookie adapters and a built main bundle are not proof of DPAPI,
Electron native cookie behavior or NSIS installation. No such verification is claimed.

In a managed sandbox, pass writable cache/store paths to installation as needed:
`XDG_CACHE_HOME=/tmp/life-os-cache XDG_DATA_HOME=/tmp/life-os-data pnpm install
--store-dir /tmp/life-os-pnpm-store`. For Electron downloads through the configured
proxy on Node 24, `NODE_USE_ENV_PROXY=1` preserves that proxy route. These are
workspace operational settings, not product runtime requirements.

## Phase 1 practical daily use

Once hosted HTTPS, database migrations/runtime grants, server secrets and a controlled
account are configured, use Today to choose a local day, Start Day, set One Thing /
Big 3, protect blocks, Focus on linked work, check routines and Close Day. Process
Inbox into Tasks or Vault / Not Now; search/navigation/capture use Ctrl/Cmd+K.
No paid data provider, Redis, LLM or external calendar is required.

Practical limits: this is online-first; unsaved memory drafts disappear on reload.
Timer time continues while running, including while the browser is suspended: pause
before stepping away and finish intentionally. Historical Focus intervals respect
local-day boundaries; legacy unsegmented Focus records do not invent daily timing.
Direction/Task histories and Vault paginate; Today bounds its candidate/choice lists.
Overlapping blocks and ambiguous repeated/skipped DST wall times are rejected with
feedback. Reflections and saved Scripture are private and never productivity-scored.
Mutation receipts currently retain retry history indefinitely; monitor storage under
free-tier quotas. Staging latency, indexes under large real datasets, hosted backup scheduling/recovery
and manual assistive-technology testing are release work, not verified production facts.
