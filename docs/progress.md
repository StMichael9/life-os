# Progress and handoff

## Current phase

**Latest user direction — offline desktop first (2026-10-12):** postpone Vercel and
hosted production. The immediate product must be an installed laptop Electron app
that launches its own local backend/database automatically and works without internet.
The existing Electron shell does NOT yet launch the implemented local backend. The
standalone backend and embedded persistence are component-tested; native packaging
and installed offline acceptance remain incomplete.
Preserve the implemented Phase 1 domains/security while adding local persistence and
packaging. This explicit user direction supersedes earlier online-first assumptions and
the hosted acceptance assignment below. Offline daily-use acceptance is now the Phase 1
release gate; Phase 2 remains pending that gate. No cloud synchronization is claimed.

Cloud/Windows handoff: pause Vercel reauthorization and hosted tests. Cloud prepares
the PostgreSQL-compatible embedded persistence/service boundary; Windows owns secure
local-backend lifecycle, installer, automatic startup and actual disconnected/restart QA.
Keep checkout/branch changes separate. Newly enabled staging operator/backup logins were
returned to NOLOGIN after the scope change; hosted runtime/staging build are retained,
production is still empty, and no personal account/backup scheduler was created.
The user will create their own account and selected another existing backup location;
no account identity/password has been provided and no backup path is invented.

**Phase 0 foundation and Phase 1 — Daily Execution Core are implemented and verified
in isolation. Protected Vercel staging is retained but postponed. Installed offline daily-use
acceptance remains incomplete. Phase 2 is authorized after that gate, not started.**

Daily execution now uses real authenticated PostgreSQL records throughout. Today is
the central hub for planning, scheduling, Focus, routines, recommendations and
capture. Phases 2–6 have not been started. The 2026-10-12 checkpoint below supersedes
earlier paused provider notes. A staged build is not proof of usable hosted workflows.

## Completed features

| Phase 1 area           | Actual behavior                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication / shell | Controlled operator accounts, Argon2id passwords, hashed opaque sessions, expiry/revocation/logout/rotation, CSRF, persistent login limits, shared responsive web/Electron views                                                |
| Direction              | Owner-scoped Seasons, Goals, Milestones and Projects; atomic 100% allocations, one active Season, hierarchy, versions, completion/archive; Goal-form Vision creation; Project priority and real linked-Task counts              |
| Tasks                  | Create/edit/detail/list, status/deadline/duration/ratings/energy, optional owned Project or direct Goal, completion/reopening, stale-edit protection and pagination                                                             |
| Today                  | One bounded verified aggregation, selected account-local date, real Season/allocation strategy, One Thing, Big 3, timeline, Focus, routines, counts, recommendations and Insights                                               |
| Planning               | Exactly one optional primary outcome and up to three deliberate outcomes; optional distinct owned Task links; versioned full-set replacement; independent outcome completion                                                    |
| Start / Close Day      | Optional morning/evening questions, persisted private reflection, confirmation of priorities, recorded objective summary, explicit reopening before plan edits                                                                  |
| Scheduling             | Six block types, owned optional Task links, account-timezone create/edit/remove, responsive timeline, cross-midnight retrieval and transactional overlap rejection                                                              |
| Focus                  | Task or Project/category/custom objective, 25/50/90/custom minutes, running/paused restoration, server timing, pause/resume/finish, outcome/notes and Later capture; adds recorded minutes once to linked Task                  |
| Routines               | Weekday recurrence, create/edit/archive, independent local-day completion/reopening and completion notes; archived completed history retained; reflective practices excluded from execution Insights                            |
| Priority / Insights    | Existing deterministic ranking now uses stored Task assessments, inherited category, active Season allocation, deadline, recorded estimate and energy; explained top candidates; workload/outcomes/Inbox/routine evidence rules |
| Universal capture      | Fast arbitrary text capture from Inbox/Today/Focus/palette; stable retry keys; atomic Task or Vault processing, archive without erasing original text; original captures remain searchable/readable                             |
| Vault / Not Now        | Persisted collection/title/context, edit/archive/restore, pagination and deep links; owned Task/Goal/Project promotion preserves full source context; no Experiment/later-domain implementation                                 |
| Search / commands      | Ctrl/Cmd+K native dialog, keyboard search/navigation, Task creation, Focus and Inbox capture; literal owner-scoped search across all implemented Phase 1 collections                                                            |
| Scripture / thought    | Immutable local-day KJV/original thought mapping, no external API; saves private favorites into Vault with equal-content deduplication; never scored                                                                            |

