# Experience blueprints

Design only · Companion to [proposal overview](README.md)

All wireframe content and numerical walkthroughs below are **synthetic examples**. Wireframes show structure, not a running application. Baseline reconciled to Cloud `fd14ccf` on 2026-10-15: count-up, work targets, audited interval trimming/reset/discard and restart confirmation already exist. Labels marked **extension** apply only beyond those contracts.

## 1. Responsive homepage blueprint

### Structure and layout rules

The header establishes date and context, then the page answers next action, current work and today's practices. Use three external panel boundaries, with internal rules and spacing for grouping. No separate Season, One Thing, Big 3, progress, quote, count or recommendation tiles.

Desktop content max-width 1440px; outer gutters 32px at wide sizes, 24px on laptop. Use a 12-column grid with 24px gaps. Agenda occupies 8 columns and spans two rows. Core Focus occupies the top 4; Micro-Habits the lower 4. At 1280px viewport with 24px gutters, the Focus region is approximately 395px wide. At 1024px reduce the gap to 16px and use a roughly 60/40 split. Do not constrain panel height to create cosmetic symmetry.

DOM/reading order is header, Agenda, Core Focus, Micro-Habits, daily context. CSS placement creates the desktop supporting column without changing keyboard order. No masonry/dense packing or breakpoint-induced semantic reorder. Agenda contains a compact summary, not a full-day hourly grid; the complete time-block calendar remains in Plan.

| Viewport, CSS px | Composition                                                    | Agenda exposure                                                                       | Focus and habits                                                             |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ≥1200            | 8/4 unequal grid; max 1440                                     | Priority headline, Big 3, next action, up to 5 blocks and 3 urgent rows               | 240px timer; 3 session rows + Show sessions; up to 5 routine checks          |
| 900–1199         | 60/40 two-column; 24px margins, 16px gap                       | Same order, initially 3 blocks; long titles wrap                                      | 208px timer; habits beneath Focus                                            |
| 600–899          | Single main column with 24px margins; tablet header if it fits | Compact priority/next-action lead, then agenda disclosure with first 3 blocks visible | 208px timer; habits follow; session list opens on demand                     |
| 320–599          | One column, 16px margins; bottom navigation                    | Same compact lead; agenda initially 2 blocks with Show day; Big 3 rows wrap           | 184px timer; compact controls; full-width habit rows, no horizontal scroller |

Breakpoints follow content fit, not device detection. At high zoom the desktop shell becomes the compact shell. A short laptop viewport scrolls naturally; it does not shrink text or crop forms to fit a single screen. Agenda expansion is memory state for the current view; durable layout personalization is not assumed.

