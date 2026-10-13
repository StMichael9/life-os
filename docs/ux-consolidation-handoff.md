# Phase 1 UX consolidation — Cloud handoff

Scope: shared Phase 1 UX only. Do not begin Phases 2–6 or resume hosted deployment.
Local owns Windows/Electron/deployment; Lead QA owns comprehensive acceptance. Cloud
has not changed apps/desktop, its native fixtures, shared lockfile or installation.

## Implemented

- One shared authenticated shell: Today / Calendar / Goals / More. Existing routes and
  secondary features are retained; visible search/capture reuse the guarded palette.
- Today keeps compact Season, One Thing and Big 3 ahead of a genuine day/week hourly
  calendar. Duration-positioned cards, muted colors, current-time line, seven-date
  selector, keyboard hour slots and event workspaces use persisted schedule records.
  Recommendations, Insights, routines and capture collapse; daily counts remain real.
- Click a block → Start Focus inherits objective/title, owned Task or Project,
  category and duration → inline radial countdown → Pause/Resume/Finish. The existing
  server clock, versions and receipts persist through reload. Zero announces the
  intention ended while all active overtime continues to be recorded. Completion of
  the linked Task is optional and atomic with Focus finish; notes collapse.
- Daily/selected-weekday series materialize as the existing schedule_block records.
  Explicit repeat ranges cover at most one year (366 dates), same-day local start/end.
  Every occurrence validates in one owner-locked transaction; an overlap/DST gap/fold
  rejects the whole set. Edited and skipped exceptions survive complete series edits.
  One-occurrence skip keeps its row privately and removes it from visible counts.

## Schema/security and limits

`0007_work_block_series.sql` is additive; the chain now has eight migrations/23 tables.
It adds owned schedule_series plus project/category/objective and recurrence/exception
fields on schedule_block. Old data receives safe defaults. Composite ownership FKs,
single-parent/series-date checks, versions, updated_at trigger and complete-set overlap
validation preserve the existing model. Runtime grants/checkpoint tooling explicitly
include the new table; no runtime DDL/administrator permission is introduced. Existing
verified sessions, CSRF, account-stamp checks and shared strict validation remain.
Only isolated test databases were migrated in Cloud.

- Day/week display bounds are 100/500 records. Week starts on the selected date.
- Recurrence ends on an explicit date; extend it by editing the series. Series edits
  replace all normal occurrences across that range, including past dates, and retain
  existing edits/skips even outside a shortened range. There is no drag/resize UI.
- A series is edited through a visible occurrence; a fully skipped series has no
  visible workspace entry. Skipped rows have no separate unskip UI in this increment.
- Block durations longer than 12 hours prefill a clearly labeled 720-minute Focus
  intention; recorded active time is not capped. Category/parent choices retain the
  existing bounded selectors; a current parent outside that list is preserved.
- Settings/timezone management remains unchanged. No cloud synchronization is added.
- Existing encrypted embedded backups require their exact migration identity. Restore
  an older archive with the matching application before upgrading; do not discard the
  older application/backup solely because this schema changed. Native backup controls
  and installed offline release acceptance remain separate pending gates.

## Verification

Cloud ran targeted calendar/DST/countdown + execution + upgrade tests: 31 passed,
one guarded PostgreSQL-only skip. It separately ran the actual isolated PostgreSQL17
execution suite: 27 passed, including recurrence rollback/owner isolation/exception
preservation/single-parent constraints/retry-safe optional Task completion. One
repository-required default test run: 118 passed, eight guarded skips. Typecheck/lint
and web/Electron production builds passed. The focused calendar → inline Focus →
pause/reload → finish → recurring create/edit/skip → week journey passed on desktop
and mobile (two browser cases), including axe and document-overflow checks. The first
run exposed an exact-label test-selector mismatch; visual review found weekday-label
and inherited-spacing issues, corrected before the passing rerun. Format and migration
generation checks pass with no new schema drift. Full browser/PG fixture matrix and
Windows checks are not claimed for this revision. Older 48-browser/62-PG results describe the prior checkpoint.

## Local developer — bounded integration

1. Preserve your isolated desktop branch and user profiles. Merge the pushed Cloud
   checkpoint normally; no reset/force-push or unrelated desktop file replacement.
2. Retain a recoverable pre-upgrade backup/profile and compatible old application.
   Bundle the full migration directory including 0007, rebuild Next standalone on
   Windows, materialize its traced dependencies through your existing portable packager,
   and rebuild Electron/installer. An old packaged backend does not pick up source edits.
3. Verify automatic offline startup, migration of an existing profile, account/session
   restoration and a fresh first-account profile without touching production/Neon.
4. Use Today → add work block → open block → Focus → pause/quit/reopen → finish.
   Verify one saved session/time entry and optional Task completion. Check native
   discard/keep-editing and quit behavior with both clean and dirty forms.
5. Verify one recurring series, occurrence edit/skip, series edit, restart persistence
   and no missing packaged migrations/assets. Report exact commit/build and blockers,
   preserve profiles when removing old QA, then checkpoint/stop. Do not run idle QA.

## Lead QA — comprehensive acceptance

Run full unit/integration/migration checks, the complete browser suite, responsive and
accessibility/keyboard/zoom review, and the native offline release checklist through
Local. The focused journey is `tests/calendar.spec.ts`; existing execution selectors
now use calendar cards and collapsible sections, preserving previous assertions.

Specifically exercise daily and weekday repeats across month/year/DST boundaries,
complete-set rejection with a conflict late in the series, adjacent blocks, overnight
one-time blocks, one-occurrence edits/skips surviving series edits, stale series/Task
versions and account switching during a save. Verify HTTP CSRF rejection/foreign
parents/series, day↔week loading guards, reload/logout, duplicate/lost-response Focus
completion, overtime, current-time indicator, hour-slot keyboard navigation and screen
reader timer behavior. Recurrence ranges/unsupported gestures must remain clear rather
than presented as implemented. Report failures before declaring acceptance complete.
