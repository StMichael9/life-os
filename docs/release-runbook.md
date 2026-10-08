# Phase 1 hosted release runbook

## Verified checkpoint and external prerequisites

The release tooling is implemented and rehearsed with disposable PostgreSQL 17 and a
production Next build behind verified local HTTPS. This is **not a deployed URL** or
verification of Vercel, Neon, their billing eligibility, pooling or production TLS.
Provider tools are now connected. Vercel Hobby project life-os exists; Neon Free
project lively-surf-21544686 is PostgreSQL18 in Ohio. Staging migrations/grants are
applied and their ledger/ownership checked; production is still empty. The release is
paused at the user's request, with no deployment/secrets/personal account. Vercel
automatic builds are skipped using project Ignored Build Step exit 0; remove that gate
only when ready to resume the reviewed release. See progress
for exact IDs, credential provisioning and pending standalone-runtime verification.

Local CLI/API networking is blocked by this Cloud environment's enforced host policy.
CLI 8.0.12 and local skills/OAuth MCP config exist; the verified project/branch is
pinned in gitignored .neon. The empty neon.ts enables no optional services. neon deploy
failed to reach the API; this is not a deployed configuration claim. Resume with the
connected provider tools or an approved CLI/network environment without sharing secrets.

Confirm personal-use eligibility and the actual free plans in both consoles before
creating resources. Do not supply billing consent, upgrade plans, enable paid add-ons
or enable chargeable usage. Check current database/storage/compute/connection and
hosting/transfer/build limits, autosuspension and backup retention. Limits are not
verified here and may change. Free compute can cold-start; no uptime guarantee is
established. If required staging separation cannot fit the available free allowance,
stop and use the disposable local staging rehearsal instead of paying. Do not copy
personal production data into preview branches or CI. Do not rely on Neon history as
the only backup.

## Database initialization (trusted operator only)

1. Create an explicitly isolated PostgreSQL **18** database (the actual user-selected project version) in an eligible free Neon
   project. Use a region compatible with the Vercel app; verify current free options.
   Production, staging and restore targets must have distinct databases and secrets.
   Use a fresh empty database; this runbook does not transfer ownership of an existing
   installation. Check the selected project/database before any SQL.
2. From a trusted terminal, use the administrator connection to apply
   `ops/postgres/bootstrap.sql`. It creates four unprivileged, initially `NOLOGIN`
   roles and assigns public schema ownership/DDL rights to `life_os_migrator`.
   It removes PUBLIC database connection/temporary-object rights and public CREATE.
   Never place the administrator credential in the web app.
3. Enable LOGIN for `life_os_migrator`, `life_os_runtime`, `life_os_operator` and
   `life_os_backup`. Set independent random passwords with interactive `psql
\password role_name`. Do not use password-bearing SQL in shell history/argv.
   The runtime/operator/backup roles must not inherit or be members of administrator,
   database-owner or migration roles. Bootstrap gives only the trusted administrator
   explicit SET permission to the migrator for ownership/default-privilege setup. Provider-created role memberships must be reviewed; do not bypass the
   permission verifier if it rejects them. Actual Neon administrator capabilities
   and these grants still need verification.
4. Export the direct migrator URL as `MIGRATION_DATABASE_URL` in this operator process
   and run `pnpm release:migrate`. The command applies and verifies the hashes and
   timestamps of exactly migrations **0000–0006**, with 22 application tables.
   It never falls back to the runtime credential. No new application migration was
   added during this release-readiness run.
5. As `life_os_migrator`, apply `ops/postgres/grants.sql`. This explicit, transactional
   grant list gives the runtime only current Phase 1 operations; account INSERT is
   operator-only, backup is read-only, and migration ledger access is not runtime.
   Runtime has narrowly scoped UPDATE(id) for owner locks and UPDATE(processed_at)
   for Inbox processing. It cannot create schemas/tables, edit password hashes,
   TRUNCATE, delete accounts or assume the migration role. Apply grants again after
   every approved migration/restore; there are no future-table blanket runtime grants.
6. Export the pooled runtime URL as `DATABASE_URL` and run `pnpm release:verify`.
   This checks the committed migration ledger using the separate migration login,
   then the actual standalone runtime login's ownership, memberships, DDL, table,
   column and privileged-function permissions. Keep both credentials out of logs.