No fake Task, Focus, spending, health or opportunity metrics are presented. Later-phase
opportunity/financial/health dashboards and dedicated prayer/journal functionality
remain outside this Phase 1 implementation.

## Architecture and security preserved

Node 24 / pnpm 11 strict TypeScript monorepo; Next hosts shared React, Drizzle/pg owns
persistence, services verify opaque sessions and derive owner identity. Browser-safe
packages never import database/server/Node/Electron modules. Existing composite
ownership FKs, Task single-parent constraints, capture provenance and Direction
allocation/version semantics remain. Electron still has sandbox/context isolation,
origin/navigation/certificate/permission restrictions and no preload/IPC.

All new private routes retain no-store, strict shared schemas, 16 KiB streamed JSON,
exact Origin and signed CSRF. Writes additionally compare the UI account precondition
with the verified session. Inbox reads now carry owner stamps and capture uses that
precondition too, closing a cross-tab identity race. UI data/drafts clear on account
change. Native forms retain connection/stale errors and warn before discard/unload.

New execution writes share the per-owner app_user row lock. Per-owner mutation UUID /
SHA-256 receipts return minimal IDs on exact replay and reject changed payloads. Receipt
row IDs are generated separately so different owners can reuse a retry UUID. Planning,
Focus finish, Vault promotion and capture processing commit atomically. Closed plans
require reopening; schedule conflicts and stale versions never silently overwrite.

## Schema / migrations in this run

- `0005_daily_execution.sql`: additive planning version/start/reflection fields,
  schedule/Focus versions, Focus Project/resume fields and Project priority; five new
  tables (`routine`, `routine_completion`, `vault_item`, `focus_interval`,
  `execution_receipt`), bringing the schema to 22 tables. Composite owner FKs,
  one-running-interval/single-Vault-conversion constraints, indexes and updated_at
  triggers accompany them. Focus owner key precedes its interval FK.
- `0006_execution_receipt_keys.sql`: owner-scoped request UUIDs separate from generated
  row IDs; backfill preserves earlier receipt IDs as retry keys before constraints.
- Original migrations 0000–0004 remain unchanged. Seeded upgrade tests preserve plans,
  Big 3, schedule, Focus duration, Task/Project notes and existing links. No original
  content/table is removed and no production migration was applied.

## Entry points

- Today/shared workflows: `packages/app/src/execution.tsx`, `execution-editor.tsx`,
  `command-palette.tsx`; routes `/`, `/schedule`, `/focus`, `/routines`, `/vault`.
- HTTP/services: `packages/api/src/execution.ts`, existing auth/Inbox/Direction/Tasks;
  `apps/web/lib/services.ts`, `/api/execution` commands and `/today`, `/vault`, `/search` reads.
- Persistence: `packages/database/src/execution.ts`, existing repositories, schema and
  reviewed migrations. DTOs/time helpers remain browser-safe in `packages/shared`;
  strict commands in validation, deterministic rules in insights.
- Verification: `execution.test.ts`, `execution-migration.test.ts`, `daily.test.ts`,
  new Direction tests and `tests/execution.spec.ts`; previous suites retained.

## Completed verification

- Formatting, lint (zero warnings), typechecking and production Next/Electron builds
  passed. Migration generation has no schema drift.
- Default unit/integration suite: **99 passed**, three PostgreSQL-only restricted-role
  cases explicitly skipped (102 cases across 18 files). Includes meaningful upgrade,
  authorization, allocation/parent, session, concurrency, timing and retry verification.
- Real isolated **PostgreSQL 17: 62 passed** across four independent fixture databases:
  auth/Inbox 13, Direction 15, Tasks 13, execution 21. Restricted roles exercise actual
  writes/reads and deny account deletion/DDL; provider pooling/TLS/grants remain unverified.
- Production browser suite: **46 passed** (40 authenticated and
  six public; desktop/mobile Chromium). New stories cover planning/closure/reopening,
  timeline/overlap/reload, Focus pause/restoration/outcome/Later, routines, Vault,
  command palette, saved content, ownership/account changes (including a login switch
  during command-capture submission), overflow and axe. The final production build
  and full browser suite were rerun after the local-day scheduling-total correction.
- Peer checks and full/production dependency audits passed with no known vulnerabilities.
- Tests migrate/TRUNCATE only guarded disposable `_tests`/`_e2e` fixtures. No production
  account credentials/data, paid provider, external messages or hosted deployment used.
  CI now provisions the fourth server fixture database and all browser cases; GitHub
  CI itself has not been observed for this change.

