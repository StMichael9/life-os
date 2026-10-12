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
Generate a unique private per-installation CA and loopback serverAuth leaf chain
(Electron utility/BoringSSL requires a CA anchor). Discard the signing CA private key
after issuing the leaf; retain only protected leaf private key/public chain. Install
nothing in OS trust. Pass leaf-first PEM chain to the backend and pin its exact LEAF identity in the main
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
copying only apps/web omits traced dependencies, WASM and SQL migrations. Windows Next
may produce absolute junctions into its build workspace, and builder filters may omit
root node_modules even for extraResources. Desktop preparation must materialize traced
files/dependency aliases into portable staging, verify no junction/symlink dependency
on the workspace, reject environment files case-insensitively, and explicitly package
root dependencies. Acceptance must use the actual installed/copied payload outside the
build workspace with module-path inheritance removed. A native development launch is
not proof of a portable installer. Build this
standalone tree on the Windows target architecture so traced Argon2 native bindings
match Electron's bundled Node; do not package Cloud's Linux native binaries for Windows.

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

Startup diagnostics never include exception messages/stacks, paths, keys, credentials
or data content. The readiness probe uses a dedicated direct HTTPS agent with ordinary
chain/IP validation and an additional exact certificate fingerprint check; it never
inherits the global proxy agent or reuses TLS sessions. These changes pass Cloud tests,
not a claim that Windows utility TLS startup is fixed.

Main must generate/validate that identity, check/renew expired certificates, protect
runtime keys with safeStorage, and enforce Windows ACLs. Backend accepts only a matching
127.0.0.1 TLS certificate/key and binds IPv4 loopback. It initializes services/migrations
through an internally verified HTTPS probe BEFORE replying:

```text
{ type: "ready", version: 1, origin, certificateFingerprint256 }
{ type: "error", version: 1, stage: "startup",
  phase: "configuration" | "tls" | "dependencies" | "prepare" | "listen" | "initialize",
  code: <allowlisted errno/TLS/module code, or STARTUP_FAILED>,
  category: "Error" | "TypeError", httpStatus?: <readiness HTTP status only> }
{ type: "error", version: 1, stage: "database" | "requests" | "framework", category: "Error" | "TypeError" }
```

Compare ready origin/fingerprint to main's assigned instance, then install narrow local
certificate trust, header capability injection and cookie restoration before loading
the window. Hostname/port conflicts must fail closed. First setup appears at /login only
when the local database has no accounts; its POST requires the private main capability,
CSRF, exact Origin, shared schema, bounded persistent attempts and a transaction lock.
Hosted handlers do not expose setup. Concurrent attempts cannot create two first users.

On quit send `{ type: "stop", version: 1 }`; await `{ type: "stopped", version: 1 }`
AND process exit. The server drains requests and closes the embedded database before
acknowledging. Stop also awaits startup/migration initialization; a canceled startup
never emits ready or loads a window. Then drain main's encrypted cookie writes. No generic eval/file/database
messages exist. The filesystem lease refuses a second writer. Trusted offline startup
can recover a valid lease only when the recorded PID is definitively absent (ESRCH),
under an exclusive recovery guard. Live/reused PIDs, unknown identity, permissions,
symlinks and an interrupted recovery guard fail closed; no data is reset. PGlite then
opens the existing files and checks the exact migration ledger. Cloud tests kill a real
backend process and verify committed records and competing restart attempts. Windows
must still verify native process exit, filesystem/ACL behavior and crash recovery.

SSR pages and API routes share a private process-global service promise, rather than
opening an engine per Next module graph. Cloud tests check the actual first-account
form and authenticated page body; a 200 response containing a streamed redirect is
not treated as authenticated page success.

Cloud tests prove the packaged standalone entry, real loopback TLS, physical engine
restart, full-day API writes, owner isolation, first-account guard and logout replay.
They do not verify Electron utilityProcess, native trust, safeStorage, ACLs or installation.

### Implemented encrypted backup protocol (private parent channel only)

Offline backup requires no pg_dump, WSL, Neon, external daemon or paid storage. The
backend exports a consistent PGlite snapshot after active HTTP writes drain, then
AES-256-GCM encrypts it with a separate 32-byte recovery key. Snapshot creation uses
an exclusive query barrier and rejects an in-progress transaction. An authenticated
versioned manifest carries the exact migration hashes/timestamps. The uncompressed
snapshot limit is 256 MiB; this implementation buffers snapshot/ciphertext in memory,
so larger data requires a future streaming/versioned format. This is personal-data
backup, not a database-at-rest encryption claim.

Main generates/protects the independent recovery key with safeStorage and never passes
it to the renderer, HTTP, argv or logs. Use structured-clone typed byte arrays, not
base64/JSON strings (Node fork fixtures use serialization: advanced). Send:

```text
{ type: "backup", version: 1, requestId: <UUID>, backupKey: <Uint8Array(32)> }
{ type: "backup-ready", version: 1, requestId, archive: <encrypted Uint8Array> }

{ type: "restore", version: 1, requestId: <UUID>, backupKey: <Uint8Array(32)>,
  archive: <encrypted Uint8Array>, candidateDirectory: <absolute EMPTY private directory> }
{ type: "restore-ready", version: 1, requestId }
{ type: "operation-error", version: 1, requestId, operation: "backup" | "restore" }
```

Only one maintenance operation runs at a time. New HTTP requests temporarily receive
503/no-store/Retry-After while existing writes drain; request timeout/errors fail the
operation rather than inventing success. Stop awaits maintenance and engine closure.
No backup/restore HTTP route, preload or generic renderer IPC exists.

Main must provide narrow native menu/dialog actions, explicit restore confirmation,
user-selected encrypted-archive location, protected recovery-key storage and a separate
recoverable key export/import procedure. The user picked another existing backup
location; choose it locally rather than inventing it. Write ciphertext atomically with
no overwrite and report cancellation/free-space/errors. Recovery-key storage cannot
silently depend on the original Windows profile: encrypted key loss otherwise makes
archives unrecoverable. These native actions and recovery-key usability are pending.

Restore authenticates the entire archive and checks the bundled migration identity
BEFORE touching a target directory. It only opens a separate empty candidate, validates
its actual ledger, removes all restored sessions/rate limits, and closes it. The current
source is preserved and remains usable. Snapshot archives may contain hashed historical
auth state, but no restored session is allowed to authenticate. Native cutover is NOT
implemented by the backend: main must stop/await the old process, retain the old database,
select the verified candidate through protected runtime metadata and start it requiring
fresh login. Do not overwrite the active directory or delete rollback data. Report native
cutover/key-recovery/relaunch evidence separately from component restore tests.

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
