# Offline-first desktop contract

The user clarified on 2026-10-12 that Life OS is solely for personal laptop use.
Hosted web deployment and synchronization are postponed. No network service is
required for the completed desktop app. Earlier online-first requirements are
superseded; the current hosted shell is not yet an offline application.

## Responsibilities and reuse

Cloud owns packages/database, packages/api, packages/app and apps/web changes, the
shared lockfile, and this contract. Local Windows owns apps/desktop, its packaging,
private runtime lifecycle, native trust/session persistence and disconnected tests.
The Windows lead works only on bounded requests: finish/checkpoint the current
cookie shutdown-drain fix, then pause. Do not continuously poll Cloud or run idle QA.
Cloud requests local integration/testing when a concrete backend/build is ready.
Do not edit Local's session-persistence.ts investigation or its native fixtures from
Cloud. Send required desktop dependency versions to Cloud before changing the shared
lockfile. Existing Phase 1 repositories, schemas, migrations and owner/session checks
are reused. No SQLite schema rewrite, remote sync or second public backend is planned.

## Bundled runtime and persistence

Use PGlite's filesystem-backed embedded PostgreSQL engine through Drizzle's pglite
adapter. Existing repositories already accept the shared PgDatabase interface; their
SQL and owner predicates are retained. Apply committed migrations 0000–0006 through
the normal ledger on initialization. No external PostgreSQL daemon, port or installed
Node.js is required. The database is accessible only inside the privileged local
backend process, never directly from the renderer. Embedded database ownership is
not a claim of PostgreSQL role/RLS isolation; authenticated service predicates and
composite ownership constraints remain mandatory.

Electron starts exactly one packaged Next standalone backend using its bundled Node
runtime/utility process, waits for readiness, then creates/loads the sandboxed window.
Include standalone server dependencies, static assets, PGlite WASM/data assets and SQL
migrations in packaging; no runtime download/build is permitted. Single-instance and
engine lifecycle guards prevent two writers. On quit, drain active requests, flush/
close PGlite and drain encrypted cookie writes before shutdown. Restart the local
backend only after its previous process has exited; retain saved data on failure.

Main supplies trusted local configuration before readiness:

- LIFE_OS_DESKTOP_DATA_DIR: the absolute private database directory, normally
  Electron userData/offline/database; no renderer chooses this path.
- LIFE_OS_DESKTOP_MIGRATIONS_DIR: absolute read-only bundled migration directory;
  copy packages/database/migrations into the packaged backend resources.
- APP_ORIGIN: exact HTTPS loopback origin selected by main, using 127.0.0.1 only.
- AUTH_SECRET: independent random material, persisted encrypted with safeStorage in
  main's private runtime record. Never use a compiled/shared secret or plaintext fallback.
- LIFE_OS_DESKTOP_SETUP_SECRET: ephemeral main-only first-account capability. Inject
  X-Life-OS-Setup only for this window's same-origin POST /api/auth/setup requests using
  a main-session request hook. Never expose this capability through renderer props/IPC.
- Database mode and secret are passed through private main/utility configuration;
  they are not CLI arguments or exposed to renderer code. DATABASE_URL is absent.

Hosted mode rejects a desktop data directory. Main must secure Windows directory ACLs
before opening files. Live PostgreSQL files initially rely on OS directory/disk privacy;
they are not falsely described as encrypted by safeStorage. Do not ship sensitive local
data storage without reporting/validating those ACL and encryption-at-rest limitations.

## Origin, cookies and certificates

Preserve HTTPS, Secure/HttpOnly host-only cookies, CSRF and exact-Origin checks locally.
The private backend binds loopback only, validates Host, and does not trust arbitrary
forwarded headers. Browser-safe packages still cannot import Node/database/Electron.
Generate a unique local TLS key/certificate and pin its exact identity in the main
session verification procedure for the assigned loopback origin. All other certificate
errors remain rejected. Never use ignore-certificate-errors, disable webSecurity, allow
arbitrary navigation or expose generic renderer IPC/preload/filesystem/database access.

Persist the local identity and origin/port securely. If a port conflict forces a changed
origin, fail closed or implement an explicit tested local-cookie transition; never load
whatever service occupies a port or reuse hosted cookies. Keep offline credentials in
a separate encrypted record from hosted sessions. Unavailable encryption fails closed
for persistence; no plaintext fallback. Local's cookie replacement/drain race must be
fixed and natively verified before claiming reliable restart restoration.

## First account and backup strategy