## Practical limits and unverified work

- Online-first. Drafts stay only in memory; no offline queue/encrypted durable draft
  storage. A failed request retains its form/retry key; deliberate reload loses unsaved text.
- Today caps 200 Task candidates (plus up to three preserved Big 3 Task links),
  100 blocks/routines/lookup choices and 20 Focus history
  rows; Vault pages 50, search returns ten per implemented collection. Ranking discloses
  its candidate bound; existing Task/Direction lists paginate. No sophisticated search
  index or full-history trend analysis is claimed.
- Timer uses wall-clock running intervals across suspension; pause before stepping away.
  Finished Focus adds rounded minutes to manual actual duration and increments Task version.
  Legacy Focus preserves recorded duration but has no invented intervals/daily timing.
- Task forms reject ambiguous/repeated/skipped DST times rather than silently selecting
  another instant. Account timezone is operator-configured. Scheduling rejects overlap;
  it does not provide external calendar synchronization or recurring calendar events.
- Vision creation/linking exists; a full Vision/category management editor is not built.
  Goal filters on Tasks remain direct; inherited work is viewed via Projects.
- Faith/reflective categories/routines and private narratives are excluded from ranking
  and execution Insights. Dedicated God & Reflection / journal screens belong to Phase 4;
  saved Scripture is usable in Vault now. Financial/health/opportunity cards await their phases.
- Accounts are controlled creation/login/logout only: no public signup/reset/recovery,
  verification email, invitations, all-session revocation, export/deletion or audit log.
  Operator-assisted provisioning is required for daily use; recovery is not fabricated.
- Mutation receipts retain retry history indefinitely; login limits have a shared global
  budget and no scheduled expired-session cleanup. Monitor storage/free-tier limits.
- Vercel/Neon staging now exists; production remains empty and has no secrets/accounts.
  The restricted staging runtime passed the deployment build gate; hosted browser
  workflows/load and PG18 backup/restore remain unverified. See the dated checkpoint below.
- Windows DPAPI, real Electron cookie restoration/rotation/logout, GUI, NSIS install/
  upgrade, signing and user-data ACLs require local Windows testing. Existing mocked
  adapter/security tests and the Electron build passed; they do not verify those runtimes.
- Automated Chromium/axe and mobile viewport tests do not establish manual screen-reader,
  200% zoom, actual iOS Safari or native Windows accessibility/runtime behavior.

## Hosted operational-readiness checkpoint — 2026-10-08 (historical)

**Completed locally:** Vercel monorepo configuration; server-only redacted HTTPS/TLS
configuration validation; separate trusted migration/runtime/operator/read-only backup
roles and transactional grants; migration-ledger and runtime-permission verification;
AES-256-GCM logical backup and guarded restore tooling; actual PG17 restore rehearsal;
production Next HTTPS full-day rehearsal; CI coverage and release/Windows runbooks.
No product-domain redesign, new app migration, Electron changes or Phase 2 work.
Windows QA identified an immediate Selected day / Start Day race; shared web code now
disables date-sensitive actions and mutation paths until loaded data matches selection.

The restricted runtime performs real login → Start Day → plan → schedule → Focus
pause/resume/finish → retry-safe capture/process → Close Day → logout. Local HTTPS
verification uses a specifically trusted ephemeral certificate, not a TLS bypass.
CSRF failures, account spoofing, cross-user reads and revoked-token replay fail.
Backup tests restore private capture and Argon2id login, omit live auth/session state,
reapply and verify grants, and refuse wrong keys, tampering, permissive key files,
nonempty/incorrect targets and overwriting archives. Runtime cannot DDL, mutate password
hashes, delete/create accounts, TRUNCATE or assume the migration role.

**Prepared, not operationally provisioned:** production environment settings, controlled
personal account procedure, daily encrypted backup schedule/offsite/key storage procedure,
hosted acceptance checklist and separate Local Windows instructions. The fixture proves
implementation; no personal credentials/data or actual backup storage job was created.

**Provider access now available:** Vercel account is connected on Hobby. Project
`life-os` (`prj_AIPTfML0oCOdtfRaoNenxOX8wYa0`) exists with apps/web, Node24,
workspace inclusion and Ohio (`cle1`) region. It has no deployment, installed application
secrets or verified URL. Automatic Git builds are deliberately skipped with the project
Ignored Build Step `exit 0`; remove this only when resuming the reviewed release. No paid plan/features were enabled.

