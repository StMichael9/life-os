# Life OS

A private operating system for deliberate living. **Do what matters.**

This repository contains the Phase 0 foundation and authenticated Inbox, Direction and Tasks slices:
controlled accounts, secure login/session/logout, and owner-only persistent capture
and listing; Seasons, Goals, Milestones and Projects with owned hierarchy links.
Tasks support owned Goal/Project links, edits, completion and retry-safe Inbox conversion.
Authenticated Today shows the real active Season. Other Today planning remains a
preview; other private domains are not implemented. Hosted deployment and native Windows
verification remain outstanding; see [progress](docs/progress.md).

## Develop

Requirements: Node.js 24, pnpm 11.19.0 and isolated PostgreSQL for authentication and private records.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Today can be previewed without database credentials.
For login, Inbox, Direction and Tasks, configure server variables from `.env.example` in the shell
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
26 authenticated browser cases require separate disposable fixture databases;
[deployment](docs/deployment.md) documents the guarded URLs and destructive fixture
setup. CI provisions these databases. Without an E2E URL, auth cases explicitly skip.
Browser tests use the production build; an existing Chromium can be selected via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Continue

Read [progress](docs/progress.md), [architecture](docs/architecture.md),
[data model](docs/data-model.md), [design system](docs/design-system.md), and
[deployment](docs/deployment.md). The original specification is preserved in
[product-spec.md](docs/product-spec.md). Follow [AGENTS.md](AGENTS.md).
