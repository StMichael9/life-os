# UI refresh — Local / Lead QA handoff

Scope: shared frontend only, based on Cloud work 103fa94. No new migration: keep
all nine migrations 0000–0008 and the existing database/account/session model.
No Phase 2 feature, hosted write, laptop profile change or installer is claimed here.

Local-reported Windows checkpoint a17ce81 (windows/desktop-first-qa, version 0.1.2)
contains the native startup/persistence/portable packaging fixes. Preserve those
apps/desktop changes when merging the new Cloud work checkpoint normally. Do not
replace that branch with Cloud's older native source. Review any documentation
conflicts by retaining both dated evidence sections and updating current status.

Install dependencies with the frozen pnpm lockfile. Tailwind 4.3.3/PostCSS 8.5.30 are
build dependencies; Radix dropdown 2.2.1 is the only new UI runtime package. Next's
normal Turbopack build and standalone preparation remain the same commands. No new
runtime internet requirement, preload bridge, IPC capability or OS certificate trust
is needed. Rebuild the web assets and existing Windows desktop package together.

## Bounded acceptance before installing

1. Inspect Today/Calendar/Goals/Tasks/Focus/Inbox/Routines/Vault/login/search at actual
   laptop size and Windows 125/150/200% scaling. Test 200% browser zoom, high contrast,
   keyboard and a screen reader. Check long record titles, long notes and empty lists.
2. More and contextual menus: Enter/Space open, arrows navigate, Escape closes and
   returns focus, links navigate correctly. Menus opened from focused controls must
   not steal focus from a subsequently opened native editor.
3. Forms: Goal measurable outcome disclosure, Task effort/ratings disclosure, optional
   Start Day reflection, Close Day reflection, validation, busy guard, cancel/discard.
   Opening/closing a disclosure must not erase saved/edited values. Existing E2E
   assertions were adapted only for deliberate labels/disclosure/menu changes.
4. Calendar: day/week, selected day readiness, hour creation, recurrence edit/skip,
   block→Focus, short/cross-midnight/DST blocks. Scrolling a week must not widen the
   document. The selected-day and Focus version barriers remain unchanged.
5. Focus: current circle, one-click saved-session switching, notes, pause/frozen time,
   overtime/finish, history, refresh and native clean reopen. Today shows an expandable
   compact Focus summary; the dedicated page and work-block dialog retain the full UI.
6. Inbox→Task/Vault, Vault contextual Goal/Project promotion/archive/restore, routine
   checkbox/day note/edit/archive, search/capture and owner isolation. All are real
   existing endpoints; original records/receipts must be preserved.
7. If authorized to install: cleanly stop the old app, retain a protected stopped-profile
   backup and compatible old installer, rebuild the normal unsigned installer, inspect
   portable payload/migrations/no.env, install preserving profile, verify startup/reopen,
   then open normally. Do not write acceptance fixtures into the user's profile.

Cloud targeted verification and any remaining limitation are recorded in the newest
section of docs/progress.md. Screenshots are synthetic browser evidence, not native
Windows acceptance. Comprehensive regression and native deployment remain assigned
Local/Lead QA; Cloud did not wake a continuous testing process.