The user selected Neon Free project `lively-surf-21544686` (Life-OS), PostgreSQL **18.6**,
AWS Ohio. Production branch `br-super-star-b5edgceo` remains empty (**zero public tables**)
and has no personal account/data. The separate `staging-release` branch
`br-fragrant-feather-b51tx7bt` received reviewed migrations 0000–0006 and explicit grants;
all seven hashes/timestamps match, and all 22 public tables belong to life_os_migrator.
Remote SQL ran through the authenticated Neon tools, not the blocked Cloud CLI.
Compute max/min was capped at 0.25 CU and pooling enabled on the production endpoint.
Changing its suspend interval is rejected by this Free account; the API reports zero.
Do not claim verified idle suspension or hosted uptime. Branch creation stays within
its reported ten-branch limit; monitor the actual Free allowance.

**Paused safely at the user's request:** no web deployment or production migration
was started. The staging runtime remains **NOLOGIN**: Neon's password-reset API rejects
SQL-created roles without passwords. Provision a native restricted password credential
securely and verify standalone login/grants/TLS before deploying. No runtime/secret was
installed in Vercel. Both Neon bootstrap and local PG17 checks identified/fixed the
PG16+ need for explicit administrator SET permission and a migrator-local default-
privilege change; runtime still cannot assume the migrator.

Neon CLI 8.0.12, project-local skills and project-scoped OAuth MCP config are installed.
The verified project/production branch is pinned in local gitignored `.neon` using the
CLI context writer. `neon.ts` is exactly the requested empty defineConfig({}), with
@neon/config in the frozen lockfile. Cloud's network policy blocks direct Neon API
access: CLI login/link/deploy is **not verified/successful**. Authenticated MCP checks
verified project/branch identity; no API key, account-wide credential or .env export
was generated. Empty configuration enables no Neon Auth/Functions/Storage/AI services.

The separate Windows checkpoint is pushed as **2963ae02785ac7ace884a51fc1f1bb6f01d38ee5**
on `windows/desktop-qa`, based on 3a94679. It is not merged into work. It fixes trusted
main-frame offline retry and adds reproducible test:native (nine native DPAPI/cookie
processes) and test:gui (three real Electron scenarios). That chat reports all 102
existing tests, formatting/lint/typecheck and Next/Electron builds passing on Windows,
plus QA NSIS0.1.0 built/installed with shortcuts/offline modal observed. Hosted origin/
session acceptance, final signing/icon, upgrade/uninstall remain unverified. These are
reported Local results, not independent Cloud verification. Reconcile its additive docs
with these newer Cloud notes before merging. The shared day-selection race is fixed in
Cloud; an additional reported Focus-resume race requires its reproduction/details to be
reviewed. Both chats are paused at the user's request; Cloud did not alter its checkout.

### Verification for this release checkpoint

- Default suite: **102 passed, seven explicitly skipped** (three previous PG-only
  cases plus three operations tests and one HTTPS rehearsal).
- Existing real PG17 auth/Inbox, Direction, Tasks and execution suites: **62 passed**.
- New real PG17 operations: **three passed**; new verified local HTTPS production
  Next daily workflow: **one passed**. Independent disposable fixture databases only.
- Migration generation: no schema drift; all seven committed hashes/timestamps and
  22 application tables verified. **No new migration.**
- Format check, lint, typecheck, production web and Electron builds all passed.
  Browser E2E: **48 passed**, including authenticated desktop/mobile and axe checks.
  New delayed-request tests prove immediate date changes cannot open/save the old
  day and returning to Today also blocks date-sensitive actions.
  The final build and verified local HTTPS rehearsal passed after the config changes.
- Peer checks and production/full dependency audits passed with no known vulnerabilities.
- CI was extended; its remote run has not been observed for this checkpoint.

## Resumed release checkpoint — 2026-10-12

**Completed:** resumed from 67811df; reviewed the required architecture/data-model/
deployment documents; retained custom opaque authentication and all ownership rules.
Neon staging still has seven migrations and 22 migrator-owned tables. A private random
runtime password was provisioned through authenticated provider tooling; this provider
rejects supplied SCRAM verifiers, so no unsupported verifier workaround was used.
The staging runtime is now LOGIN without administrator flags or migration membership;
operator/migrator/backup remain NOLOGIN. Staging pooling is enabled at 0.25 CU min/max.
Only preview-scoped DATABASE_URL, independent AUTH_SECRET and exact APP_ORIGIN were
installed in Vercel; no operator/provider credentials were installed in the web runtime.
The installed-variable inventory confirms all three target preview only, with the
database URL and session secret marked sensitive. Redacted hosted configuration
validation passed. The temporary local provisioning file was removed after deployment.

