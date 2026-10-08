# Progress and handoff

## Current phase

**Phase 0 foundation and Phase 1 Inbox, Direction and Tasks slices implemented.**
Private workflows now include owner-only capture/list and Task conversion, Seasons,
Goals, Milestones, Projects and persisted Tasks. Authenticated Today shows the
persisted active Season; anonymous Today and the remaining daily-planning cards
stay clearly labeled guidance. Full Today planning, Focus, recovery/reset and later
private domains remain deferred.

## Architecture retained

pnpm 11 / Node 24 strict TypeScript monorepo. Next.js hosts shared React views;
sandboxed Electron loads the same hosted origin and accounts. Drizzle repositories
use PostgreSQL; services derive ownership from verified sessions. Browser packages
cannot import server, database, Node or Electron dependencies. Existing semantic
CSS tokens, local-day logic, deterministic insights and composite ownership FKs
remain. See `architecture.md`, `data-model.md` and `deployment.md` for contracts.

## Completed

- Preserved the original specification, public Today preview, immutable v1 Scripture/
  thought mapping, timezone dialog, deterministic priority/insight rules and all
  existing tests. These later-domain rules are still not connected to private UI.
- Added controlled operator account creation through interactive `pnpm account:create`;
  no public signup route. Shared validation normalizes email, validates timezone,
  and bounds passwords. Argon2id uses 19,456 KiB, two iterations and one lane.
- Added real 256-bit opaque sessions with SHA-256 hashes in PostgreSQL, absolute
  30-day and idle seven-day expiry, server revocation and logout. Transactional
  rotation occurs at most every 15 minutes with only 30 seconds of predecessor
  grace; concurrent/lost refresh responses recover the same keyed successor.
- Added HTTPS host-only Secure/HttpOnly/SameSite=Lax cookies, minimal profile JSON,
  no-store private responses, signed expiring double-submit CSRF with exact Origin,
  strict JSON/DTO validation, duplicate-cookie rejection and streamed body limits.
  Loopback HTTP requires explicit development opt-in and different cookie names.
- Added shared PostgreSQL fixed-window login limits: five attempts per HMAC email
  key and 50 overall per 15 minutes, atomic concurrency and bounded expired cleanup.
  Unknown accounts and bad passwords have generic responses and Argon2 verification.
- Added migration `0002_auth_inbox.sql` with auth expiry/rotation fields, persistent
  rate buckets and owner-scoped Inbox retry UUID uniqueness. Seventeen tables now
  exist; original ownership constraints and timestamp triggers remain intact.
- Exposed authenticated capture/list APIs through existing service/repository
  boundaries. Owner IDs come solely from session verification; supplied owner fields
  are rejected. Capture retries reuse an owner-scoped key; changed payloads conflict.
  Listing has bounded stable cursor pagination and always filters the owner.
- Built shared login/Inbox views with in-memory drafts, confirmation before discard,
  capture retries after uncertain delivery, expiry/account-change handling, logout
  confirmation, foreground revalidation and visible periodic refresh. Two browser
  accounts have isolated data; captured text survives reload through PostgreSQL.
- Added Electron main-process encrypted session-cookie persistence/restore, serialized
  rotation writes, logout deletion, validation and corruption handling. Unavailable
  OS encryption, Linux `basic_text` and dev HTTP remain nonpersistent. No plaintext
  fallback, preload, IPC or renderer privilege was introduced. Existing sandbox,
  isolation, origin/navigation, certificate and permission protections are retained.
- Updated CI to provision disposable PostgreSQL 17 databases and exercise auth services
  and browser flows alongside the original PGlite migration tests and quality gates.
- Patched development-tool esbuild advisories and upgraded the transitive download
  proxy adapter to remove vulnerable sprintf-js. Narrow overrides are documented
  until parent packages update their ranges.

### Direction completed

- Added owner-scoped create/read/edit/list APIs and shared web/Electron UI for Seasons,
  Goals, Milestones and Projects using the existing schema and service boundaries.
  Category creation supports real allocation/Goal/Project choices; existing owned
  Visions can be selected and displayed without adding a Vision editor.
- Seasons include primary objective, description, dates, success criteria, status
  and full-set category allocations. Shared and transactional validation require
  distinct owned categories totaling exactly 100%. Activation serializes by owner,
  moves the previous active Season back to planned and preserves the unique index.
  Complete/archive preserves records and links; reactivation is explicit.
- Goals include category/Vision, target date, status, priority, notes and optional
  exact decimal target/current/unit. Milestones support creation/editing, Goal links,
  completion/reopening and target dates. Projects support description/category/status,
  dates/notes and one direct Goal or one Milestone. Independent Projects remain valid.
- Detail views resolve Vision → Goal → Milestone → Project using owned queries;
  lists have 50-row cursor pagination. Complete edit versions reject stale notes/
  relationships with 409. UUID creates safely replay identical payloads after lost
  responses; changed replays cannot duplicate or overwrite the original record.
