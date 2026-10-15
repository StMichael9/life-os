# Actual work tracking: Local / QA handoff

This extends Phase 1, using existing Focus sessions and intervals. It is implemented
and verified in Cloud against synthetic embedded and PostgreSQL data. It is not proof
of an installed Windows update. No hosting, cloud sync, new desktop privilege or
Phase 2 work was added.

## Install boundary

The last Local-reported installed baseline is normal unsigned Life OS 0.1.3,
Windows checkpoint 76304ff (Cloud 150e464 merged at 711bfc2). Preserve those Windows
lifecycle/security/portable-packaging changes when merging this new work checkpoint.
Cloud deliberately did not edit apps/desktop or a personal profile.

Migration 0009_actual_work adds one audit table and additive Focus/user/interval
columns: ten migrations (0000–0009), 24 tables. It preserves sessions, notes, links,
legacy durations and existing intervals. It does not finish or pause an existing
runner. Existing modes remain countdowns; new work sessions use a stopwatch.
Migration-generated schema and metadata are committed; do not edit old SQL.

If authorized to install: close the actual app gracefully, protect a stopped full
profile copy and compatible 0.1.3 installer, merge/rebuild the normal Windows release,
inspect all ten exact migrations/no junctions/no.env, then install preserving profile.
Never test fixtures in the real profile or reset it to fix a migration error.
Old encrypted snapshots require their matching old application/ledger to restore
before upgrading. Retain both old and new profiles if recovery is needed; an old
binary is not a safe automatic downgrade of a newly migrated profile.

For a hosted deployment later, apply the migration with the migrator and reapply
ops/postgres/grants.sql. Runtime gets SELECT/INSERT only on work_time_change and
UPDATE only on app_user(id, work_target_minutes, work_target_version), not broad
profile/credential access. Verification/backup table manifests now include the audit.
No hosted migration or grant was applied in this run.

## Bounded native acceptance

1. Launch the actual packaged application offline with the existing account. Verify
   previous countdowns, notes, links and history, and the default ten-hour target.
2. Today → New work session → Algorithms. Confirm count-up HH:MM:SS; pause for a
   break and verify no increase. Start Bookvane, resume Algorithms in one click, and
   confirm Bookvane pauses with its own elapsed time and notes retained.
3. Open a calendar block while other sessions exist. Start work stopwatch, verify
   its objective/owned work/category, pause/resume and close the block. Merely making
   a calendar block must add zero actual time.
4. Finish a running stopwatch: recording pauses before the outcome form. Time spent
   writing the outcome is excluded; cancelling leaves it paused. Finishing a paused
   session leaves another runner intact. Confirm linked Task minutes are added once.
5. Cleanly close/reopen with a runner. Verify the review banner; confirm continued
   work or trim the recorded interval to the real stop time with a reason. Also test
   an authorized disposable crash/suspend/reopen path; no focus-loss auto-pause.
6. Correct a finished session and a closed interval while its session runs. Reset an
   unfinished session and discard one with confirmation. Review readable before/after
   durations, endpoint changes and reasons. Other sessions must remain unchanged.
7. Change target, restart, inspect 7/30-day daily totals/average/category distribution,
   and verify account timezone/23/25-hour day behavior. All totals must come from
   non-excluded intervals, not planned durations or Task estimates.
8. Verify narrow layouts, keyboard/native dialogs, scaling and screen readers. Test
   two clients against the SAME backend with concurrent starts/resumes/corrections.
   Server writes are serialized; other views refresh on foreground/visibility and
   every minute. Independent offline/cloud databases do not synchronize.

Cloud test results are in docs/progress.md. Comprehensive native/visual acceptance,
installer signing and an actual laptop upgrade remain Local/Lead QA responsibilities.
Stop after the requested install/acceptance scope; do not start another phase.

## Intentional limits

Corrections trim existing intervals, including reducing one to zero; they cannot
invent missed work or move time into another session. Reset/discard exclude retained
intervals and keep an owner-scoped audit. Session review pages intervals 100 at a time;
it shows the latest 100 audit entries, with older entries retained. Trends span the
30 account-local days ending on the selected date; recent-session review shows 20
entries and explicitly labels the limit. Totals are not capped by those display limits.

Historical target comparisons use the current configured target, including zero-work
days in averages. Category history uses current owned relationships/names. Legacy
sessions without intervals retain their durations but cannot be assigned to particular
days. Legacy Task duration credits were not individually recorded, so only credits
created after 0009 are automatically adjusted by later corrections. Manual Task
actual-duration editing remains available. Tracked time is self-reported duration,
not evidence of quality/accomplishment; it relies on a correct backend clock.
