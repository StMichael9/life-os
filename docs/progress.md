# Progress and handoff

## Current phase

**Phase 0 foundation, authenticated Inbox, and the Phase 1 Direction slice implemented.**
Private workflows now include owner-only capture/list plus Seasons, Goals, Milestones
and Projects. Authenticated Today shows the persisted active Season; anonymous Today
and the remaining daily-planning cards stay clearly labeled guidance. No general
Tasks, full Today planning, recovery/reset or later feature domain was added.

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

### Direction completed in this run

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
  Task service, record creation, API or UI was implemented.

## Entry points

| Area            | Files                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Web composition | `apps/web/lib/services.ts`, `app/api/auth/[action]/route.ts`, `app/api/inbox/route.ts`, `app/api/direction/[[...parts]]/route.ts` |
| Auth and HTTP   | `packages/api/src/auth.ts`, `http-security.ts`, `http.ts`, `account-cli.ts`, `direction.ts`, `direction-http.ts`                  |
| Persistence     | `packages/database/src/auth.ts`, `inbox.ts`, `direction.ts`, `schema.ts`, `migrations/`                                           |
| Shared UI       | `packages/app/src/login.tsx`, `inbox.tsx`, `auth-client.ts`, `direction.tsx`, `direction-editor.tsx`, `today-season.tsx`          |
| Desktop         | `apps/desktop/src/main.ts`, `security.ts`, `credentials.ts`, `session-persistence.ts`                                             |
| Verification    | `auth-inbox.test.ts`, `http-security.test.ts`, desktop tests, `tests/auth-inbox.spec.ts`                                          |

## Verification performed in Cloud

- `pnpm format:check`, `pnpm lint` (zero warnings) and `pnpm typecheck`: passed.
- `pnpm test`: **60 passing tests across 12 files**, preserving all previous tests.
  One additional restricted-role case is PostgreSQL-only and explicitly skips in
  this default PGlite run. The suite includes the original migrations/constraints,
  auth/session/CSRF/rate limits, Inbox isolation/retries, Electron security, Direction
  validation/relations/versions and a seeded pre-0003 upgrade/preservation test.
- Isolated **PostgreSQL 17**: **13/13 auth/Inbox** regression cases and **13/13 Direction**
  cases passed in separate disposable fixture databases. Direction verifies complete
  allocations and rollback, concurrent activation, owner isolation, hierarchy links,
  decimal precision, stale edits, create replays and microsecond cursor pagination.
  A restricted SET LOCAL ROLE case proves the documented Direction grants work and
  deny account creation/DDL; production provider roles/pooling remain unverified.
- Production `pnpm build`: Next.js application and Electron main bundle passed.
- Production browser E2E against disposable PostgreSQL: **24/24** desktop/mobile
  cases passed, preserving the 18 prior cases and adding persisted Direction CRUD,
  active Season on Today, Goal/Milestone/Project hierarchy, completion, notes/reload,
  foreign-account rejection, stale-edit preservation and axe scans of detail/forms.
- `pnpm db:generate`: no schema drift after migration 0003.
- `pnpm peers check` and dependency/security audits: no peer issues or known
  vulnerabilities in the checked lockfile.
- Visual review at 1440px and 390px, plus native dialog inspection. Screenshots use
  disposable fixtures and live outside the source repository.

Tests use fixture accounts and independent auth `_tests`, Direction `_tests` and
browser `_e2e` databases, never real user records. All 18 authenticated browser cases
skip without the E2E URL; CI provisions PostgreSQL and runs both server suites and
all 24 browser cases. These are Cloud/local runs; GitHub CI has not been observed
for this change. No production hosted deployment or native Windows runtime was tested.

## Partial work

- **Electron persistence is implemented and adapter-tested, but not native-verified.**
  Filesystem/encryption/cookie lifecycle tests use mocked encryption/Electron adapters.
  They do not prove DPAPI, real Chromium cookie events or Windows restart behavior.
- **Account lifecycle is controlled creation/login/logout only.** No reset/recovery,
  verified email, invitations, revoke-all-sessions, export/deletion or audit log yet.
- **Inbox supports capture and paginated listing only.** No processing, task conversion,
  edit/delete, durable encrypted drafts or offline queue. Refresh reloads the latest
  page; loaded older history can be requested again. Unsent drafts vanish on reload.
- **Direction is implemented within this slice's boundaries.** Vision editing,
  category rename/removal, hard record deletion, full-history search and Task-derived
  progress are deferred. Lookup metadata caps categories/Visions at 100; records and
  parent selectors can load earlier pages. Current/all status filtering applies to
  loaded pages, so older matches require loading more. Forms stay only in memory;
  reload or a session/account change discards them. No encrypted draft queue exists.
- Rate limits use an application-wide budget appropriate to controlled personal use;
  sustained abuse can temporarily block login. Expired/revoked session cleanup is
  not scheduled. These are operational limits, not claims of unlimited scale.

## Unverified and deferred

- Windows DPAPI, GUI launch, NSIS installation/upgrades, signing, user-data ACLs and
  native session restart/rotation/logout require local Windows testing. See the
  concrete checklist in `deployment.md`; none is claimed verified in Cloud.
- No Neon/Vercel resources or production secrets provisioned. Hosted TLS, pooling,
  restricted runtime role grants, free-tier limits and operational restores remain
  unverified. Fixture setup uses an owner role; a restricted Direction runtime role is also
  exercised locally. No production RLS policy is claimed.
- Backup RPO/RTO are targets, not a deployed or rehearsed backup service. Provider
  eligibility/quotas, signing costs and KJV UK rights require review before release.
- Manual screen-reader/200% zoom checks, actual iOS Safari and Windows accessibility
  remain unverified; automated Chromium/axe results do not establish these.
- Direction allocation totals and conflicting edits are now enforced transactionally.
  Future domains must provide their own complete-set/concurrency validation. IANA zones are validated
  in account creation but SQL does not enforce timezone names independently.
- General Tasks, Focus, Career, Wealth, Business, Health, Faith,
  Reviews, banking/calendar integrations and LLM functionality were not implemented.
  Existing preview/rule/schema groundwork does not make these usable features.

## Exact next recommended implementation task

**Implement the authenticated Tasks vertical slice with owner-scoped Goal/Project
links and atomic, retry-safe Inbox-to-Task conversion, including shared web/Electron
UI and PostgreSQL isolation tests.**

Keep Tasks within the existing single-parent model and preserve Direction versions,
relationships and session/CSRF protections. Do not add full Today planning, Focus,
scheduling, routines or another private domain to that slice. No part of that Task
implementation was started in this run. Recovery/password reset remains deferred
as explicitly required by the current Direction scope.
