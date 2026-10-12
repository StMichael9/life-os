# Separate Local Windows verification handoff

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

## Local Windows resume and pause — 2026-10-12

Windows fetched `work` at `d4920db` and brought forward only the reviewed Electron
changes from `2963ae0` onto isolated branch `windows/desktop-first-qa`. Newer Cloud
documentation and shared selected-day/Focus guards remain intact.

Windows HTTPS reachability to the configured staging origin succeeded, returning 302
to Vercel SSO. The Vercel connector returned a team-scope 403, and no existing local
Vercel CLI credential was found. No application login, account creation, protection
change, production mutation or hosted acceptance pass is claimed. The temporary
Electron staging probe was stopped without producing acceptance evidence.

The user then explicitly paused hosted acceptance and chose coordination toward
desktop-first/offline use. Cloud owns local backend/database adaptation; Windows owns
Electron startup/lifecycle, bundled packaging and native offline verification. Await a
concrete Cloud runtime handoff covering entry point/readiness/shutdown, database path
and migrations, backup/restore and local origin/session security before changing the
packaged trust boundary. Reauthorization and hosted tests are paused, not release gates
for the immediate offline work. The user subsequently requested a safe pause of this chat.

A native synthetic-cookie rerun exposed failed replacement-cookie restoration. The
existing flush only awaited already-delivered change events. Windows now queues an
authoritative cookie snapshot on flush and drains subsequently queued writes, including
logout before its notification arrives. The deterministic regression, nine desktop unit
tests, two complete native nine-phase runs with startup corruption/expiry checks,
desktop typecheck and lint passed. Native fixtures additionally decrypt in memory to
assert that the persisted value is current; no token/ciphertext key is logged.
This is a desktop persistence fix, not proof of a finished offline backend or hosted
session acceptance. Preserve the current renderer/security restrictions until the new
local runtime contract is agreed and tested.
