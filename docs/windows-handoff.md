# Separate Local Windows verification handoff

## Superseding assignment: offline desktop — 2026-10-12

The user explicitly postponed Vercel and needs offline laptop use. STOP the hosted
acceptance/reauthorization task below; it is now historical. Do not provision production
or require Vercel access to continue. Cloud returned the temporary staging operator and
backup roles to NOLOGIN. Existing staging/runtime is retained; production remains empty.

The required desktop behavior is: install → click Start-menu icon → Electron launches
its bundled private local backend/database → account sign-in/creation → all Phase 1
workflows persist while disconnected → quit/relaunch restores saved data. No separately
started server, external Node install or PostgreSQL daemon may be required for end users.

Coordinate the concrete local transport/bootstrap contract with Cloud before editing
shared boundaries. Cloud owns embedded PostgreSQL-compatible persistence and web/service
composition; Local owns apps/desktop packaging/lifecycle/TLS trust/session persistence
and native Windows tests. Preserve sandbox/context isolation, unprivileged renderer,
no generic IPC/preload, pinned origin/navigation and certificate/permission protections.
Do not fix loopback certificate handling with a global TLS bypass, and never place an
administrator database or filesystem API in the renderer. Encrypted session storage
retains safeStorage with no plaintext fallback. Test real disconnected mutations, quit/
relaunch persistence, automatic backend stop/recovery and packaged install behavior.

The user will create their own account. They selected another existing backup location;
its exact path is not yet specified. Do not invent an account or offsite backup destination.
Hosted/sync release can be revisited later; do not claim it is implemented.

---

## Active hosted acceptance assignment — 2026-10-12

The user resumed this work and explicitly authorized Cloud/local coordination.
Cloud can read the local chat but cannot currently send/resume threads; the local
lead can send updates to Cloud thread `01a1150e-f360-7487-99b8-5e06e8d4f039`.
Read Cloud's current progress or these shared docs for replies. Do not print/send
secrets in either chat. Keep the Windows checkout and branch isolated.

### Target and credential procedure

- Fetch `work`; docs checkpoint d4920db, deployed application commit
  ba9de1709b41c3c0aa6ec8f72baf7b7c4b457349. Include both shared date-selection and
  Focus-version fixes in local QA without overwriting windows/desktop-qa.
- Exact staging origin: https://life-os-git-work-stmichael9s-projects.vercel.app.
  READY deployment: dpl_7wPrhVgDWdGsb2mdrZyTnu2vRZ59. Protection remains enabled;
  Cloud protected-fetch/log endpoints returned 403. Try the local Vercel connector/
  authenticated CLI or origin-scoped development OIDC access as documented in the
  Vercel protected-deployment skill. Do not disable protection or navigation checks.
- Neon project lively-surf-21544686, branch staging-release
  (br-fragrant-feather-b51tx7bt), database neondb, PostgreSQL18 in Ohio. Direct host:
  ep-empty-cell-b5if4u55.c-7.us-east-2.aws.neon.tech; pooled host adds -pooler.
  Production br-super-star-b5edgceo remains empty and is NOT a fixture target.
- Staging life_os_operator and life_os_backup now have independent random LOGIN
  credentials, no administrator/CREATE/migrator membership. Runtime remains restricted;
  migrator remains NOLOGIN. Fetch staging-only role connection strings through your own
  authenticated Neon get_connection_string tool, naming the explicit project/branch/
  database/role. Secure retrieval was verified without printing values. Never use the
  default owner URL in the app or a test fixture's destructive seed/TRUNCATE routine.
- Normalize URL sslmode to exactly verify-full. Use direct operator/backup connections
  and the pooled runtime. Keep credentials in a protected local process/store; never
  in argv, Git, chat, browser storage or shared artifacts. Report standalone connection/
  TLS/grant checks, not just administrator catalog inspection.

### Local ownership and acceptance gates

Own the **hosted browser workflow/security evidence**, real Electron acceptance, and
the **PG18 encrypted backup/restore rehearsal** if a trusted POSIX/WSL environment is
available. Cloud owns provider settings, SQL/migration review and production release.
No production mutation until hosted staging evidence passes and the release is coordinated.

1. Resolve protected staging access. Create two NEW controlled synthetic QA accounts
   through the existing service/repository using the operator role. Generate strong
   fixture passwords locally; keep them in memory or an appropriately protected local
   store and never report them. Account creation hashes passwords independently of
   the web session secret: an independent ephemeral secret may initialize createAuthService
   for createAccount only; never replace the deployed AUTH_SECRET. Personal production
   account creation remains a separate interactive task after acceptance.
2. Run the runbook's actual full-day browser checklist and database persistence/owner
   isolation checks, including late/lost responses, Focus pause/resume/finish, selected
   dates, reload/second browser, CSRF, logout replay and bounded session rotation. Use
   only synthetic staging accounts and account-specific rows. No TRUNCATE, schema reset,
   backdating real users' sessions or disabling authentication to force success.
3. Run hosted Electron checks with the SAME origin/accounts/backend. If Vercel SSO
   redirects are blocked by the renderer's origin policy, document the access blocker;
   do not add credential IPC, preload, external-navigation allowances or a second backend.
