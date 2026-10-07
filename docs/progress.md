# Progress and handoff

## Current phase

**Phase 0 foundation implemented; early Phase 1 daily-content slice only.**
This is a foundation preview, not a finished personal operating system. Authentication
and persistent user workflows are not implemented or exposed. Follow the original
specification's first-run scope rather than treating later phases as completed.

## Architecture selected

pnpm 11 / Node 24 strict TypeScript monorepo. Next.js App Router hosts one shared
React product UI; sandboxed Electron loads the same HTTPS origin. Drizzle uses
standard hosted PostgreSQL (Neon recommended). Browser-safe packages cannot import
server dependencies. Pure Zod validation, deterministic daily content and rule-based
insights require no paid API. Semantic CSS tokens replace Tailwind initially; no
Turborepo, query cache, global state framework or unused config package is needed yet.

Read `architecture.md` for rationale, web/Electron session design, security boundaries,
priority algorithm, synchronization strategy and deferred decisions. Read
`data-model.md` before schema work; it covers both migrated and planned domains.

## Completed

- Inspected an empty Git repository and preserved the entire supplied specification
  as `docs/product-spec.md` (content preserved, line endings normalized to LF).
- Established two apps, seven shared/domain packages, explicit dependency graph,
  strict typing, ESLint 10, Prettier, Vitest, Playwright/axe and CI workflow.
- Built the responsive Today shell and shared olive/charcoal design system. It has
  honest empty-state guidance, functional section navigation, and a keyboard-accessible
  native timezone dialog. No pretend capture, login or task-completion buttons.
- Bundled seven complete KJV verses and seven original Life OS thoughts in an
  immutable v1 date mapping. Local timezone drives selection and midnight rollover;
  no remote content API. Preview timezone choice is not persisted across reloads.
- Implemented validated priority v1 and evidence-based allocation insights. Spiritual
  categories are excluded before ranking and from allocation totals. Algorithms are
  tested but intentionally not connected to fabricated dashboard data.
- Added a session-verifier contract and an Inbox service that requires verified
  identity. Added owner-filtered Drizzle Inbox capture/list repository. No HTTP
  adapter exposes these before real authentication exists.
- Created 16 normalized PostgreSQL tables with composite ownership FKs, indexes,
  uniqueness, range checks, one active Season and one open focus session per user,
  and one plan per local day with at most three outcomes.
- Generated `0000_foundation.sql` plus `0001_updated_at.sql` trigger migration and
  committed migration metadata. Re-generation reports no schema drift.
- Added per-request nonced CSP and other security headers. Production hydration
  passes with no unsafe-eval. The preview stores no private data.
- Built Electron main-process shell with sandbox/context isolation, no renderer
  Node integration, exact-origin navigation/redirect checks, denied permissions,
  no IPC/preload, blocked windows/webviews and an offline retry dialog.
- Configured Windows NSIS packaging. Release packaging requires an explicit HTTPS
  origin. This is packaging preparation, not a tested installer.
- Documented domain relationships for all future modules, privacy/auth flows,
  free-tier hosting strategy, environment separation and backup/recovery targets.

## Major files

| Area              | Entry points                                                                           |
| ----------------- | -------------------------------------------------------------------------------------- |
| Web               | `apps/web/app/page.tsx`, `layout.tsx`, `proxy.ts`                                      |
| Desktop           | `apps/desktop/src/main.ts`, `security.ts`, `scripts/build.mjs`, `electron-builder.yml` |
| Shared UI         | `packages/app/src/today.tsx`, `packages/ui/src/styles.css`, `primitives.tsx`           |
| Dates/content     | `packages/shared/src/daily.ts`                                                         |
| Inputs/rules      | `packages/validation/src/index.ts`, `packages/insights/src/index.ts`                   |
| Server foundation | `packages/api/src/index.ts`, `packages/database/src/inbox.ts`                          |
| Persistence       | `packages/database/src/schema.ts`, `src/migrate.ts`, `migrations/`                     |
| Verification      | colocated `*.test.ts`, `tests/today.spec.ts`, root configs, `.github/workflows/ci.yml` |
| Handoff           | `AGENTS.md`, `README.md`, six `docs/*.md` documents                                    |