All hosted URLs must use `sslmode=verify-full`. Replace an insecure/default `require`
mode; do not append duplicate modes or disable certificate checks. Node uses trusted
system CAs; native matching PostgreSQL clients use `PGSSLROOTCERT=system` with verify-full.
Use direct connections for migrations/backups and provider pooling for the runtime.
Production operator URLs must not set `LIFE_OS_OPERATIONS_ALLOW_LOCAL`. Its opt-in
exists only for loopback `_tests`, `_e2e` and `_restore` fixtures. A URL/schema check
alone is not proof of remote TLS: run the commands on the actual hosted database.

## Vercel web application

1. Import `StMichael9/life-os`, selecting the reviewed release commit from `work`.
   Project Root Directory is **apps/web**. Enable inclusion of files outside that
   directory. `apps/web/vercel.json` installs from the workspace root with the frozen
   lockfile, verifies the standalone runtime privileges over verified database TLS with
   pnpm release:runtime, then builds the web package from its directory. Use Node 24 and pinned
   pnpm 11.19.0. Do not deploy or package Electron through Vercel.
2. Choose the stable HTTPS Vercel subdomain; no paid custom domain is necessary.
   Install only server-side `DATABASE_URL` (runtime role), exact `APP_ORIGIN` (no
   path/trailing slash) and a fresh independently generated `AUTH_SECRET` of at least
   32 random bytes. Use `openssl rand -base64 48` locally without publishing its output.
   Remove `AUTH_ALLOW_HTTP_LOOPBACK`. Never install migration, administrator, operator,
   backup, restore or provider credentials in Vercel, including NEXT_PUBLIC variants.
3. With the same runtime settings in a trusted process, run `pnpm release:config`.
   This checks HTTPS/TLS configuration and secret requirements without printing values;
   it does not connect to providers. Vercel private-service initialization independently
   rejects unsafe settings/privileged credentials. Correct configuration before launch.
4. Deploy, then verify the stable URL returns the configured origin. Preview protection
   or provider redirects can prevent Electron/CSRF flows; test them explicitly. Preview
   deployment URLs require their own exact origin/database/secret and controlled account.
   Do not reuse production data/session secrets in arbitrary commit previews.

## Controlled personal account

Use an interactive trusted terminal. Temporarily bind `DATABASE_URL` to the direct
**operator** role and export the intended `AUTH_SECRET`; run `pnpm account:create`.
Provide email, display name, IANA timezone and a unique password through the hidden
prompt. Restore the runtime binding immediately after the command. Never put the
password in chat, env, argv, CI or source. No public registration or recovery endpoint
exists. Store the account password in the user's password manager. Recovery/export/
account deletion are not newly implemented by this operational release.

## Actual hosted acceptance checklist

Use throwaway controlled staging accounts A and B before creating important records.
Do not send their private content or tokens to CI artifacts. Record the URL/commit,
timestamp and pass/fail results, not secrets.

- Verify a publicly trusted HTTPS certificate, HTTP-to-HTTPS behavior, nonced CSP
  without unsafe-eval, HSTS, no-store private pages/APIs and no database secrets in assets.
- Check session cookies have `__Host-`, Secure, HttpOnly, Path=/, SameSite=Lax and no
  Domain. Invalid credentials and anonymous private calls must fail. There is no signup.
- Unsafe requests with missing CSRF or another Origin must return 403; valid requests
  must work. Exercise persistent login limiting without locking the personal account.
- A: login → Start Day → One Thing/Big 3 linked to a Task → time block → Focus start,
  pause/resume/finish → capture/retry/process → complete outcomes → Close Day.
  Reload and use another signed-in browser to verify persisted data/reflections.
- B must see no A plan/Task/capture/Focus history. A-owned IDs must fail through B's
  session; an owner header must never change the authenticated account.
- Test session rotation after 15 minutes and bounded old-token grace. Logout must
  revoke the token; replay/restart must not restore it. Expired/revoked sessions fail.
- Run `release:verify` against Neon, check pooled connections/cold starts and bounded
  response latency. Rehearse restoration as below and log successful recovery of
  private records and fresh login. Do not claim production readiness before this passes.

## Encrypted backups and restore

