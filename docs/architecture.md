# Architecture

## Status and governing decisions

Phase 0 foundation, followed by one coherent authenticated vertical slice at a time.
The complete destination is `product-spec.md`; it is not a first-run checklist.
No LLM, subscription API, banking connector, or telemetry service is required.
The primary risks are disclosure of private records, platform divergence, false
claims of persistence, incorrect local-day boundaries, and premature feature breadth.

## Runtime and repository

| Location              | Responsibility                                                              | Allowed dependencies               |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `apps/web`            | Next.js App Router composition, security headers, future HTTP/auth adapters | shared app, server services        |
| `apps/desktop`        | Electron lifecycle and trust boundary; packaged Windows shell               | Electron and pure security helpers |
| `packages/app`        | Shared React product views; current Today screen                            | ui, shared; future validated DTOs  |
| `packages/ui`         | Semantic primitives, global design tokens and responsive styles             | React                              |
| `packages/shared`     | Browser-safe local-date and versioned daily-content functions               | platform APIs only                 |
| `packages/validation` | Zod schemas for untrusted inputs                                            | Zod                                |
| `packages/insights`   | Deterministic priority and evidence rules                                   | validation                         |
| `packages/api`        | Trusted service orchestration and session-verifier contract                 | validation, repository contracts   |
| `packages/database`   | Drizzle schema, PostgreSQL driver, migrations and owner-scoped repositories | Drizzle, pg                        |

pnpm workspaces suffice for nine small packages/apps; Turborepo adds little value
at this scale. Config lives at the root instead of an empty config package. Strict
TypeScript includes unchecked indexing and exact optional properties. ESLint forbids
server/Node imports in browser-safe packages. Source packages are transpiled by
Next. Electron loads that same compiled application rather than bundling a divergent
renderer. There is no second backend and no browser PostgreSQL connection.

### Data flow

```text
Web browser ──────────────┐
                         ├─ HTTPS Next.js app/API ─ verified session
Sandboxed Electron ──────┘                          ─ validated input + authorization
                                                  ─ domain service + transaction
                                                  ─ Drizzle / pooled PostgreSQL
```

The current public preview serves only bundled content and empty-state guidance.
It has no login form, capture endpoint, account cookie, journal storage, demo user,
or fake synchronization. The Inbox service/repository exist as a tested foundation
but are deliberately not exposed to HTTP. A fake verifier must never reach production.

## Desktop decision

Use the hosted HTTPS origin in a sandboxed Electron BrowserWindow. This meets the
online-first constraint, shares the exact React tree/assets, and requires no local
Node server or database at end-user startup. The executable embeds its origin at
build time; production rejects HTTP. Development permits loopback HTTP only.

Node integration is disabled, context isolation and sandboxing enabled, certificate
errors rejected, permissions denied, and origin checks apply to navigation and
redirects. New windows and webviews are blocked. There is no preload or IPC because
there is no native capability to expose yet. External-link allowlisting, native
notifications, updates, tray, and quick capture arrive in later slices with narrow
validated IPC only when needed. Never add a generic invoke/eval/filesystem bridge.

Foundation sessions are memory-only. Windows DPAPI storage is designed below but
not implemented. NSIS packaging configuration exists; a tested, signed installer
is a later deliverable, not an output claimed by this foundation.

## Authentication design (not implemented yet)

Use first-party email/password credentials and opaque revocable sessions. The initial
schema reserves `app_user`, `auth_credential`, and `auth_session`. Credential and
session rows never appear in ordinary profile or dashboard responses.

1. Normalize email on the server. Begin with invitation-only account creation; no
   public registration until verification, abuse controls and recovery are ready.
2. Hash passwords using an established Argon2id library, not custom cryptography.
   Benchmark the deployment budget; minimum 19 MiB memory, two iterations, one
   lane. Use library-generated salts and constant-time verification. Apply bounded
   password/body lengths and shared, persistent rate limits before expensive work.
3. Successful login generates at least 256 random bits. Store only SHA-256 token
   hashes in PostgreSQL. Return a Secure, HttpOnly, SameSite=Lax, Path=/,
   `__Host-life_os_session` cookie on HTTPS; never a token in JSON or localStorage.
   Development uses a differently named non-Secure loopback cookie.
4. Every private service verifies token hash, expiry and revocation and derives its
   owner from that lookup. Missing configuration or sessions fail closed. A submitted
   `userId` is never authority. Object reads/updates/deletes always include the owner.
5. Unsafe same-origin requests check the exact configured Origin and a CSRF token;
   reject absent/untrusted origins. Do not enable wildcard credentialed CORS. Login
   and logout need CSRF protection too. Cap bodies and validate with shared Zod.
6. Rotate sessions transactionally after login/privilege changes and on a bounded
   renewal interval, with absolute and idle expiration. Design concurrent request
   handling explicitly before implementation; no indefinite reusable refresh token.
   Logout/password reset revoke server sessions and clear local credentials.