The user creates their own local account in a first-run setup flow. This is available
only in the trusted local runtime, with the existing strict account schema, Argon2id,
CSRF/Origin/body limits and transactional first-account guard. It is not a public hosted
registration API. Once initialized, use the existing login/session/logout model.
No invented user email/password, hardcoded default account or automatic public signup.

### Implemented backend protocol (version 1)

Build with pnpm build. apps/web/scripts/prepare-standalone.mjs copies static/public
assets and desktop-server.mjs into apps/web/.next/standalone/apps/web. Package the
ENTIRE apps/web/.next/standalone tree as a read-only backend resource directory;
copying only apps/web omits traced dependencies, WASM and SQL migrations.

Fork `<backend>/apps/web/desktop-server.mjs` with Electron utilityProcess, passing
sensitive configuration through its private parent message channel after construction.
The same entry supports Node fork solely for Cloud/CI tests, not an end-user dependency.
No secrets in arguments/logs. Send one message:

```text
{ type: "configure", version: 1,
  webRoot: <backend>/apps/web,
  dataDirectory: <userData>/offline/database,
  migrationsDirectory: <backend>/packages/database/migrations,
  authSecret: <persisted protected random secret>,
  setupSecret: <ephemeral protected main-only capability>,
  certificate: <unique loopback certificate PEM>,
  privateKey: <matching protected private-key PEM>,
  port: <persisted unprivileged port, or 0 on first startup> }
```

Main must generate/validate that identity, check/renew expired certificates, protect
runtime keys with safeStorage, and enforce Windows ACLs. Backend accepts only a matching
127.0.0.1 TLS certificate/key and binds IPv4 loopback. It initializes services/migrations
through an internally verified HTTPS probe BEFORE replying:

```text
{ type: "ready", version: 1, origin, certificateFingerprint256 }
{ type: "error", version: 1, stage: "startup" }
```

Compare ready origin/fingerprint to main's assigned instance, then install narrow local
certificate trust, header capability injection and cookie restoration before loading
the window. Hostname/port conflicts must fail closed. First setup appears at /login only
when the local database has no accounts; its POST requires the private main capability,
CSRF, exact Origin, shared schema, bounded persistent attempts and a transaction lock.
Hosted handlers do not expose setup. Concurrent attempts cannot create two first users.

On quit send `{ type: "stop", version: 1 }`; await `{ type: "stopped", version: 1 }`
AND process exit. The server drains requests and closes the embedded database before
acknowledging. Then drain main's encrypted cookie writes. No generic eval/file/database
messages exist. The filesystem lease refuses a second writer and currently fails closed
after unclean process loss. Guarded crash-lease recovery is NOT implemented; coordinate
that explicit next step rather than unlinking/resetting an arbitrary live database.

Cloud tests prove the packaged standalone entry, real loopback TLS, physical engine
restart, full-day API writes, owner isolation, first-account guard and logout replay.
They do not verify Electron utilityProcess, native trust, safeStorage, ACLs or installation.

Offline backups must not require pg_dump, WSL, Neon, POSIX tools or paid storage.
Plan a consistent embedded snapshot exported through PGlite, encrypted with AES-256-GCM
under a separate random key protected by main safeStorage. User-selected backup folder
is handled by a narrow native main operation, not a renderer filesystem bridge. Omit
live authentication state or explicitly invalidate it on guarded recovery before serving
requests. Verify authentication tag and migration ledger before cutover; restore into
a separate empty directory and retain the old database until fresh login/data checks.
The user selected another existing backup location; the path must be chosen locally,
not invented. Recovery-key export/recovery must be designed so loss of Windows profile
does not silently make all backups unrecoverable. These backups are planned, not built.

## Acceptance gate

Install on Windows without external Node/PostgreSQL or a manually started server.
Disconnect network and perform setup/login → Start Day → plan → schedule → Focus →
capture/process → Close Day → logout. Relaunch/reboot and verify actual database and
safeStorage session behavior. Test another local account's isolation, CSRF/Origin,
renderer/navigation/certificate denials, concurrent startup, backend crash/recovery,
quit during writes, backup/restore, and uninstall/upgrade data policy. Record the exact
build/OS and distinguish Cloud component tests from real Windows evidence.

Phase 1 daily-use release remains incomplete until these offline gates pass. The user
requested completion of both Phase 1 and Phase 2 plus a final done/remaining report.
Phase 2 begins afterward. Hosted resources may remain paused; neither Vercel nor Neon is an
offline dependency. Any future synchronization requires a separate explicit design.
