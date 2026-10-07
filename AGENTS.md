# Working on Life OS

Read `docs/progress.md`, `docs/architecture.md`, `docs/data-model.md`, and the relevant sections of `docs/product-spec.md` before changing architecture. Work in coherent vertical slices. Keep progress and deployment instructions accurate.

- The product is online-first and has one hosted backend for web and Electron.
- No LLM, paid data API, bank integration, or spiritual productivity scoring.
- Browser-safe packages must never import database, server service, Node, or Electron code.
- Every private operation derives ownership from a verified server session, never a request user ID. Preserve composite ownership constraints.
- No personal-data endpoints until authentication and authorization are implemented and tested together.
- Keep the current preview clearly labeled; never present sample data as stored user data.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and relevant browser tests. Document anything unverified.
- Before migrations reach production, review SQL and test it on an isolated PostgreSQL branch. No destructive schema changes without a recovery plan.