7. Login errors remain generic; do not leak account existence. Do not log passwords,
   bearer tokens, cookie headers, journal text, or capture bodies. Password reset,
   verified email, rate-limit storage, audit events, rotation linkage and account
   recovery require their own migration and integration tests in Phase 1.

### Browser session

The browser transports the HttpOnly cookie; the renderer only sees a minimal
profile. No session IDs in URLs, web storage or app state. Use no-store responses
and user-scoped cache keys. Refresh/rotation is a server operation.

### Electron session

Use the same HTTPS login and server authorization in a memory-only Electron session.
The main process will persist only the exact session cookie, encrypted with Electron
`safeStorage` backed by Windows DPAPI, under the app user-data directory with strict
file permissions. Restore it into the isolated session on startup; listen for token
rotation and logout to update/delete the encrypted record. Validate the exact origin,
name, path, Secure/HttpOnly flags, and expiry before persisting. If OS encryption is
unavailable, use a nonpersistent session and require login again; no plaintext fallback.
The renderer never receives the token. No custom credential IPC is necessary.
Test this lifecycle on Windows before marking persistent desktop login complete.

## Database and concurrency

UUIDs, UTC timestamptz instants, explicit local calendar dates, numeric measurements,
foreign keys, uniqueness constraints and indexed owner queries form the foundation.
Composite `(entity_id, user_id)` foreign keys reject cross-owner relationships even
when a service makes a mistake. They do **not** authorize SELECT: owner predicates
remain mandatory. The server uses a restricted app role; migrations use a separate
DDL role. RLS may be added as defense in depth after role and pooling semantics are
tested. Never assume RLS protects an owner/superuser connection.

Transactions will atomically replace Big 3, switch active Seasons with allocations,
convert Inbox captures, and finish focus sessions. Allocation totals must be validated
as a whole; row-level 0–100 checks alone do not enforce a 100% total. Future updates
use `updated_at`/version preconditions to detect conflicting edits; last-write-wins
must not silently discard long reflections. The database maintains updated timestamps.

## Boundaries for later domains

Direction owns hierarchy and Season strategy. Execution owns Inbox, planning,
schedule, focus and routines. Career owns skills, evidence, professional contacts
and opportunities. Business owns experiments and metric definitions/observations.
Wealth owns canonical accounts/transactions, imports and projections. Performance
owns observations and training. Faith owns prayer, Scripture annotations, gratitude
and journal text. Reflection owns reviews and decision reasoning. These are modules
inside one application, not microservices. Explicit cross-domain relations are
preferred to generic polymorphic entity/value tables.

## Queries, synchronization and offline behavior

Build one authenticated Today aggregation endpoint for selected-day data, with a
bounded number of owner-filtered queries. Read a consistent snapshot where needed;
never request entire history or issue one browser request per card. Use date-range
indexes and cursor pagination for long histories. Revalidate after mutations and
on foreground; short polling may be added for active desktop/web sessions. No
realtime service or global state library is justified yet.

The product is online-first. Keep failed edits visible with retry state and avoid
clearing forms before the server confirms success. Do not persist sensitive drafts
in renderer localStorage. Durable encrypted drafts require a separate design. The
foundation stores no private input. The daily library is bundled, not fetched from
an external API, and its published v1 pool stays immutable across deployments.

## Deterministic insights and priority v1

Priority inputs are bounded and validated. Only planned/in-progress execution work
that fits available time and energy is eligible. Exclude `spiritual` categories and
the canonical faith category before scoring. The server must derive that flag from
the stored category, not an arbitrary client scoring request.

Score = 5×impact + 4×goalAlignment + 3×urgency + 2×opportunity +
0.15×Season allocation percentage + deadline bonus. The first four ratings range
0–5; allocation ranges 0–100. Deadline bonus is 15 within 24 hours (including overdue),
8 within 72 hours, otherwise zero. Tie-break by stable ID. The integer is a ranking
heuristic, not a probability or personal-worth score. Reasons expose the relevant
inputs; time/energy are suitability filters, not a reward for choosing tiny tasks.

RuleBasedProvider compares actual execution-time share with target allocation after
at least 120 recorded minutes; a deficit of at least 15 percentage points produces
a notice with raw evidence. These conservative thresholds are product heuristics,
not statistical significance. No spiritual data enters the numerator or denominator.
Do not wire these results into Today until real authenticated data exists.

## Meaningful deviations and tradeoffs

- Shared token CSS replaces Tailwind initially: a small semantic system avoids
  another build layer and does not prevent Tailwind adoption later.
- Electron uses the hosted application, not a separate bundled React runtime.
- Later domain schemas are documented before feature migrations are committed.
- Root config replaces an empty `packages/config`; no cache library until needed.
- Next uses its supported TypeScript compiler API (`useTypeScriptCli: false`), because
  this sandbox loses detached compiler stdout. Type checking remains enabled.
- No broad placeholder navigation/pages, fabricated metrics, or premature AI APIs.