Vercel deployment dpl_7wPrhVgDWdGsb2mdrZyTnu2vRZ59 is **READY**, explicitly target
staging, built from ba9de1709b41c3c0aa6ec8f72baf7b7c4b457349 in cle1, including
the Focus transition fix. It supersedes the first successful 67811df staging build.
Its committed
build command requires the standalone runtime permission/TLS gate before Next build.
The stable configured origin is https://life-os-git-work-stmichael9s-projects.vercel.app;
the immutable build URL is https://life-lm8l0mn7w-stmichael9s-projects.vercel.app.
Both are protected staging, not an accepted production release. The configured origin
must be used for login/CSRF, not an arbitrary alias. There are zero staging accounts,
and production still has zero public tables. No personal data or paid plan was created.
Automatic Git builds were returned to Ignored Build Step exit 0 after the explicit build.

**Concrete product fix:** Focus controls now wait for a verified snapshot newer than
the just-saved session version. Previously Resume could save successfully while Finish
opened a dialog with the previous version. A delayed-response desktop/mobile test checks
that Resume/Finish remain disabled until the authoritative state arrives. Refresh failure
keeps controls guarded until refresh/reload, with no fabricated timer state. This fix does
not claim every detail of the separate Windows report has been independently reproduced.

**Blocked / unverified:** the user chose to continue setup and document verification as
blocked instead of changing Cloud networking. The enforced policy allows package hosts,
not direct Neon TCP or *.vercel.app browser traffic. No network bypass was attempted.
Vercel protected-fetch and build-log tools additionally return 403 for the connected
stmichael9s-projects scope; the Cloud CLI has no authenticated fallback. Reauthorize the
Vercel connection for this team/project, or use an already authorized trusted machine.
Do not disable deployment protection or install administrator URLs to bypass these gates.
Hosted full-day workflow, real cookies/rotation/CSRF/isolation/persistence, HTTP security
headers, Neon PG18 encrypted restore, offsite backup scheduling and controlled personal
account creation remain incomplete. A READY status and local tests cannot establish them.

The separate Windows branch 2963ae0 remains unmerged and its checkout untouched.
Its reported native/GUI/QA NSIS results remain distinct from Cloud evidence; hosted
Electron acceptance and signing/icon/upgrade/uninstall are still pending.

**Verification this run:** formatting/lint/typecheck and production Next/Electron builds
passed; all server fixture URLs enabled: 105 passed with four release tests separately
opted out. The three actual PG17 encrypted backup/restore tests and one local verified
HTTPS full-day rehearsal passed separately. Migration generation reports no drift/new
migration; dependency audits report no known vulnerabilities and frozen lockfile/strict
peer/supply-chain verification passed (590 entries). Browser E2E: **48 passed**,
desktop/mobile against disposable PostgreSQL,
including the delayed Focus response, ownership, responsive layout and axe checks.
An initial runner attempt lacked the bundled Chromium binary; the installed system
Chromium was selected through the existing supported environment option. The first
delayed-response fixture intercepted the preceding capture refresh; it was corrected
to wait for capture completion before delaying Resume, then all browser cases passed.

**Phase 2 condition:** the user authorized beginning Career + Performance after Phase 1
is finished. Hosted acceptance is still blocked, so no Phase 2 tables/pages were created.
After that acceptance, begin the Skills → Practice Problems → Attempts → Spaced Reviews
vertical slice using the planned normalized models, shared schemas and owner-scoped
service/repository boundaries. Do not jump into Wealth/Business or paid APIs.

## Offline backend checkpoint — 2026-10-12

**Completed components:** filesystem-backed PGlite with private directories, exclusive
engine lease, exact migration fingerprints and awaited close; shared repositories and
seven migrations retained without schema drift. Next standalone includes SQL/WASM/static
resources and a private parent-channel HTTPS entry binding only 127.0.0.1. Readiness
initializes the database before the window may load; stop drains requests and closes it.
SSR/API module graphs share one private process-global service promise, fixing duplicate
engine initialization that hid first-run setup and caused streamed login redirects.
Local first-account setup uses Argon2id, persistent limits, CSRF/Origin, a main-only
capability and transactional first-user guard. Hosted registration remains closed.

