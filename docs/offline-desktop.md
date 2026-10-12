# Offline-first desktop contract

The user clarified on 2026-10-12 that Life OS is solely for personal laptop use.
Hosted web deployment and synchronization are postponed. No network service is
required for the completed desktop app. Earlier online-first requirements are
superseded; the current hosted shell is not yet an offline application.

## Responsibilities and reuse

Cloud owns packages/database, packages/api, packages/app and apps/web changes, the
shared lockfile, and this contract. Local Windows owns apps/desktop, its packaging,
private runtime lifecycle, native trust/session persistence and disconnected tests.
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

- LIFE_OS_DESKTOP_DATA_DIR: absolute private directory under Electron userData/offline.
  Database files use its database subdirectory; no renderer chooses this path.
- APP_ORIGIN: exact HTTPS loopback origin selected by main, using 127.0.0.1 only.
- AUTH_SECRET: independent random material, persisted encrypted with safeStorage in
  main's private runtime record. Never use a compiled/shared secret or plaintext fallback.
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

Phase 1 daily-use release remains incomplete until these offline gates pass. Phase 2
begins afterward. Hosted resources may remain paused; neither Vercel nor Neon is an
offline dependency. Any future synchronization requires a separate explicit design.
