# Life OS

A private operating system for deliberate living. **Do what matters.**

This repository contains the Phase 0 foundation and a small daily-content slice.
The web shell runs, but this is **not yet a usable personal-data application**:
authentication, persistent planning, and account synchronization are not connected.

## Develop

Requirements: Node.js 24, pnpm 11.19.0. Install pnpm through your preferred package-manager setup.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. No database or credentials are needed to preview the
shell. In a second terminal, `pnpm desktop:dev` opens the same app in Electron.
Electron 44 may require `pnpm --filter @life-os/desktop exec install-electron`
before the first launch. These commands are for **development**, not end-user usage.

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

For a preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its absolute
path. Browser tests use the production server and need a completed build.

## Database

Use an isolated PostgreSQL database. Set `DATABASE_URL` in the command environment
(or use your shell's dotenv loader); `.env.example` is documentation, not loaded
automatically by the migration script. Never commit credentials.

```sh
pnpm db:generate
pnpm db:migrate
```

Migrations are reviewed SQL, not schema pushes. Unit/integration tests apply the
same migration files to in-memory PGlite; they need no hosted database.

## Continue

Start with [progress](docs/progress.md), then [architecture](docs/architecture.md),
[data model](docs/data-model.md), [design system](docs/design-system.md), and
[deployment](docs/deployment.md). The full original specification is preserved in
[product-spec.md](docs/product-spec.md). Follow [AGENTS.md](AGENTS.md).