- Added owner-stamped read envelopes and a server-checked account precondition on
  UI mutations to prevent another tab's login from adopting/submitting an earlier
  account's Direction draft. Auth/session, CSRF, HttpOnly cookies and Electron
  restrictions remain intact. No request field supplies owner authority.
- Added calm empty states, responsive list/detail layouts, native create/edit dialogs,
  validation feedback, archive/discard/activation confirmation, loading states and
  foreground revalidation. Unsaved forms are not overwritten by background refresh.
- Authenticated Today now renders and revalidates only the real active Season name,
  objective, date range and up to six allocations, linking to the full strategy.
  No fabricated progress/metrics, Big 3 or One Thing editing was added.
- Added additive `0003_direction_versions.sql`: integer version columns on four
  existing Direction tables. No table, original field, parent FK or content removed.
  Upgrade verification preserves pre-0003 notes, dates and parent links.
- Existing Task → Goal/Project ownership FKs remain ready for the next slice; no
  Task service, record creation, API or UI was implemented during that earlier slice.

### Tasks completed in this run

- Added real authenticated create/read/edit/list and completion/reopening, using
  the original Task fields and owner-scoped Goal/Project/category relationships.
  Supports description/notes, all six work statuses, manual priority, due instant,
  estimate/actual minutes, energy and optional decision ratings. No generated priority
  score, schedule, Focus timer, daily planning or spiritual productivity metric added.
- Shared web/Electron Tasks UI includes native forms, helpful empty/loading states,
  responsive detail/list, owned hierarchy, status/direct-parent filters, earlier-page
  loading, validation, stale-edit preservation and cancellation/discard confirmation.
  Parent choices load more pages; Direction links to directly attached Tasks.
- Due forms use the account timezone, not the Cloud/browser timezone. Exact instants
  persist in PostgreSQL; seconds round-trip. Skipped/repeated DST times receive useful
  validation rather than silently shifted deadlines. Actual duration is manual input.
- Inbox captures can be converted into a Task in one transaction. Original capture
  text remains; successful conversion removes it from unprocessed Inbox. Owner/source
  uniqueness, composite FK, row locks and immutable normalized command fingerprint
  prevent duplicates or foreign conversion. Exact retries return the linked Task even
  after later edits, preserving newer notes; changed retries return 409.
- Preserved session/CSRF/origin/body limits and account-change preconditions. All new
  reads carry verified account stamps. Task drafts and records clear on account/session
  changes; open forms retain connection failures/stale edits and stable create UUIDs.
  No plaintext browser persistence, native IPC or Electron renderer privilege added.
- Added additive migration `0004_tasks_conversion.sql`: Task version/priority/completion,
  source Inbox link/fingerprint, source uniqueness/provenance check and Inbox owner key.
  Existing notes, due instants, durations and Project links survive upgrade; original
  captures remain intact. Legacy completed Tasks have no fabricated completion instant.
- CI now provisions a separate disposable Tasks PostgreSQL database and runs the new
  server suite alongside authentication, Direction and production browser flows.

## Entry points

| Area            | Files                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web composition | `apps/web/lib/services.ts`, `app/api/auth/[action]/route.ts`, `app/api/inbox/route.ts`, `app/api/direction/[[...parts]]/route.ts`, `app/api/tasks/[[...parts]]/route.ts` |
| Auth and HTTP   | `packages/api/src/auth.ts`, `http-security.ts`, `http.ts`, `account-cli.ts`, `direction.ts`, `direction-http.ts`, `tasks.ts`, `tasks-http.ts`                            |
| Persistence     | `packages/database/src/auth.ts`, `inbox.ts`, `direction.ts`, `tasks.ts`, `schema.ts`, `migrations/`                                                                      |
| Shared UI       | `packages/app/src/login.tsx`, `inbox.tsx`, `auth-client.ts`, `direction.tsx`, `direction-editor.tsx`, `today-season.tsx`, `tasks.tsx`, `task-editor.tsx`                 |
| Desktop         | `apps/desktop/src/main.ts`, `security.ts`, `credentials.ts`, `session-persistence.ts`                                                                                    |
| Verification    | `auth-inbox.test.ts`, `http-security.test.ts`, desktop tests, `tests/auth-inbox.spec.ts`                                                                                 |

## Verification performed in Cloud

- `pnpm format:check`, `pnpm lint` (zero warnings) and `pnpm typecheck`: passed.
- `pnpm test`: **75 passing tests across 15 files**, preserving all previous tests.
  Two additional restricted-role cases are PostgreSQL-only and explicitly skip in
  this default PGlite run. The suite includes the original migrations/constraints,
  auth/session/CSRF/rate limits, Inbox isolation/retries, Electron security, Direction
  validation/relations/versions, Tasks, conversion retries/rollback/concurrency,
  account timezone/DST checks and seeded pre-0003/pre-0004 upgrade preservation.
- Isolated **PostgreSQL 17**: **13/13 auth/Inbox** regression cases and **13/13 Direction**
  cases plus **13/13 Tasks** cases passed in separate disposable fixture databases.
  Direction verifies complete
  allocations and rollback, concurrent activation, owner isolation, hierarchy links,
  decimal precision, stale edits, create replays and microsecond cursor pagination.
  Restricted SET LOCAL ROLE cases prove Direction/Task grants work, including
  atomic conversion, and deny account creation/DDL/capture deletion; production
  provider roles/pooling remain unverified.
