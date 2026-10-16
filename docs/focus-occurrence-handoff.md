# Focus occurrence association — implementation handoff

This corrects an underlying association bug, not the separate proposed Bento redesign.
Block workspaces previously received global unfinished sessions; title/Task/Project
comparisons only affected Start buttons. No persisted occurrence link existed.

## Contract and preservation

Migration `0010_focus_block_occurrence.sql` adds nullable `focus_session.schedule_block_id`,
an owner/block index and composite owner FK to schedule_block. Eleven migrations,
24 tables. Existing sessions remain unassociated: no title, Task, Project, date or
series matching backfill. Those sessions remain available in global Focus/history.

Block starts send the exact materialized schedule_block UUID, which identifies one
recurrence occurrence, never its series UUID. Starts reject missing, foreign and
skipped blocks before pausing any runner. `GET /api/execution/focus` accepts an
owner-checked optional `scheduleBlockId` filter with existing cursor pagination.

Calendar removal retains a skipped occurrence row. Series edits retire normal rows
then upsert the same IDs by series/local occurrence date; exceptions remain intact.
Temporarily removing and restoring a recurrence date restores its identity. Focus
history is never cascaded away or reassigned, even when a block moves or changes title.

## Interaction

An opened block retrieves only explicitly associated unfinished sessions. Its global
selection cannot put an unrelated session in its large circle. An unrelated runner
appears only as compact text. Exact-linked runner/selection can be included beyond
page one. Loading/errors disable starts and controls until scope is verified.

Start Focus and Start work stopwatch both create new linked sessions. New Session /
Restart starts a fresh session in the selected mode, automatically pausing the prior
runner and preserving all earlier work/notes/links. Returning to another saved session
uses the existing atomic resume/switch operation. No automatic finish/delete occurs.

The secondary Reset to Zero control opens the existing review form. A required reason
and explicit confirmation submit the versioned, retry-safe work-adjust/reset command.
Original intervals remain with exclusion markers and a before/after audit; the selected
session becomes zero and paused. Reset deliberately removes that session's prior time
from productive totals; Restart does not. Notes and occurrence links remain intact.
Time accounting continues to use individual intervals clipped to account-local days;
there is no title/Task-based merging. A scheduled block does not become actual work.

## Local installation and QA

Normally merge this Cloud checkpoint into the current Windows/UI branch. Preserve
all local UI implementation and Windows lifecycle/packaging fixes; do not reset them.
Cloud did not edit apps/desktop or implement the independent proposed UI redesign.
Protect a stopped-profile copy and matching old installer. Include SQL 0000–0010 in
the portable package and verify migration ledger eleven entries before opening data.
Never downgrade a migrated profile without its matching protected pre-upgrade copy.

Target native acceptance on a disposable profile: same-title same-parent Monday and
Tuesday occurrences show independent sessions; reopen restores each; automatic switch
has one runner; Restart preserves earlier sessions/time; Reset needs reason/confirmation,
records one audit and freezes at zero; existing unknown-origin sessions stay global.
Check series edit/remove/regenerate identity and a session crossing local midnight.
Only then use the normal profile for non-destructive startup/reopen verification.
No hosting, synchronization, updater or Phase 2 work is part of this fix.

## Verification

Default suite: 142 passed, eight environment-gated skips. Isolated PostgreSQL 17
execution suite: 48 passed, including runtime-role checks, cross-user FK/query rejection,
occurrence isolation, recurring edits, restart/reset replay, switching and midnight
accounting. Physical embedded upgrade/reopen preserves the explicit association and
keeps legacy association NULL. Typecheck and lint passed.

Normal production build was attempted but Cloud denied Turbopack's local worker-port
bind. The supported webpack diagnostic build also fails on the existing native Argon2
module bundling; project configuration was not changed to accommodate it. Consequently
the new browser test `tests/work-block-focus.spec.ts` and packaged Windows build/native
acceptance remain unverified here and must run locally. No native success is claimed.