**Verification:** 108 default tests passed, eight explicitly guarded skips. The opt-in
packaged-backend test passed real loopback TLS, authenticated SSR, a complete daily API
workflow, owner isolation, retry-safe capture, shutdown/restart durability and logout
replay, encrypted IPC backup/candidate restore, fresh login and startup cancellation. The forced-process-stop
recovery test preserves committed data; wrong keys/tampering/migration mismatch/live
leases are rejected. Browser E2E passed 48 before the service-registry correction;
its rerun passed 47, with one desktop intercepted account-switch case timing out.
The mobile equivalent passed; a focused rerun is underway. Do not mark that gate
clean until its result is recorded.
The real PostgreSQL 17 domain suites also pass: 62 tests. Typecheck, lint, production
web/Electron builds, frozen lockfile/peer checks and dependency audits passed. No new
migration was added. CI checks are prepared; its remote run is not claimed.

**Partial / unverified:** Electron does not yet start this backend; native utilityProcess,
pinned certificate/key persistence, setup capability injection, Windows ACLs and offline
NSIS installation must be integrated and tested locally. Guarded recovery and encrypted
embedded backup/candidate restore components now pass
Cloud tests, but native key export/import, archive picker/writing and restore cutover
remain unimplemented. Live database files rely on private OS directories/disk privacy; safeStorage is not database-at-rest encryption. No offline
release or Phase 2 completion is claimed. See completion-report.md and offline-desktop.md.

The Windows lead checkpoint is pushed **86e25f1** on windows/desktop-first-qa, based on
d4920db, with a clean tree. It reports a cookie notification/shutdown-drain fix,
deterministic regression and two native nine-phase runs passing. This commit is not
merged; Cloud has not edited its checkout, session-persistence.ts or native fixtures.
The user subsequently resumed it for one bounded offline integration. Backend work
checkpoint 605d779 and exact selfsigned 5.5.0 dependency checkpoint 191755f are pushed;
the private entry/protocol is in offline-desktop.md. Do not continuously poll it or
resume further work without a concrete native need.

Earlier hosted coordination sections are historical and superseded. Staging operator/
backup logins are back to NOLOGIN, automatic Vercel Git builds remain ignored (exit 0),
production remains empty, and no personal account or backup location was fabricated.

## Exact next recommended task

**Finish the offline Phase 1 release: integrate the private standalone backend into
Electron using offline-desktop.md, connect its tested recovery/backup protocol to
native key storage/archive selection/guarded cutover, then perform a bounded Windows
disconnected install/full-day/restart/
security/recovery acceptance run. After those gates pass, begin Phase 2 with Skills →
Practice Problems → Attempts → Spaced Reviews, then the remaining Career/Performance
requirements. Do not resume hosted deployment as a prerequisite for offline use.**

## Checkpoint for the next session

### Local Windows direction and safe pause — 2026-10-12

The user paused hosted acceptance and confirmed coordination toward desktop-first
offline use, then asked this Windows chat to pause safely. Local branch
`windows/desktop-first-qa` is based on latest fetched `work` (`d4920db`) and carries
forward the earlier Electron-only changes without overwriting newer Cloud notes.
Staging HTTPS was reachable but redirected to protected Vercel SSO; connector access
returned team-scope 403. No hosted acceptance or production change occurred; the
temporary staging probe is stopped. Vercel reauthorization is no longer requested
for the immediate offline direction.

Fixed the session shutdown-flush gap revealed by a native rerun: flush now persists
the authoritative native cookie without waiting for its change notification, then
drains additional writes. Desktop unit regressions, repeated native nine-phase runs,
typecheck and lint passed. See the dated Windows handoff for limits and file ownership.
Cloud will prepare local backend/persistence interfaces; Windows will integrate
packaged automatic startup and verify native offline operation after that handoff.
No local backend redesign or offline-ready installer is claimed at this pause.

Read AGENTS, this file, architecture/data-model/deployment, offline-desktop.md and
completion-report.md. Preserve shared auth/ownership and the renderer sandbox. Cloud
owns backend/database/shared UI; Local owns apps/desktop/native QA, on demand. The
standalone backend protocol and resources are implemented and tested in Cloud, while
installed offline readiness remains partial. Do not equate Node-fork component tests
with Electron utilityProcess, DPAPI, Windows ACL or NSIS verification. Hosted resources
are postponed and are not offline dependencies. Keep the final done/remaining report
current and distinguish verified, partial and unverified work.
