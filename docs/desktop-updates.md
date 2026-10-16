# Windows automatic updates

The dedicated delivery branch is `release/windows`. Push reviewed source there with
a normal merge/push. The `Windows release` workflow runs on a standard Windows GitHub
runner, checks TypeScript/lint, desktop security tests and the focused homepage journey,
builds the normal NSIS application, inspects the portable payload and runs a packaged
isolated startup/clean-close smoke. Only then does it sign and publish a release.
The version is `0.2.<workflow run number>`. Published releases are immutable; reruns
may finish an unpublished draft for the same commit. Other branches do not publish.

This repository is public: standard hosted Actions runners are free. This workflow
uses no paid runners/services, Actions artifacts or caches. Installers and metadata
are stored in GitHub Releases. Changing repository visibility requires reviewing
GitHub's private-repository quotas/budgets before continuing this workflow.

## Publisher trust and download verification

`apps/desktop/update-config.json` contains the Ed25519 public verification key.
The matching private key was generated in memory and encrypted into the repository's
`LIFE_OS_UPDATE_PRIVATE_KEY` Actions Secret with the user's explicit approval. It was
not printed, committed, written to disk or installed on the laptop. Only the signing
step receives it. People able to edit repository workflows can use this secret;
review changes to the delivery branch/workflow as release authority.

Each `life-os-update.json` envelope signs application ID, version, architecture,
platform, source commit, installer filename, byte size and SHA-512. The app verifies
the pinned publisher signature and binds ordinary updater metadata to it **before**
downloading. It hashes actual bytes afterward and again before installation. Wrong
keys, metadata changes, wrong platforms, equal/older versions and tampered files fail
closed. No GitHub credential is embedded in the application. Automatic Authenticode
checking has not been disabled; the independent pinned signature authenticates these
unsigned installers. This is not an Authenticode certificate or a SmartScreen reputation
guarantee. Do not independently replace the public key or secret: key rotation needs
a deliberate transition/bootstrap release.

## User experience and persistence

The normal packaged app checks after launch and every six hours. It downloads verified
updates quietly and offers **Restart to update** or **Later**. Press Alt to show the
native **Life OS** menu for **Check for updates…** and **Restart to update**. There is
no renderer bridge or new renderer network permission. Explicit `--user-data-dir`
test profiles do not activate updating. Local work remains available when offline.

Applying an update uses the existing native unsaved-draft guard, shuts down the private
backend, closes the database, flushes encrypted sessions, verifies lease removal, then
retains a protected full-profile copy and compatible previous installer under
`%APPDATA%\Life OS-update-backups`. Only then is the maintained NSIS updater invoked.
Normal closing never silently applies updates. Keep backups with matching installers;
an older binary must not open an already upgraded database. DPAPI records require the
same Windows account. Retained installers/backups consume local disk and can be
reviewed later; there is no automatic deletion of the user's recovery copies.

The one-time bootstrap installer must be retained as
`%APPDATA%\Life OS-update-backups\installer-0.2.0.exe` before enabling its first
restart update. Each verified subsequent installer is retained automatically, so
future updates can preserve a compatible recovery installer. A failed signature,
backup or shutdown prevents applying an update; no database reset or forced database
termination is used. Hosting/sync are unchanged.

## Verification status

Local source verification: focused homepage journey passed (synthetic HTTPS/PGlite,
both timer modes, capture/habits/navigation, responsive overflow and accessibility),
web production build passed, and 14 desktop security/session/signature tests passed.
Native bootstrap installation, actual CI publication, downloaded-update verification
and restart installation must be recorded in deployment.md after completion. Do not
treat workflow configuration alone as proof of an installed working update.
