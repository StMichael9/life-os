# Progress and handoff

## Current phase

**Phase 0 foundation and the authenticated Inbox vertical slice implemented.**
The current private workflow is login → verified session → Inbox capture →
PostgreSQL persistence → owner-only listing → logout/revocation. Today remains a
public planning preview with bundled daily content. This is not a completed Life OS;
no other private feature domain was added during this slice.

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

## Entry points

| Area            | Files                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| Web composition | `apps/web/lib/services.ts`, `app/api/auth/[action]/route.ts`, `app/api/inbox/route.ts`   |
| Auth and HTTP   | `packages/api/src/auth.ts`, `http-security.ts`, `http.ts`, `account-cli.ts`              |
| Persistence     | `packages/database/src/auth.ts`, `inbox.ts`, `schema.ts`, `migrations/`                  |
| Shared UI       | `packages/app/src/login.tsx`, `inbox.tsx`, `auth-client.ts`                              |
| Desktop         | `apps/desktop/src/main.ts`, `security.ts`, `credentials.ts`, `session-persistence.ts`    |
| Verification    | `auth-inbox.test.ts`, `http-security.test.ts`, desktop tests, `tests/auth-inbox.spec.ts` |

## Verification performed in Cloud

- `pnpm format:check`, `pnpm lint` (zero warnings), and `pnpm typecheck`: passed.
- `pnpm test`: **47 passing tests across 10 files**, including the original seven
  migration/constraint tests, authentication/password/expiry/revocation/rotation,
  CSRF/configuration, persistent limits, capture/list/isolation, and Electron
  security/persistence regression tests. Default SQL integration uses PGlite.
- Isolated **PostgreSQL 17** container: all committed migrations applied; **13/13**
  auth/HTTP/Inbox integration cases passed against actual PostgreSQL. This exercised
  concurrent rate buckets, row-locked rotation, capture idempotency, ownership,
  stable pagination and persisted credentials/session digests.
- Production `pnpm build`: Next.js application and Electron main bundle passed.
- Production browser E2E against a separate disposable PostgreSQL database:
  **18/18** desktop/mobile cases passed. Includes login, HttpOnly cookies, owner
  persistence across reload, logout revocation, lost-response retry without duplicate
  rows, two-account isolation, CSRF rejection, generic errors, revocation privacy/draft handling, cross-tab
  account switching, CSP and axe WCAG scans.
- `pnpm db:generate`: reports no schema drift after migration 0002.
- `pnpm peers check`: passed. Production and full dependency audits run after the
  development-tool patches; no known vulnerabilities remain in the checked lockfile.

Tests use fixture accounts and independent `_tests`/`_e2e` databases, never real user
records. Full authentication browser tests explicitly skip without the E2E fixture
URL; CI is configured to supply it. These are local Cloud results; GitHub CI has not
been observed running for this change. No hosted production deployment was tested.

## Partial work

- **Electron persistence is implemented and adapter-tested, but not native-verified.**
  Filesystem/encryption/cookie lifecycle tests use mocked encryption/Electron adapters.
  They do not prove DPAPI, real Chromium cookie events or Windows restart behavior.
- **Account lifecycle is controlled creation/login/logout only.** No reset/recovery,
  verified email, invitations, revoke-all-sessions, export/deletion or audit log yet.
- **Inbox supports capture and paginated listing only.** No processing, task conversion,
  edit/delete, durable encrypted drafts or offline queue. Refresh reloads the latest
  page; loaded older history can be requested again. Unsent drafts vanish on reload.
- Rate limits use an application-wide budget appropriate to controlled personal use;
  sustained abuse can temporarily block login. Expired/revoked session cleanup is
  not scheduled. These are operational limits, not claims of unlimited scale.

## Unverified and deferred

- Windows DPAPI, GUI launch, NSIS installation/upgrades, signing, user-data ACLs and
  native session restart/rotation/logout require local Windows testing. See the
  concrete checklist in `deployment.md`; none is claimed verified in Cloud.
- No Neon/Vercel resources or production secrets provisioned. Hosted TLS, pooling,
  restricted runtime role grants, free-tier limits and operational restores remain
  unverified. Disposable PostgreSQL tests use an owner role; no RLS policy is claimed.
- Backup RPO/RTO are targets, not a deployed or rehearsed backup service. Provider
  eligibility/quotas, signing costs and KJV UK rights require review before release.
- Manual screen-reader/200% zoom checks, actual iOS Safari and Windows accessibility
  remain unverified; automated Chromium/axe results do not establish these.
- Whole-Season allocation totals and future update conflict handling still require
  transactional services before those domains expose writes. IANA zones are validated
  in account creation but SQL does not enforce timezone names independently.
- Goals, Projects, general Tasks, Focus, Career, Wealth, Business, Health, Faith,
  Reviews, banking/calendar integrations and LLM functionality were not implemented.
  Existing preview/rule/schema groundwork does not make these usable features.

## Exact next recommended implementation task

**Implement controlled administrator password reset/account recovery with atomic
revocation of every session for that account, and test the complete recovery flow
against isolated PostgreSQL and the shared web/Electron account model.**

Keep public registration closed. Include explicit operator authorization, hidden
password input, Argon2id hashing, concurrency-safe reset/revocation and proof that
old/current/grace tokens cannot authenticate after reset. Update the operational
recovery documentation. Do not expand into another private feature domain in that
next task. No part of that reset/recovery implementation was started in this run.
