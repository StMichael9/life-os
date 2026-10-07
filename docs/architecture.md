# Architecture

## Status and governing decisions

Phase 0 foundation, authenticated Inbox and the Phase 1 Direction slice are implemented.
Continue with one coherent vertical slice at a time.
The complete destination is `product-spec.md`; it is not a first-run checklist.
No LLM, subscription API, banking connector, or telemetry service is required.
The primary risks are disclosure of private records, platform divergence, false
claims of persistence, incorrect local-day boundaries, and premature feature breadth.

## Runtime and repository

| Location              | Responsibility                                                              | Allowed dependencies               |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `apps/web`            | Next.js App Router composition, security headers, HTTP/auth adapters        | shared app, server services        |
| `apps/desktop`        | Electron lifecycle and trust boundary; packaged Windows shell               | Electron and pure security helpers |
| `packages/app`        | Shared React product views; Today, login, Inbox and Direction               | ui, shared, validation             |
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

The public Today page serves bundled daily content and clearly labeled planning
empty states. `/login`, `/inbox` and `/direction` use real server services; private data is never
served from the preview model. The Next adapters lazily compose the PostgreSQL
repositories and authentication service in `apps/web/lib/services.ts` (server-only).
Missing `DATABASE_URL`, `AUTH_SECRET` or a trusted `APP_ORIGIN` fails closed with 503.
There is no production fake verifier or client-supplied owner authority.

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

The Electron cookie partition remains memory-only. A main-process encrypted cookie
record restores the hosted session across restarts when OS encryption is available.
NSIS packaging configuration exists; a tested, signed installer remains a later
deliverable. Native Windows encryption and installation have not been exercised here.

## Implemented authentication

Accounts are created by a trusted operator using interactive `pnpm account:create`.
There is no public registration endpoint or invite service. Email is normalized;
passwords must be 12–128 characters and account timezones pass shared IANA validation.
The CLI hides password input and asks for confirmation. PostgreSQL stores only
Argon2id hashes: 19,456 KiB, two iterations, one lane, library-generated salts.
Unknown email and wrong-password responses are generic; both perform verification.
Benchmark these parameters on the hosted runtime before release.

Login consumes atomic PostgreSQL fixed-window budgets before Argon2 work: five
attempts per normalized email and 50 overall per 15 minutes, across all instances.
Email bucket keys are HMAC hashes; no trusted client IP or paid Redis is required.
Expired buckets are pruned in bounded batches. Global limits fit controlled personal
use but can cause temporary denial of login during abuse; tune with deployment
capacity rather than adding an untrusted forwarded-IP bypass.

Sessions start with 256 random bits. Only SHA-256 token hashes are stored. Absolute
expiry is 30 days, idle expiry seven days; verified use advances idle expiry up to
the absolute boundary. Explicit refresh rotates at most once per 15 minutes in a
row-locked transaction. The immediately previous token remains usable for 30 seconds.
A keyed HMAC successor lets concurrent refreshes and a lost response recover the
same successor without storing plaintext tokens. Older tokens fail after grace;
no refresh extends absolute expiry. An early refresh returns no Set-Cookie, preventing
an old unchanged response from overwriting a rotated cookie. Login replaces the
presented old session; logout revokes it before clearing cookies. Concurrent requests
already authorized before logout may complete.

### Browser security and HTTP contract

HTTPS uses `__Host-life_os_session`: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain.
Explicit loopback development uses a different cookie name without Secure. Tokens
never appear in JSON, URLs, localStorage or renderer state; the session endpoint
returns only ID, display name and timezone. Private responses are `no-store`.

Unsafe requests, including login/logout, require exact configured Origin, JSON,
a signed CSRF token in a header matching its HttpOnly cookie, and non-cross-site
Fetch metadata when supplied. CSRF tokens expire after two hours. Duplicate cookie
names are rejected. Bodies are capped at 16 KiB while streaming, then validated
with strict Zod schemas. No credentialed cross-origin API or public account-creation
route is exposed. Errors do not log passwords, cookies, tokens or capture contents.

| Endpoint                 | Behavior                                                     |
| ------------------------ | ------------------------------------------------------------ |
| GET `/api/auth/csrf`     | Issue/reuse a signed CSRF token and HttpOnly cookie          |
| POST `/api/auth/login`   | Rate-limited email/password verification and session cookie  |
| GET `/api/auth/session`  | Verify session and return minimal profile                    |
| POST `/api/auth/refresh` | Bounded transactional token rotation                         |
| POST `/api/auth/logout`  | Server revocation, then cookie deletion                      |
| POST `/api/inbox`        | Authenticated capture `{ body, requestId }`                  |
| GET `/api/inbox`         | Owner-only unprocessed items, optional validated JSON cursor |

Every Inbox operation verifies the cookie through the session service and uses that
user ID in repository predicates. Request owner fields are rejected. Capture uses a
UUID retry key, unique per owner: replaying identical trimmed text returns the same
record; reusing a key with changed text returns 409. The same key for another owner
is independent. Listing returns 50 records at a time by `(created_at, id)` descending;
timestamps have millisecond precision matching JavaScript cursor serialization.

### Shared authenticated UI

Web and Electron load the same login and Inbox views. Capture preserves an uncertain
request's text and retry key until confirmation; repeated delivery cannot duplicate
persistence. Private drafts remain only in memory. Expired sessions clear displayed
private records while retaining unsent text; account switches require reload/sign-in
before capture. Logout confirms draft discard and waits for server revocation.
Foreground, visibility and visible 60-second polling revalidate session and recent
Inbox data. Refresh reloads the most recent page; older pages can be loaded again.
There is no offline write queue, processing/conversion, edit or delete operation yet.

