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
- No Vercel/Neon resources, public URL, production secrets, TLS/pooling/runtime grants,
  backup restore rehearsal or operational load verification was provisioned in Cloud.
- Windows DPAPI, real Electron cookie restoration/rotation/logout, GUI, NSIS install/
  upgrade, signing and user-data ACLs require local Windows testing. Existing mocked
  adapter/security tests and the Electron build passed; they do not verify those runtimes.
- Automated Chromium/axe and mobile viewport tests do not establish manual screen-reader,
  200% zoom, actual iOS Safari or native Windows accessibility/runtime behavior.

## Exact next recommended task

**Prepare a Phase 1 staging release for daily use: provision the approved hosted
PostgreSQL and HTTPS app, apply migrations 0000–0006 with separate migration/runtime
roles, configure secrets and controlled accounts, then smoke-test a complete
Start Day → plan → schedule → Focus → capture/process → Close Day → logout cycle
and rehearse backup/restore.**

No staging provisioning or Phase 2 development was started. Native Windows release
verification remains a separate checklist in `deployment.md`. Once release readiness
is verified, the next product phase is Phase 2 — Career + Performance; do not treat
this checkpoint as having implemented it.

## Checkpoint for the next session

### Windows/Electron checkpoint — 2026-10-08

Local Windows branch `windows/desktop-qa` starts from Phase 1 `work` commit
`3a94679`. Added reproducible native Windows DPAPI/cookie-process checks and real
Electron GUI tests; corrected the POSIX-only permission assertion on Windows.
Fixed Electron recovery after a post-startup trusted page load fails, retaining
all existing renderer/origin/TLS/permission protections.

Windows results: production Next/Electron build, TypeScript/lint and 102 existing
tests passed against disposable PostgreSQL fixtures; nine native persistence phases
and three actual Electron GUI scenarios passed. The authenticated desktop exercised
planning, Tasks, schedule, Focus, resize and keyboard dialogs without uncaught
renderer exceptions. An unsigned, differently identified **Life OS QA** NSIS build
installed and launched from its Start-menu shortcut; its loopback HTTPS target is
strictly a test origin, not a production deployment. No production installer,
hosted-session end-to-end verification, upgrade/uninstall execution or signing is
claimed. Native UI control was stopped with Escape during final visual QA.

Cloud was notified of two shared-UI request races (selected date before Start Day,
Resume before Finish Focus); the desktop tests wait for the confirmed server state.
No Phase 2–6 work, second backend, database migration or shared product refactor was
introduced. See `deployment.md`'s dated Windows verification for reproducible
commands, installer limitations and exact release gates. Existing Cloud deployment
preparation continues independently.

The Phase 1 source, reviewed migrations 0005–0006, CI fixture coverage and documentation
are the coherent checkpoint on branch `work`. Begin by reading this file and the
architecture/data-model/deployment docs; preserve the implemented session and owner
boundaries. Repeat fixture checks only against disposable databases. No Phase 1 core
feature is intentionally left as a placeholder; practical constraints and unverified
release behavior are listed above. Complete the staging-release task before relying
on the app for important daily records, and do not infer deployment from a Git push.