### Desktop wireframe — synthetic example, 1440 × 900

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Life OS   Today   Plan   Library                 Search Ctrl K   + Capture │
│                                                           Account         │
├────────────────────────────────────────────────────────────────────────────┤
│ Thursday, October 15   America/Los_Angeles              Start / Close Day  │
│ Season: Build deliberately · View direction                                │
│                                                                            │
│ ┌─ DAILY AGENDA ────────────────────────────┐ ┌─ CORE FOCUS ───────────────┐ │
│ │ THE ONE THING                  Edit day │ │ Draft portfolio story      │ │
│ │ Finish the portfolio story              │ │ Countdown · Running        │ │
│ │                                        │ │                            │ │
│ │ BIG 3                                  │ │          ◯ 18:42           │ │
│ │ □ Draft story  □ Review outline         │ │       25 min intention     │ │
│ │ □ Send feedback                        │ │                            │ │
│ │                                        │ │ [Pause] [Finish]           │ │
│ │ NEXT · Draft portfolio story           │ │ Open Task · Session notes  │ │
│ │ In progress in Core Focus              │ │                            │ │
│ │                                        │ │ Resume another session     │ │
│ │ NOW / NEXT                 Open calendar│ │ Outline      Paused 12m    │ │
│ │ 09:00–09:30  Portfolio work             │ │ Research     Paused  8m    │ │
│ │ 10:00–10:30  Review outline      [Open] │ │ Show sessions · New        │ │
│ │ 14:00–14:30  Feedback            [Open] │ └────────────────────────────┘ │
│ │ Show remaining day                     │ ┌─ MICRO-HABITS ────────────┐ │
│ │                                        │ │ □ Walk outside             │ │
│ │ NEEDS ATTENTION                        │ │ ✓ Read                     │ │
│ │ Review draft · due today       [Open]  │ │ □ Evening reflection       │ │
│ │                                        │ │ Manage routines            │ │
│ │ Actual tracked today 42m · Planned 90m │ └────────────────────────────┘ │
│ │ How time is counted                    │                                │
│ └────────────────────────────────────────┘                                │
│ Daily context ▸ Scripture · Thought · Season allocations · Insights        │
└────────────────────────────────────────────────────────────────────────────┘
```

The circle represents one prominent timer. Other session rows contain static numeric summaries, never small radial timers. If no session runs, the Agenda's next-action row offers Start Focus; when one runs, it links to the selected work and directs attention to the existing Pause control instead of displaying a second competing timer control.

### Mobile wireframe — synthetic example, 390 × 844, scrollable

```text
┌─────────────────────────────────┐
│ Life OS        Search  + Capture│
│ Thu, Oct 15 · Account timezone  │
│ Build deliberately · Close day │
│                                 │
│ DAILY AGENDA                    │
│ THE ONE THING          Edit day │
│ Finish the portfolio story      │
│ Big 3: □ Draft □ Review □ Send  │
│                                 │
│ NEXT · Portfolio story          │
│ In progress in Core Focus       │
│ 09:00 Portfolio · 10:00 Review   │
│ Show day ▸     Needs attention ▸│
│ Actual tracked 42m · Planned 90m│
│                                 │
│ CORE FOCUS                      │
│ Draft portfolio story           │
│ Countdown · Running             │
│            ◯ 18:42              │
│        [Pause] [Finish]         │
│ Task →   Notes ▸   Sessions ▸  │
│                                 │
│ MICRO-HABITS                    │
│ □ Walk outside                  │
│ ✓ Read                          │
│ □ Evening reflection            │
│ Daily context ▸                 │
│                                 │
├─────────────────────────────────┤
│ Today         Plan      Library │
└─────────────────────────────────┘
```

This represents a scrollable page, not a promise that all content fits at once. Priority is preserved rather than compressing every control above the fold. Bottom navigation reserves its own safe-area/padding and never covers content. On-screen keyboard hides or releases sticky chrome; Capture uses a full-height dialog with a reachable submit footer. No floating capture button over checkboxes.

### Daily Agenda behavior

1. **Priority lead:** One Thing in 24px text; up to three Big 3 outcomes below, with explicit completion controls. Long outcomes wrap. The editor loads/replaces the full plan and its version; it does not patch individual outcomes against stale data. Start/Close Day opens a short flow with optional reflection and preserved saved values.
2. **Next action:** a deterministic frontend presentation rule: show current running work first; otherwise the current scheduled block; otherwise the first server-ranked eligible Task; otherwise the next upcoming block; otherwise Choose work. This is a design policy, not a new scoring engine. Show a one-line reason and expandable server ranking reasons where applicable. A current meeting block offers Open, not an automatic stopwatch start. User must choose to start measured work.
3. **Time sequence:** current block plus upcoming blocks ordered by start instant; completed/past planned blocks are available in Show day. Block rows open details, link work, and permit existing edit/series actions. “Past” does not mean “completed.” No automatic Task completion from a block ending.
4. **Needs attention:** due/overdue work from available Task DTOs, clearly labeled as a bounded loaded set. De-duplicate a Task already displayed as the next action; retain its urgent badge there. Show at most three rows with a link to Tasks. If the snapshot reports a Task limit, say “More work available in Tasks”; do not claim an exhaustive overdue count or fabricate an all-tasks filter the API lacks.
5. **Evidence footer:** `Actual tracked today` from `workTime.seconds`, separately `Planned` from `scheduledMinutes`. Explain that non-excluded active intervals contribute, pauses are excluded and legacy sessions without intervals are not reconstructed. Show configured target as a quiet text/bar within this region, not a second circular timer or calendar quota. Expand to activity breakdown and 7/30-day history from `workTime`; explain historical target comparisons use the current configured target and averages include zero-work days.

Recommendations on historical dates use current inventory in the existing backend. Therefore historical Today shows the dated plan and evidence, with next-action recommendations suppressed and a Return to today link. The current running session remains explicitly labeled “Running now,” outside historical totals. Routine changes apply only to the selected date. Do not imply historical time travel starts a session in the past.

### Micro-Habits behavior

“Micro-Habits” is a homepage label for existing weekday routines, not a new entity. Show today's scheduled routines plus the historically relevant completed archived entries supplied by the API. One checkbox sends `routine-check` for that local date; show an individual pending indicator and revert on failure. Reversal sends the inverse only after the original result is known. A second tap while pending does not send competing writes.

Routine title opens notes; Manage routines opens the existing definition workspace. Show five rows initially; “Show all” reveals more loaded routines without implying the 100-record bound is unlimited. No streak pressure, ranking of faith practices or confetti. Checking a habit never creates a Task, schedule block or work interval.

### Homepage states

| State                           | Agenda                                                                                  | Core Focus                                                                 | Micro-Habits / shared behavior                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| First use                       | “Choose one outcome for today” → plan editor; no seeded work                            | “Start with an objective” → new session                                    | “Add a routine when it helps” → routine form                                          |
| No active Season                | Quiet Choose direction link; execution still works                                      | No mandatory Season setup                                                  | No onboarding gate                                                                    |
| Empty calendar                  | “Your day has open space” → Add block; eligible real Task may still be next             | Focus remains usable without scheduling                                    | Real routines remain visible                                                          |
| Nothing eligible                | “Choose work or capture a thought”; explain time/energy filters if excluding candidates | Select saved or create new                                                 | Never invent a recommendation                                                         |
| Initial load                    | Fixed shell and neutral text/row skeletons; no fake numbers                             | Ring outline with “Loading session”; controls disabled                     | Checklist skeleton; no false empty state                                              |
| Refresh in background           | Keep last verified snapshot, label freshness if delayed                                 | Continue provisional display from last server anchor                       | Do not overwrite open drafts                                                          |
| Aggregation unavailable         | Explain local service unavailable; Retry; do not treat internet loss as equivalent      | “Timing unverified” with last confirmed state; no success claims           | Whole snapshot failure affects all three; partial cards are not independently fetched |
| Mutation failure                | Inline at affected control; stable request identity; retry                              | Settling state until refetched authoritative runner                        | Keep unrelated controls usable where safe                                             |
| Version conflict                | “This changed elsewhere”; retain edit, review current version                           | Reload state; no silent replay with a new version                          | Do not silently replace saved values                                                  |
| Session expired/account changed | Clear private snapshots and prevent submission                                          | Hide private timer/session titles                                          | Quarantine or clear drafts according to capture policy; never submit to a new account |
| Closed day                      | Show saved outcomes with explicit Reopen action                                         | Current session can still exist; closing a day does not secretly finish it | Completion edit flow follows supported date rules                                     |

For long local-backend startup, a neutral connection view may retry the existing service. It must not offer fabricated runtime controls or promise that the renderer can repair leases, restore backups or start privileged processes.

## 2. Quick-Capture architecture

### One composer, many entrances

Persistent labeled Capture button on every authenticated surface; `Ctrl+Shift+K` proposed for in-app capture; `Ctrl/Cmd+K` retains search/commands. Mac labels appear only on that platform. Shortcut conflict checks are required before implementation. Do not override ordinary typing, IME composition, browser navigation or OS shortcuts. Provide discoverable shortcut labels and clickable equivalents.

Capture opens directly into a multiline text field. No Task/Project/Goal/Vault choice. Plain Enter adds a line; Ctrl/Cmd+Enter saves to Inbox. No background entity classification, date parsing, AI or hidden title extraction. The Inbox processor may suggest a Task title from the text, but the user confirms it without losing the original.

Palette has explicit **Search & commands** and **Capture** modes. Search typing never implicitly saves; capture typing never implicitly navigates. The Search mode offers “Capture a thought” and displays command shortcuts. Use an accessible dialog with a search input plus normal result links initially; adopt combobox/listbox semantics only if the complete APG keyboard model is implemented. Search results are bounded, owner-checked, and cleared immediately on query/account changes.

Contextual entrances: Later inside Focus, capture from a Task/Project detail, and an Inbox text composer. They all use the same draft and submission controller. Optional visible origin hint is convenience only. Existing Inbox POST accepts body/requestId, not a structured source URL or parent. Do not silently embed sensitive context into text or silently attach work. Durable structured origins would need a contract extension.

### Composer wireframe — synthetic example

```text
┌─ Capture a thought ────────────────────── Close ┐
│ Organize it later in Inbox.                     │
│ ┌────────────────────────────────────────────┐ │
│ │ Look into a clearer portfolio introduction │ │
│ │                                            │ │
│ └────────────────────────────────────────────┘ │
│ Unsent · kept while this app view remains open  │
│ Discard                     Save to Inbox      │
│                          Ctrl Enter            │
└────────────────────────────────────────────────┘
```

Close means **keep in memory**, not discard. Reopening Capture restores text and cursor while the shared authenticated shell remains mounted. A small “Unsent capture” indicator exposes that fact. Explicit Discard asks only if nonempty. This requires frontend lifecycle refactoring: the current palette clears draft/retry state on close, and cannot be described as already doing this. Full reload, app termination and route transitions that unmount the shell remain loss boundaries until durable drafts are engineered. Retain unload/discard warnings and state this limitation plainly; browsers do not guarantee those warnings.

### Delivery state machine and identity

`empty → editing → submitting → confirmed`, or `submitting → uncertain → retrying → confirmed`. Validation failure returns to editing; changed content creates a new intent only after any uncertain intent is resolved.

Allocate one request UUID for a frozen trimmed payload on submit. Preserve that exact pair through unknown outcomes and retries. Never clear until a confirmed response; never retry a changed body under the old key. When delivery is uncertain, keep the submitted snapshot immutable and offer Retry same capture. A new thought may be composed separately, but cannot replace the uncertain operation. On success, link to the saved Inbox item and offer Process; do not demand immediate organization.

Limits: capture text is at most 10,000 characters and the HTTP JSON body is capped at 16 KiB. Multibyte text can hit the byte limit sooner. Show a field error and retain text; calculate serialized UTF-8 request size before submission. Never silently truncate. Search is a separate 100-character input.

On 401, hide private results, stop submission and retain the unsent draft only in an account-bound memory quarantine. Expose it again only after the same verified account returns. On different account, do not display or transfer it; explicitly discard during account switching. If the current lifecycle cannot safely quarantine it, use the existing clearing behavior rather than weakening isolation. Session memory persistence through an authentication reload is not promised.

### Provenance and processing

Capture saves once to Inbox. Processing to Task uses `POST /api/tasks/from-inbox/{id}`: owned capture lock, parent validation, one unique source, original body retained, and exact replay returning the current linked Task. Do not implement this as generic Task creation followed by a separate Inbox dismissal.

For Vault, use the existing `vault` execution command with `sourceInboxId`; processing is atomic. Task, Goal and Project promotion from Vault preserve the full source and its links, with archive/promotion handled by existing transactions. Direct Inbox → Goal/Project is not an existing conversion contract; the UI must use Inbox → Vault → promotion, or obtain separate authorization for a new transaction. Prayer, Opportunity and Experiment processing remain future capabilities and are not shown as enabled choices.

Request IDs prevent duplicate delivery of one intent. They do not deduplicate separately submitted equal thoughts or prove semantic duplicates. Do not promise global deduplication. Source text remains searchable/readable after processing; a processed item links to its destination rather than offering another conversion.

### Durable draft and native boundary — extension

Preferred future durability: an authenticated, account-scoped draft service in the protected local backend, storing encrypted text plus delivery identity and version. Define key management, atomic writes, retention, recovery, deletion and backup policy before release. The renderer submits ordinary narrow authenticated requests and never handles encryption keys or filesystem paths. Do not use localStorage, IndexedDB, Cache API, service-worker caches or plaintext files for sensitive drafts.

Proposed retention decision for approval: one working capture draft per account, kept until save or explicit discard; no silent expiration that can destroy input. An unresolved delivery operation is retained separately until reconciled. Durable storage must atomically associate text and request identity so restart cannot create duplicates. Existing Inbox records are saved captures, not a substitute draft table; existing `safeStorage` session-cookie encryption is not a general draft API.

An OS-wide shortcut, background capture window, tray capture, capture while signed out, clipboard access or native quit interception are **separate Electron capabilities**. If approved, main registers only the dedicated shortcut and opens an app-owned unprivileged surface. Keep exact-origin validation and narrowly typed message capabilities; expose no generic IPC bridge. No native capability is required for the proposed in-app Capture button.

## 3. Focus workspace blueprint

### Single instrument, two explicit modes

One logical session controller and one visible circular timer per screen context. Today mounts it in Core Focus; focused `/focus` replaces the surrounding page with a larger rendition; opening a block workspace transfers presentation to that workspace and makes the background inert. Unmount or hide the background timer from rendering/accessibility. Elsewhere, a text-only running-session indicator links back; it is not another timer widget.

Countdown Focus and genuine count-up “Track work” are existing behavior in Cloud `fd14ccf`. Use `timerMode: countdown | stopwatch` and the shared active-time model. The strict start contract still requires valid `plannedMinutes` in either mode; preserve the current command builder's valid default for stopwatch starts while hiding countdown-intention controls for that mode. Do not infer mode from objective text or change the schema merely to match this presentation.

| Property    | Countdown Focus                                                       | Track work — existing in `fd14ccf`                                             |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Start form  | Objective; optional Task or Project/category; 25/50/90/custom minutes | Objective; optional same links; no mandatory planned duration                  |
| Main number | Remaining active time; zero then additional active time               | Elapsed active time, hours when needed                                         |
| Ring        | Determinate progress toward intention; remains full in overtime       | Static track with running-state accent, no invented percentage or endless spin |
| Status      | Running, Paused, Intention reached, Reconciling, Finished             | Running, Paused, Reconciling, Finished                                         |
| At target   | Continue tracking overtime; user finishes                             | No target or automatic finish                                                  |

Both modes use the same interval authority, owner lock, one-runner invariant and notes/outcome model. Migration `0009_actual_work` adds the existing mode/audit/target fields and preserves old countdowns. Do not replace it with a new migration designed here. Mode is fixed after start in this proposal; restarting creates a new session.

### Focused desktop wireframe — synthetic example

```text
┌─ Back to Today ───────────────────────────── Capture · Account ┐
│ Portfolio project → Draft portfolio story                     │
│                                                               │
│ Saved sessions           CURRENT SESSION                       │
│ [Resume Outline]         Draft portfolio story                  │
│ Paused · 12m active      Countdown · Running                    │
│                                                               │
│ [Resume Research]                 ◯ 18:42                       │
│ Paused · 8m active                25m intention                 │
│                                                               │
│ Load more                 [Pause]     [Finish]                  │
│ + New session             Open Task · Open Project              │
│                                                               │
│                         Session notes ▸                         │
│                         Later capture                           │
│ History ▸               Actual today 42m · Planned today 90m    │
└────────────────────────────────────────────────────────────────┘
```

On mobile use objective, circle, controls, work link, Notes, Sessions and History in that order. Sessions opens a full-width dialog/list. Focus content remains scrollable at landscape/zoom sizes. Editing notes does not pause the session unless the user explicitly chooses Pause. Show saved/unsaved state and keep the draft attached to its session ID.

### Session switching and pending state

Activating a saved-session row means Resume this session: current runner pauses and target resumes at one server instant. Row labels say “Resume [objective]”; a separate Details control permits read-only inspection without changing the runner. Selected details and the active timer must not become ambiguous: the main circle represents the active selected session; read-only notes for another session appear in a clearly labeled detail sheet.

Do not send Pause A then Resume B as two client mutations. Use the existing target `focus-control/resume`, whose transaction pauses the runner. Starting a new session uses `focus-start`, which has the same atomic replacement behavior. The selected-session URL may update only as state settles; loading a deep link by itself never starts work.

While switching, label “Switching…” and disable timer mutations. Do not immediately draw B as confirmed running. Retry the identical request after a lost response; refetch and reconcile authoritative versions before allowing another switch. If another window changed it, show the actual runner and preserve drafts under their original session ID. Selecting the already running session simply reveals it, with no resume write.

Unlimited paused storage is not unlimited rendering: page 50, always include runner/selected through existing query behavior, expose Load more. Foreground refresh currently resets pages; retain a clear “Recent sessions reloaded” cue and preserve the selected record. Do not show a fabricated total paused count or offer server search over sessions through the current general search API.

### Finish and time semantics

Finish first confirms Pause for a running stopwatch, then opens review of active time, notes and optional outcome, preserving `fd14ccf` behavior. Time writing the outcome is excluded; cancelling leaves it paused. A lost Pause response must reconcile before review claims the clock stopped. “Complete linked Task” is unchecked by default. Preserve existing countdown finish behavior and show whether accrual continues there; never imply a stopped clock before server confirmation.

Finishing a paused session leaves another runner untouched. Completion writes time to the linked Task once and optionally completes it in the same transaction. A session linked only to Project has no synthetic Task. Finishing does not mark Big 3 outcomes complete or alter calendar blocks. History groups by completion day; daily actual totals split intervals across local midnight. Those are distinct views and may differ legitimately.

Synthetic walkthrough: work A for 12 minutes, pause for 7, work B for 4, resume A for 3. A = 15 active minutes, B = 4, total actual = 19. The 7-minute pause is excluded. A 60-minute calendar block remains 60 planned minutes regardless of that total. Task aggregate minutes have rounding/manual/legacy-credit semantics distinct from interval evidence. Never sum the Task field with interval seconds or present it as an exact ledger; retain `0009` contribution reconciliation rather than reconstructing legacy credits.

### Correction, reconciliation and restart

| Situation                           | Experience using existing contracts                                                                | Extension required for ideal behavior                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Uncertain Pause/Finish delivery     | Keep command identity; label Reconciling; reload server state; replay exact command if needed      | Durable pending-command recovery across app crash                                                                       |
| Reload with running/paused sessions | Fetch authoritative records and selected URL; show loading before controls; no new session created | None for ordinary rehydration                                                                                           |
| Return after sleep/clock change     | Refresh server anchor; show timing as unverified until confirmed                                   | Trusted sleep/shutdown boundaries and reviewed gap correction; server wall time alone cannot know whether work occurred |
| Forgot to pause                     | Use existing work-session review and audited interval trimming with a reason                       | Adding missed work or moving time to another session is unsupported                                                     |
| Wrong Task/objective after start    | Existing work remains intact; notes may explain; start a new session with correct link             | Editing/reassigning session links/objective needs a command and reconciliation policy                                   |
| Finished too early                  | “Start another session” creates a new ID with copied form defaults; preserve old history           | No reopening/rewinding a finished session under current contracts                                                       |
| Manual Task duration differs        | Label as aggregate; existing correction logic adjusts credits created after `0009`                 | Legacy pre-0009 credit reconciliation needs a separately reviewed policy                                                |
| Local backend unavailable           | Retain last confirmed state with “Timing unverified”; keep unsent notes in memory                  | No offline renderer timing queue or claim that Pause has persisted                                                      |

Existing-contract correction flow: History → Review recorded time → page intervals with local times/timezone → trim an existing interval, including to zero → show before/after totals and affected days/Task → reason → Save correction. Reset/discard exclude retained intervals and preserve the audit. Confirmation records reviewed continued work after interruption. The service supports correcting a closed interval even while its session runs; do not remove that capability. New missing-work entry or reassignment is an **extension**. Never edit planned calendar time to fix actual work.

Preserve the existing owner/version/receipt controls, retained evidence and audit. Interval review pages 100 rows; show the latest 100 audit changes with older history retained, and label those limits. Existing corrections reconcile recorded post-0009 Task contributions; pre-0009 credits cannot be individually reconstructed. Explain this legacy limitation rather than claiming automatic full-history reconciliation. Category history follows current owned relationships/names; tracked duration is self-report, not evidence of quality.

Preferred future native policy: pause on confirmed clean quit and system suspend, then offer Resume on reopen; crash gaps remain unresolved and ask “Was this time active work?” Keep or correct only after explicit review. This requires trusted main/backend lifecycle coordination and interval recovery contracts. The current timestamp-based model can include sleep or app-closed time in a still-open interval; a visual refresh cannot correct that. Do not ship a promise of pause-free actual-work accuracy until this extension is verified.

## 4. Critical end-to-end journeys

| Journey                         | Steps and handoff                                                                                                   | Failure/recovery and successful endpoint                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Open and begin meaningful work  | Verified local snapshot → priority lead → next work/block → objective and duration confirmation → Start             | Failed start retains form/key; success shows one confirmed runner with direct source link                                       |
| Capture during Focus            | Later → type → Save to Inbox → close → continue same session                                                        | Uncertain delivery retains frozen intent; capture neither pauses nor creates a Task automatically                               |
| Process without duplicate entry | Library/Inbox → saved capture → Process as Task → confirm title/optional parent → atomic conversion                 | Retry returns same Task; original body remains available; no retyping full source                                               |
| Plan a block and execute        | Plan/calendar → create block or recurrence → save → block details → Start Focus                                     | Overlap/DST error retains inputs; countdown copies objective/link/duration, but no stored schedule-session relation is invented |
| Switch between projects         | A running → Resume B → atomic switch → edit B notes → Resume A                                                      | A/B clocks and notes independent; conflict reloads actual runner, no silent finish                                              |
| Complete a daily practice       | Today routine checkbox → pending → confirmed                                                                        | Failed check reverts with inline Retry; no score or timed minutes created                                                       |
| Finish and close day            | Finish → outcome/optional Task completion → confirmed history → Close Day → review objective data/reflection → save | Day closure does not finish an active timer implicitly; closed plan edits require Reopen                                        |
| Recover after interruption      | Reopen → verify account → fetch selected/running sessions → inspect gap if future reconciliation supported          | Current version labels uncertainty honestly; extension allows reviewed correction without touching planned blocks               |
| Find deferred thinking          | Search or Library/Vault → retrieve full source → promote using existing command                                     | Promotion preserves source; unsupported future entity types remain absent                                                       |

Each journey must be possible through labeled controls without keyboard shortcuts, pointer hover, drag gestures or internet access in the packaged desktop app.
