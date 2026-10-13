# Focus switching — bounded handoff

Cloud branch: work. Latest Focus commit is identified in the Cloud final report.
Local retains its isolated windows/desktop-first-qa checkpoint d18ccf5; apps/desktop,
its native fixtures and installation have not been changed by Cloud.

## Behavior

Start or resume atomically pauses the runner and opens the chosen session at the same
server instant. Paused clocks stay frozen; objective, parents, notes and recorded time
remain independent. Finish affects only that session and records linked Task minutes
once, optionally completing the Task in that transaction. History uses completion day.
The shared workspace uses one radial timer, compact other-session rows and New Session;
notes can be saved before finishing. A validated URL selection survives refresh.

Paused storage has no count cap. Reads page 50 records, plus the runner/selected
record in Today when necessary. Load more accesses older sessions; foreground refresh
resets loaded pages. Timing keeps the existing whole-second precision. No automatic
finish/delete, additional required service, runtime trust change or new CSS framework.

`0008_focus_switching.sql` only replaces/adds uniqueness indexes: one running
unfinished session and one open interval per owner. Nine migrations, 23 tables.
Existing content/counters/links/intervals/notes/history are preserved. A conflicting
legacy interval must be investigated; never reset data to force migration success.
Prior encrypted backups retain the exact migration-identity compatibility policy.

## Targeted Cloud verification

- 35 embedded/shared execution/countdown tests passed; one guarded PostgreSQL-role skip.
- Three filesystem persistence/upgrade tests passed, including two actual engine
  reopen cycles with independent paused/running sessions and preserved notes/counters.
- 32 tests passed against isolated real PostgreSQL17: exact Algorithms/Bookvane timing,
  auto-pause, concurrent starts/resumes, stale/foreign controls, exact retries,
  independent completion, notes, owner-scoped pagination beyond 50 and database indexes.
- A final Focus-only embedded rerun passed six timing/countdown checks (30 other
  cases intentionally filtered). Four focused desktop/mobile browser journeys passed:
  calendar → Focus and Algorithms/Bookvane switching/notes/reload, including axe and
  document-overflow checks. Typecheck/lint, format and production web/Electron builds
  passed; migration generation reports no schema drift.

The first browser pass exposed schedule payload contamination by a notes field and
an exact-label test mismatch on prefilled textarea content; both were corrected.
Full regression, installer/crash/reboot/backup acceptance are deliberately delegated.
No native Windows or laptop-data verification is claimed by Cloud.

## Local developer / Lead QA

1. Preserve profiles and a compatible pre-upgrade application/backup. Normally merge
   the pushed Cloud Focus checkpoint into d18ccf5; do not reset/force-push or discard
   isolated desktop fixes. Bundle all migrations through 0008 and rebuild standalone,
   the portable Windows resources, Electron and installer. No manual DB reset.
2. Run a bounded existing-profile upgrade/automatic startup/reopen check. Verify the
   current session and paused sessions survive native quit/restart. Keep certificate,
   DPAPI, ACL, sandbox and origin protections unchanged. Report the installed commit.
3. Lead QA: test 90-minute Algorithms → 45-minute pause → Bookvane → one-click resume
   Algorithms, ensuring Bookvane pauses and each counter remains independent. Repeat
   switching, save different notes, finish one while another runs, and verify one time
   record/history entry. Exercise double clicks, multiple windows, delayed/lost responses,
   stale versions, foreign session IDs/cursors, CSRF, midnight/DST, overtime and >50
   paused sessions. Browser fixtures are tests/focus-switching.spec.ts and calendar.spec.ts.
4. Run comprehensive regression/accessibility/keyboard/zoom and existing native release
   gates separately. Report failures/limits and stop after the bounded assignment;
   no Phase 2 or idle continuous QA. Cloud's new source is not yet an installed update.