Operations require a trusted POSIX machine (Linux/macOS or a trusted WSL environment),
PostgreSQL client tools matching the server major, and owner-only local files. These
are operator tasks, not HTTP endpoints, Electron renderer features or Vercel cron jobs.
The Cloud fixture uses PG17 tools inside its disposable container; production must
install trusted PG18 tools. Permission checks reject Windows filesystems without
POSIX ownership rather than accepting insecure storage.

Create a private directory **outside the repository**, set `umask 077`, and generate
a binary key with `openssl rand -out /private/location/key.bin 32`. Key file mode is
0600; directory is 0700. Keep a recoverable copy of this key separate from encrypted
archives, in storage already available to the user at no charge. Losing the key loses
the backup. Do not put it in Vercel, CI artifacts or git.

For a daily snapshot, securely export `BACKUP_DATABASE_URL` for `life_os_backup`,
`LIFE_OS_BACKUP_KEY_FILE`, and `LIFE_OS_BACKUP_FILE` (a unique absolute filename ending
`.lifeos.enc`); run `pnpm backup`. The tool verifies read-only permissions and the
0000–0006 ledger, streams a consistent custom-format pg_dump directly into AES-256-GCM,
and refuses to overwrite an archive. Account password hashes and private records are
encrypted; session rows and login-rate-limit rows are excluded so recovery requires
fresh login. No plaintext dump is written during backup. Archive publication requires
hard-link support in the private local directory; copy only the completed ciphertext
to independently protected storage.

Schedule this command on an already available trusted machine using its OS scheduler.
Use unique filenames, failure notifications without secret/content output, and check
last successful backup age before daily use. Retain at least seven daily archives
if existing free storage permits; periodically keep a separately stored copy. Delete
expired archives deliberately after confirming a recent successful restore. No
production scheduler/offsite destination has been provisioned in this run. **24-hour
RPO/RTO are targets, not measured hosted guarantees.**

To rehearse recovery:

1. Create a separate empty PostgreSQL database matching the source major (18 for this project) whose name ends in `_restore`.
   Bootstrap it with the trusted administrator. Use its migration login, never the
   active database. Keep it inaccessible to the public app during rehearsal.
2. Export `RESTORE_DATABASE_URL`, the key/archive file variables, and
   `LIFE_OS_RESTORE_CONFIRM` equal to that exact database name. Run `pnpm restore`.
3. The entire GCM archive is authenticated before any SQL. A temporary authenticated
   plaintext dump is placed only in a private 0700/0600 directory and removed on
   completion/error; secure disk erasure is not guaranteed. Use encrypted trusted disk.
   Nonempty targets, extra functions/types/schemas, wrong keys/tampering and a mismatched
   confirmation are refused. Restoration is a single transaction with exit-on-error;
   replacement of the empty public schema occurs only after that emptiness check.
4. Verify seven migration hashes, 22 tables, zero restored sessions/rate limits, then
   reapply `grants.sql`. Run `release:verify` against this database with its runtime
   URL. Connect a separate protected staging app and verify fresh account login,
   owner isolation, plan/reflections, Inbox, Focus and representative record counts.
5. Record elapsed restore time and evidence without private content. Do not overwrite
   production automatically. A real recovery cutover requires a reviewed empty target,
   grants, new session secret, updated runtime URL and smoke checks. Never assume a
   successful backup proves recoverability without this drill.

## Repeatable local release evidence

Default tests explicitly skip the three operations tests and one HTTPS rehearsal
without opt-in fixture URLs. CI creates distinct `life_os_release_tests`,
`life_os_release_restore` and `life_os_smoke_tests` databases. Operations tests are
destructive and local-only; cluster-level roles/passwords are serialized by an advisory
lock. Run `pnpm build` before the HTTPS rehearsal:

```sh
pnpm exec vitest run packages/database/src/operations.test.ts
pnpm exec vitest run packages/database/src/release-smoke.test.ts
```

Supply the corresponding guarded fixture env variables documented in `.env.example`;
native pg_dump/pg_restore must match PG17 (CI forwards these clients into its fixture
container). The HTTPS rehearsal trusts only its ephemeral localhost certificate;
it does not disable TLS verification. It launches/stops its own production Next process
and uses the real API/routes and separate account-creation/runtime roles. Browser E2E
separately exercises desktop/mobile UI/axe. These do not replace hosted acceptance.

See [Windows handoff](windows-handoff.md) for the isolated native testing task.