4. Check POSIX/WSL and matching PG18 client availability for the existing backup tooling.
   If available, create a private key outside repository/sync storage, then encrypt a
   staging snapshot with the read-only backup login. Rehearse into an explicitly separate
   EMPTY *_restore database/branch with reviewed bootstrap/grants. Ask Cloud to prepare
   that target if needed. Never overwrite/reset staging/production to rehearse recovery.
   Verify fresh QA login, original records, ownership and zero restored sessions/limits.
5. Report evidence with URL, exact application commit, time, pass/fail and unresolved
   blockers; omit token/password/private-content artifacts. Production account identity
   and free offsite backup destination are being requested from the user in Cloud.
   Signing/icon/upgrade/uninstall remain separate native release items.

Cloud will disable temporary staging operator/backup LOGIN again after the coordinated
acceptance/recovery work. Do not rotate shared role passwords without coordinating.

---

Cloud Phase 1 product checkpoint: `3a946798b288e9473a2e5f9124510012be9ec289`
on `work`. The subsequent Cloud operational-readiness commit adds Vercel configuration,
restricted database role/grant tooling, encrypted backups/restore and release tests.
Use its pushed `work` tip after checking the Cloud report; keep a separate Windows
branch/check-out. Cloud has not changed Electron code or the Windows checkout.

**2026-10-12: protected staging is deployed, but hosted acceptance is unverified.**
Use https://life-os-git-work-stmichael9s-projects.vercel.app, the exact configured
CSRF origin. Production remains empty. Staging currently has zero controlled Life OS
accounts and Vercel deployment protection is enabled; those access prerequisites must
be resolved before Electron daily-use QA. Cloud protected-fetch/log tools return 403.
Do not disable origin/navigation protections to follow a Vercel sign-in redirect, and
do not access production personal data. Native results remain the separate Local chat's
reported evidence, not independently verified Windows runtime behavior in Cloud.

## Local Windows task

Read AGENTS and architecture/deployment/progress docs. Preserve the renderer sandbox,
context isolation, disabled Node integration, origin checks, navigation/window/permission
denials and absence of privileged IPC. Fix only concrete Electron/security problems;
do not redesign web/auth or implement Phase 2. Append dated, isolated verification
notes to progress/deployment docs so Cloud and Windows results remain distinguishable.

1. Record Windows edition/build, Node 24, pnpm 11.19.0, Electron version, commit and
   exact HTTPS fixture/staging origin. Install dependencies with the frozen lockfile.
2. Set `LIFE_OS_WEB_URL` to that exact origin before build/package. Test the production
   HTTPS app's controlled accounts and owner-scoped data from both browser and Electron.
   Development HTTP is deliberately nonpersistent and cannot verify native persistence.
3. Verify real safeStorage encryption availability/DPAPI behavior. Log only presence,
   file permissions and pass/fail; never tokens/ciphertext keys or personal capture text.
   Inspect user-data ACLs and verify the persisted session file contains no plaintext.
4. Login → quit/relaunch → restore session. Exercise rotation after 15 minutes and
   ensure restart restores the latest token. Logout must delete session ciphertext,
   revoke server-side session and remain signed out after restart. Expired/revoked or
   tampered session files must return to login. Unavailable OS encryption must fail
   closed with no plaintext fallback.
5. Test renderer Node denial, sandbox/context isolation, blocked cross-origin navigation,
   new windows/webviews, denied camera/microphone/location, certificate rejection and
   offline retry. Do not add ignore-certificate flags or a privileged preload bridge.
6. Build NSIS using `pnpm --filter @life-os/desktop package:win`. Verify fresh install,
   launch, shortcuts, upgrade preserving the intended session policy, logout and
   uninstall behavior on the actual Windows host. Signing/unverified binaries require
   explicit release documentation; do not invent a signed installer or published URL.
7. Run format/lint/typecheck/unit security tests and Electron build. Record native
   evidence separately from mocked adapter tests. Coordinate any fixes through an
   isolated branch/commit and review conflicts before combining documentation.

Windows success does not establish hosted deployment or backup readiness. The full
hosted web acceptance and operator backup runbook is in [release-runbook.md](release-runbook.md).

## Reported Local Windows findings (not independently verified in Cloud)

The separate Windows chat reports Electron44.6 native DPAPI/cookie checks across nine
synthetic processes and real GUI security tests passing. Its stopped/pushed checkpoint is 2963ae02785ac7ace884a51fc1f1bb6f01d38ee5 on
windows/desktop-qa (not merged). Native/GUI harnesses and trusted offline retry are
implemented; QA NSIS0.1.0 installation, shortcuts and offline modal were observed.
Signing/icon, upgrade/uninstall and hosted-origin session checks remain pending. It identified an immediate Selected day / Start Day race; Cloud fixed the
shared date-sensitive actions and added delayed-response desktop/mobile regressions
(48 browser cases pass). The isolated Windows branch should incorporate that pushed
shared fix before repeating its UI workflow. Hosted-backend testing remains pending
a verified staging URL; no personal production data was used.

On resume, review that isolated Windows commit and reconcile its additive docs before
merging. Include the Cloud date-selection fix in the next Windows run. Review the
additional reported Focus-resume race with its actual reproduction. Cloud now guards
Resume/Finish until a newer authenticated snapshot arrives, and tests a delayed response;
this is a concrete fix, not a claim that every reported native scenario was reproduced.
The separate Windows chat remains stopped; Cloud resumed without altering its checkout.
