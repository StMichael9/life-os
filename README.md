# Life OS

A private operating system for deliberate living. **Do what matters.**

Phase 0 foundation and Phase 1 daily execution are implemented: controlled accounts,
secure sessions, Inbox, Direction, Tasks, deliberate daily planning, scheduling,
Focus, recurring routines, Vault / Not Now, explainable priority recommendations,
rule-based Insights and global keyboard search/capture. Authenticated Today uses
real PostgreSQL records; anonymous Today remains a labeled preview. Web and the
sandboxed Electron renderer share the same hosted accounts and application.

Hosting/configuration and native Windows verification remain separate release tasks.
See [progress](docs/progress.md) for verified behavior and practical limits.
Vercel configuration, migration/runtime permission checks and encrypted backup/restore
tooling are ready; follow the [hosted release runbook](docs/release-runbook.md).

## Develop

Requirements: Node.js 24, pnpm 11.19.0 and isolated PostgreSQL for authentication and private records.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Today can be previewed without database credentials.
For authenticated Phase 1 workflows, configure server variables from `.env.example` in the shell
(or an app-local Next env file); CLI commands need exported variables. Use a unique
random `AUTH_SECRET`, exact `APP_ORIGIN`, and loopback HTTP opt-in only for local dev.
Never commit real credentials.

```sh
pnpm db:migrate
pnpm account:create
```

The operator creates accounts interactively with hidden password input. There is
no public registration or recovery route. See [deployment](docs/deployment.md) for
separate migration/runtime roles and setup. Migrations are reviewed SQL, not schema
pushes. `pnpm db:generate` checks generation against the committed schema.

In a second terminal, `pnpm desktop:dev` opens the same application in Electron.
Electron 44 may require `pnpm --filter @life-os/desktop exec install-electron` before
first launch. End users run the packaged app, not development commands. HTTPS
sessions persist through main-process OS encryption; local HTTP sessions do not.

## Verify

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm peers check
pnpm audit --prod --audit-level=high
```

Unit tests apply committed migrations to PGlite by default. Real PostgreSQL and the
40 authenticated browser cases require separate disposable fixture databases;
[deployment](docs/deployment.md) documents the guarded URLs and destructive fixture
setup. CI provisions these databases. Without an E2E URL, auth cases explicitly skip.
Browser tests use the production build; an existing Chromium can be selected via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Continue

Read [progress](docs/progress.md), [architecture](docs/architecture.md),
[data model](docs/data-model.md), [design system](docs/design-system.md), and
[deployment](docs/deployment.md). The original specification is preserved in
[product-spec.md](docs/product-spec.md). Follow [AGENTS.md](AGENTS.md).