- Production `pnpm build`: Next.js application and Electron main bundle passed.
- Production browser E2E against disposable PostgreSQL: **32/32** desktop/mobile
  cases passed, preserving all 24 prior cases and adding Task CRUD/conversion retry/isolation.
  Direction coverage includes persisted CRUD,
  active Season on Today, Goal/Milestone/Project hierarchy, completion, notes/reload,
  foreign-account rejection, stale-edit preservation and axe scans of detail/forms.
  Task coverage adds account-local due time round-trip, status/direct-parent filtering,
  completion, owned hierarchy, lost-response conversion and cross-tab draft clearing.
- `pnpm db:generate`: no schema drift after migration 0004.
- `pnpm peers check` and dependency/security audits: no peer issues or known
  vulnerabilities in the checked lockfile.
- Visual review at 1440px and 390px, plus native dialog inspection. Screenshots use
  disposable fixtures and live outside the source repository.

Tests use fixture accounts and independent auth, Direction and Tasks `_tests`
databases plus browser `_e2e`, never real user records. All 26 authenticated browser cases
skip without the E2E URL; CI provisions PostgreSQL and runs all three server suites and
all 32 browser cases. These are Cloud/local runs; GitHub CI has not been observed
for this change. No production hosted deployment or native Windows runtime was tested.

## Partial work

- **Electron persistence is implemented and adapter-tested, but not native-verified.**
  Filesystem/encryption/cookie lifecycle tests use mocked encryption/Electron adapters.
  They do not prove DPAPI, real Chromium cookie events or Windows restart behavior.
- **Account lifecycle is controlled creation/login/logout only.** No reset/recovery,
  verified email, invitations, revoke-all-sessions, export/deletion or audit log yet.
- **Inbox supports capture, paginated listing and Task conversion.** Other processing,
  edit/delete, durable encrypted drafts and offline queue are deferred. Refresh reloads
  the latest
  page; loaded older history can be requested again. Unsent drafts vanish on reload.
- **Direction is implemented within this slice's boundaries.** Vision editing,
  category rename/removal, hard record deletion, full-history search and Task-derived
  progress are deferred. Lookup metadata caps categories/Visions at 100; records and
  parent selectors can load earlier pages. Current/all status filtering applies to
  loaded pages, so older matches require loading more. Forms stay only in memory;
  reload or a session/account change discards them. No encrypted draft queue exists.
- **Tasks are implemented within the Execution slice.** No scheduling, routines,
  Focus timing, generated ranking, bulk operations, hard deletion or Task search.
  Goal filters are direct links; inherited work is viewed through Project links.
  Refresh reloads recent pages and parent choices; older pages can be loaded again.
  Actual duration is manual, legacy completion times remain unknown and drafts are
  memory-only. DST repeated-hour selection is intentionally rejected for now.
- Rate limits use an application-wide budget appropriate to controlled personal use;
  sustained abuse can temporarily block login. Expired/revoked session cleanup is
  not scheduled. These are operational limits, not claims of unlimited scale.

## Unverified and deferred

- Windows DPAPI, GUI launch, NSIS installation/upgrades, signing, user-data ACLs and
  native session restart/rotation/logout require local Windows testing. See the
  concrete checklist in `deployment.md`; none is claimed verified in Cloud.
- No Neon/Vercel resources or production secrets provisioned. Hosted TLS, pooling,
  restricted runtime role grants, free-tier limits and operational restores remain
  unverified. Fixture setup uses an owner role; restricted Direction/Task runtime roles are also
  exercised locally. No production RLS policy is claimed.
- Backup RPO/RTO are targets, not a deployed or rehearsed backup service. Provider
  eligibility/quotas, signing costs and KJV UK rights require review before release.
- Manual screen-reader/200% zoom checks, actual iOS Safari and Windows accessibility
  remain unverified; automated Chromium/axe results do not establish these.
- Direction allocation totals and conflicting edits are now enforced transactionally.
  Future domains must provide their own complete-set/concurrency validation. IANA zones are validated
  in account creation but SQL does not enforce timezone names independently.
- Focus, Career, Wealth, Business, Health, Faith,
  Reviews, banking/calendar integrations and LLM functionality were not implemented.
  Existing preview/rule/schema groundwork does not make these usable features.

## Exact next recommended implementation task

**Implement the authenticated daily-planning vertical slice: selected local day,
One Thing, versioned atomic Big 3 replacement with owned optional Task links, and
one bounded Today aggregation endpoint with shared web/Electron UI and timezone,
concurrency and PostgreSQL isolation tests.**

Preserve the existing Task single-parent model, conversion provenance, Direction
versions and session/CSRF protections. Keep scheduling, Focus, routines, recovery/reset
and all later private domains outside that slice. Daily planning was not started in
this run. Public deployment and local Windows runtime verification remain separate
release work; the app has not become publicly online through a Git push.