### Electron persistence

Main alone persists the exact host-only HTTPS session cookie through Electron
`safeStorage`, in an origin-specific app user-data directory. Validate origin, name,
path, Secure/HttpOnly/SameSite, token format and expiry before save or restore.
Ciphertext writes use an exclusive temporary file, fsync and atomic rename; corrupt,
expired, foreign-origin and removed records are deleted. Cookie events serialize
writes and reread the latest value so rotation cannot save an obsolete event.
Shutdown drains pending writes. No preload, credential IPC or token access is added
to the renderer. Dev HTTP does not persist; unavailable encryption and Linux
`basic_text` keep sessions nonpersistent with no plaintext fallback.

Adapter tests prove the lifecycle with mocked encryption, not Windows DPAPI. Local
Windows testing must verify native encryption, cookie restoration/rotation/logout,
filesystem access, installer behavior and upgrades before desktop persistence is
considered runtime-verified. Encryption at rest does not lock an already signed-in app.

Password recovery/reset, verified email, invites, all-session revocation, account
export/deletion and security audit events remain unimplemented. Recovery/reset remains deferred. Direction was the next product slice explicitly
selected by the user; no recovery/reset implementation was added.

## Implemented Direction domain

The existing Season, Goal, Milestone and Project tables now have authenticated
repositories, services and shared web/Electron views. Category creation is a small
supporting operation (explicit user input, no seeded personal records). Lookup
metadata includes owned categories and existing Visions; Vision editing is deferred.
The same opaque cookie, session verifier, CSRF checks and body limits protect every
Direction endpoint. Item DTOs exclude stored owners and session/credential data.

`/direction` offers Seasons/Goals/Projects lists with bounded 50-row pagination,
status filtering of loaded records, deep-linked detail panels, and native modal
create/edit forms. Goals include milestone management; detail breadcrumbs resolve
Vision → Goal → Milestone → Project using owned joins. Independent Projects remain
valid per the existing model; a Project may have one direct Goal or one Milestone,
never both. No Task API/UI or fabricated progress metric is introduced.

| Endpoint                                    | Contract                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| GET `/api/direction`                        | Owned category/Vision lookup metadata and active Season                   |
| GET `/api/direction/active-season`          | Minimal active Season response for Today                                  |
| GET `/api/direction/{resource}`             | 50 rows; optional `before` UUID cursor; milestones may filter by `goalId` |
| GET `/api/direction/{resource}/{id}`        | Owned record and resolved ancestor trail                                  |
| POST `/api/direction/{resource}`            | Full validated create command with UUID ID and version 0                  |
| PATCH `/api/direction/{resource}/{id}`      | Full validated replacement with matching ID/current version               |
| POST `/api/direction/seasons/{id}/activate` | Version-checked activation; previous active Season becomes planned        |
| POST `/api/direction/categories`            | Explicit owned category creation, including reflective classification     |

All Direction writes lock the verified owner's `app_user` row within the transaction.
This serializes per-owner activation, complete allocation replacement, edit-version
checks and relationship validation across instances. The partial unique active-Season
index and composite ownership FKs remain independent SQL defenses. User rows are
not modified; PostgreSQL nevertheless requires an UPDATE privilege for the row lock
(see restricted runtime grants in deployment docs).

Every saved Season requires distinct owned categories totaling exactly 100%, checked
at the shared schema boundary and again inside the transaction. Allocate 0–100% per
row; UI omits zero rows. Invalid category ownership cannot partially change a Season,
its allocations or another active Season. Archive/complete keeps records and links;
reactivation is explicit. Activation does not silently complete the previous Season.

Full edit commands carry integer versions; stale edits return 409 and retain the
unsaved form for review. Create UUIDs persist across retries; identical version-0
replays return the original row, while changed/replayed payloads after later edits
conflict. Measurement values remain exact PostgreSQL decimals represented as strings;
no binary floating-point progress calculation is introduced. Milestone completion
stores a server timestamp and can be reopened. Cursor comparisons use the anchor's
original PostgreSQL timestamp inside SQL, avoiding JavaScript microsecond truncation.

Direction read envelopes include the verified account ID. The UI checks that all
responses belong to its current profile before adopting them. Unsafe UI requests
also send `X-Life-OS-Account` as a precondition; the service compares it with the
verified session and rejects a changed account. This header never supplies owner
authority. Generation guards suppress obsolete responses after session/account change.
Foreground/polling revalidates persisted data without overwriting an open form.
Native dialogs support Escape/focus containment, discard confirmation and unload
warnings; archive/active-Season replacement prompts explain what happens.

Today reads only the active Season server-side when a session cookie is present,
then revalidates on foreground/visible polling. Anonymous Today stays a labeled
preview and never contacts private repositories. It shows real name/objective/dates
and up to six allocations, linking to the full strategy; the rest of Today remains
planning guidance. No One Thing, Big 3 or other dashboard persistence was added.

## Database and concurrency

UUIDs, UTC timestamptz instants, explicit local calendar dates, numeric measurements,
foreign keys, uniqueness constraints and indexed owner queries form the foundation.
Composite `(entity_id, user_id)` foreign keys reject cross-owner relationships even
when a service makes a mistake. They do **not** authorize SELECT: owner predicates
remain mandatory. Deployment requires a restricted app role and a separate migration
DDL role; provider-specific roles have not yet been provisioned or verified. RLS may be added as defense in depth after role and pooling semantics are
tested. Never assume RLS protects an owner/superuser connection.

Transactions atomically save/activate Seasons with complete allocations. Future
transactions will replace Big 3,
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
Inbox and Direction persist private records in PostgreSQL; other preview sections store no private input. The daily library is bundled, not fetched from
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
