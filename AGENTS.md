# Working on Life OS

Read `docs/progress.md`, `docs/architecture.md`, `docs/data-model.md`, and the relevant sections of `docs/product-spec.md` before changing architecture. Work in coherent vertical slices. Keep progress and deployment instructions accurate.

- Current user priority (2026-10-12): an installed offline Electron application on
  the laptop. Electron must start its bundled local backend automatically; no terminal,
  separately launched server, installed Node runtime or external database daemon is
  required for daily use. Vercel/hosted production work is postponed. Preserve existing
  services, schemas, owner checks and renderer protections when adding local persistence.
  Hosted web/synchronization is deferred; do not fabricate cloud sync or weaken security.
- No LLM, paid data API, bank integration, or spiritual productivity scoring.
- Browser-safe packages must never import database, server service, Node, or Electron code.
- Every private operation derives ownership from a verified server session, never a request user ID. Preserve composite ownership constraints.
- No personal-data endpoints until authentication and authorization are implemented and tested together.
- Keep the current preview clearly labeled; never present sample data as stored user data.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and relevant browser tests. Document anything unverified.
- Before migrations reach production, review SQL and test it on an isolated PostgreSQL branch. No destructive schema changes without a recovery plan.
