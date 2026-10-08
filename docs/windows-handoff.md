# Separate Local Windows verification handoff

Cloud Phase 1 product checkpoint: `3a946798b288e9473a2e5f9124510012be9ec289`
on `work`. The subsequent Cloud operational-readiness commit adds Vercel configuration,
restricted database role/grant tooling, encrypted backups/restore and release tests.
Use its pushed `work` tip after checking the Cloud report; keep a separate Windows
branch/check-out. Cloud has not changed Electron code or the Windows checkout.

**No hosted backend URL is verified or available at this handoff.** A GitHub repository
URL is not a running app. Vercel/Neon are now connected; Vercel has no deployment, and Neon has only staged
migrations/grants while production is empty. Cloud stopped at the user's request. Native tests can begin against an approved local HTTPS backend, then must be
repeated against the exact approved hosted staging origin. Do not access production
personal data. No Windows DPAPI or NSIS runtime result is claimed by Cloud.

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
additional reported Focus-resume race with its actual reproduction; it is not marked
fixed. Both chats have stopped at the user's request.
