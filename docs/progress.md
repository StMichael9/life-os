# Progress and handoff

## Current phase

**Phase 0 foundation and Phase 1 — Daily Execution Core are implemented and verified
in the isolated environment. Hosting and native Windows release verification remain pending.**

Daily execution now uses real authenticated PostgreSQL records throughout. Today is
the central hub for planning, scheduling, Focus, routines, recommendations and
capture. Phases 2–6 have not been started. Public deployment and native Windows
release verification remain separate tasks; a Git push does not put the app online.

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
- No Vercel/Neon resources, public URL or production secrets were provisioned in Cloud.
  Hosted TLS/pooling/provider grants/load remain unverified. Local real-PG17 role and
  encrypted backup/restore rehearsals now pass; see the operational checkpoint below.
- Windows DPAPI, real Electron cookie restoration/rotation/logout, GUI, NSIS install/
  upgrade, signing and user-data ACLs require local Windows testing. Existing mocked
  adapter/security tests and the Electron build passed; they do not verify those runtimes.
- Automated Chromium/axe and mobile viewport tests do not establish manual screen-reader,
  200% zoom, actual iOS Safari or native Windows accessibility/runtime behavior.

## Hosted operational-readiness checkpoint

**Completed locally:** Vercel monorepo configuration; server-only redacted HTTPS/TLS
configuration validation; separate trusted migration/runtime/operator/read-only backup
roles and transactional grants; migration-ledger and runtime-permission verification;
AES-256-GCM logical backup and guarded restore tooling; actual PG17 restore rehearsal;
production Next HTTPS full-day rehearsal; CI coverage and release/Windows runbooks.
No product-domain redesign, new app migration, Electron changes or Phase 2 work.

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

**Blocked/unverified externally:** Vercel and Neon plugins are installed, but provider
tools are not callable in this Cloud session. Neon app connection is recognized; the
Vercel account connection remains unavailable. No hosted URL, current free-plan eligibility/
quotas, Neon bootstrap/migration/grants/TLS/pooling, production HTTPS workflow, hosted
latency or restore timing is claimed. Native Windows DPAPI/session/NSIS testing belongs
to the separate Local Windows checkout; Cloud does not modify that checkout.

### Verification for this release checkpoint

- Default suite: **102 passed, seven explicitly skipped** (three previous PG-only
  cases plus three operations tests and one HTTPS rehearsal).
- Existing real PG17 auth/Inbox, Direction, Tasks and execution suites: **62 passed**.
- New real PG17 operations: **three passed**; new verified local HTTPS production
  Next daily workflow: **one passed**. Independent disposable fixture databases only.
- Migration generation: no schema drift; all seven committed hashes/timestamps and
  22 application tables verified. **No new migration.**
- Format check, lint, typecheck, production web and Electron builds all passed.
  Browser E2E: **46 passed**, including authenticated desktop/mobile and axe checks.
  The final build and verified local HTTPS rehearsal passed after the config changes.
- Peer checks and production/full dependency audits passed with no known vulnerabilities.
- CI was extended; its remote run has not been observed for this checkpoint.

## Exact next recommended task

**Complete the free-tier hosted Phase 1 release: connect the Vercel account and resume
with callable Vercel/Neon tools, confirm free-plan eligibility without chargeable usage,
provision an isolated Neon17 database with separate roles, migrate/verify 0000–0006,
deploy the configured Vercel web app, create the personal account interactively, verify
the hosted full-day/ownership/session workflow, and activate/rehearse the user's daily
encrypted backup and restore process before relying on the app.**

Follow [release-runbook.md](release-runbook.md). Native Windows testing remains the
separate [Windows handoff](windows-handoff.md). Do not begin Phase 2 during this task.

## Checkpoint for the next session

Continue from the pushed operational-readiness commit on `work`; read this file,
architecture/data-model/deployment and the release runbook. Phase 1 product implementation
is complete in isolation; hosted daily-use readiness is **partial**, not deployed.
Use privileged URLs only in trusted operator processes and the runtime role only in
Vercel. Never run destructive fixtures against hosted/personal data. Complete hosted
acceptance and production backup setup, integrate actual Local Windows evidence when
available, then report the real URL/status. A Git push is not deployment.