## Verification

- `pnpm test`: **26 passing** unit/integration tests across six files, including seven
  real SQL migration tests in PGlite. Tests cover local date/DST, input limits,
  priority explanations/eligibility, spiritual exclusion, insight evidence, service
  identity gating, Electron origin rules, ownership FKs and DB constraints.
- `pnpm typecheck`: passes for root tooling/tests and all workspace apps/packages.
- `pnpm lint`: passes with zero warnings.
- `pnpm build`: Next.js production build and Electron main bundle pass with type
  checking enabled. Next uses its supported compiler API because detached CLI
  stdout was empty in this managed environment.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm test:e2e`: **6 passing**
  tests across desktop/mobile viewports. Covers CSP hydration/no console errors,
  timezone dialog keyboard behavior, daily rollover, horizontal overflow and axe
  WCAG A/AA scans of both page and dialog.
- `pnpm db:generate`: no schema changes after migration creation; renamed initial
  migration and journal tag remain consistent and migration tests pass.
- `pnpm peers check`: no peer dependency issues.
- Visual review performed at 1440px and 390px. Mobile Season layout refined after
  inspection. Screenshots are workspace artifacts outside the source repository.
- Final post-refinement `pnpm build`, browser tests (6/6), lint, type-check and
  `pnpm format:check` all pass.
- `pnpm audit --prod --audit-level=high`: no known production dependency vulnerabilities.
- The release-build guard was exercised without a production origin and correctly
  refused to build a release before packaging.

These are local runs. CI is configured but has not run on GitHub. Tests of the
SessionVerifier use a controlled fake; they are not proof of implemented login,
password hashing, CSRF, expiry, revocation or session rotation.

## Incomplete work and risks

1. **Authentication is designed, not implemented.** No login, registration, recovery,
   rate limiter, real verifier, CSRF middleware or encrypted desktop token storage.
   Do not expose personal data until these are tested end to end.
2. **No hosted resources or credentials provisioned.** No Neon migration, Vercel
   deployment or live synchronized account. PGlite does not verify hosted TLS,
   pooling, restricted roles or operational restore behavior.
3. **No Windows runtime/installer test.** Electron source type-checks and bundles;
   actual GUI launch, NSIS installation, DPAPI, signing and upgrades remain unverified.
4. Daily plans, CRUD for direction/tasks, Inbox UI, scheduling, focus timer, routines,
   Start/Close Day, favorites, Vault and command palette are still Phase 1 work.
5. All career, wealth, business, health, full faith/reflection modules and integrations
   remain future phases. No finance calculations or import-deduplication implementation.
6. DB checks do not validate IANA timezones or whole-Season allocation totals. Those
   must be enforced transactionally before services expose writes. Ownership FKs do
   not replace SELECT authorization. No production RLS policy is claimed.
7. Browser mobile checks use Chromium; actual mobile Safari, screen-reader/manual
   zoom verification and actual Windows Electron are still needed.
8. Backup RPO/RTO are documented targets, not a deployed or rehearsed backup service.
   Free-tier quotas/terms, signing cost and KJV UK rights need review before release.
9. The curated daily corpus repeats weekly. Extend with a future-effective version
   so today's content cannot change on refresh during a deployment.

## Exact next recommended Codex task

**Implement the authenticated Inbox vertical slice for web and Electron.**
Read this file, `architecture.md`, `data-model.md`, and product-spec sections 12,
35, 76 and 85 first. Add Argon2id email/password sign-in with controlled account
creation; real hashed opaque sessions; secure HttpOnly cookies; same-origin CSRF
checks; persistent rate limits; logout/revocation and tested rotation. Complete any
required additive auth migration. In Electron, persist only the exact session
cookie through main-process Windows DPAPI, never renderer storage, with a safe
nonpersistent fallback when encryption is unavailable.

Then expose validated Inbox capture/list through the existing service boundary,
add a small authenticated capture/list UI with retry-safe behavior, and prove two
accounts cannot read, modify or link one another's records. Use a real isolated
PostgreSQL test environment in addition to PGlite, exercise web and desktop login,
verify sync on foreground/revalidation, and update these documents. Do not expand
into a second feature domain until this slice works securely from UI to database.
