# Design system, frontend architecture and delivery

Design only · See [overview](README.md) and [experience blueprints](experience-blueprints.md). Baseline updated to Cloud `fd14ccf`: stopwatch, work targets, audited trimming/reset/discard, restart review and trends are existing contracts pending laptop integration, not new engineering proposed here.

## 1. Visual system

Premium means clear hierarchy, disciplined proportions and reliable feedback. Use a dark neutral canvas, warm text and one restrained mint accent. Remove the persistent green navigation rail and decorative dashboard metric cards. Large whitespace belongs around decisions; compact spacing belongs inside repeated rows. Rounded panels organize work, while lists carry detail.

These are proposed tokens, not edits to the existing stylesheet. Values require contrast and real Windows display review before release. The present olive/teal system is a working baseline, not a requirement to preserve its look.

| Token family | Proposed values | Rules |
| --- | --- | --- |
| Canvas / panel / raised | `#111315` / `#191C1F` / `#23272B` | Three elevations; no glass blur, gradients or transparency needed for hierarchy |
| Text / secondary | `#F2F0EA` / `#B8BEC4` | Primary decisions and readable supporting context; do not dim ordinary labels into illegibility |
| Quiet divider | `#353B42` | Decorative separation only; never sole required input/control boundary |
| Control boundary | `#7A848E` | Distinct field/checkbox outlines; verify non-text contrast in actual contexts |
| Accent / on-accent | `#A9D9CC` / `#102620` | Pause/Resume, selected action and focus indicators; color is not the only state cue |
| Success / caution / error | `#A9D9CC` / `#E8C987` / `#F0AAA6` | Pair with words and icons; semantic badges remain readable in grayscale |
| Type | Segoe UI, system-ui, platform sans-serif; Georgia only for optional reflective quotations | Local stack, no font fetch; tabular numerals for time |
| Type scale | 12 metadata; 14 labels; 16 body; 18 section; 24 priority; 32 date/page; 48–64 timer | Body line-height 1.5; labels 1.35; timer 1.05; 12px never for essential instructions |
| Spacing | 4, 8, 12, 16, 24, 32, 48px | 16/24 panel padding, 12px row gap, 24px region gap |
| Shape | 8px controls, 16px major regions, 10px dialogs' internal groups | Avoid a separate pill for every metadata value |
| Sizes | 44px primary/touch controls; 36px dense desktop rows with adequately sized actions | Icon glyphs 16/20px inside larger targets; no unlabeled icon-only primary navigation |
| Focus | 2px high-contrast outline, 3px offset; forced-colors fallback | Never remove outline without a clear substitute |
| Elevation | Border for panels; restrained shadow only on transient overlays | Stacking tokens: base 0, sticky 10, menus 30, modal/top layer 50, feedback 60 |

Use semantic aliases such as `surface.canvas`, `text.muted`, `action.primary`, `status.error` and `border.control`. Components consume roles rather than raw brand colors. Interactive state tokens are explicit; arbitrary utility colors cannot become a second design system. A future light theme can use these roles, but a light-theme preference and persistence are not presumed implemented.

### State and motion specifications

| State | Visual and interaction behavior |
| --- | --- |
| Hover | Raised surface or underline; not the only way to reveal critical controls |
| Pressed | Small tone change; no layout movement |
| Selected | Text label/current indicator plus accent rule; distinguish selected record from running session |
| Pending | Local progress label and disabled duplicate action; retain descriptive text |
| Disabled | Muted but understandable; explain prerequisite near the control when needed |
| Error | Field message and error summary; preserve values; move focus only for submitted validation failures |
| Success | Quiet inline confirmation; polite announcement once; no confetti |
| Stale/uncertain | Persistent warning near the affected content, not a disappearing toast |
| Unsaved | Visible state associated with the specific draft/session; no fake “Saved” on debounce alone |

Use 120–160ms opacity/color transitions, at most 180ms for a disclosure. No automatic card rearrangement, animated numeric rolling or pulsing focus ring. Respect `prefers-reduced-motion`: remove transitions and skeleton shimmer, retain state changes. Countdown ring updates without spatial flourish; count-up uses a static ring. Motion communicates changes rather than decorating elapsed time.

## 2. Accessibility contract

Target [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) across the replacement UI. Meet 4.5:1 ordinary text and 3:1 large text/non-text requirements where applicable; interactive hit targets must meet the standard's minimum, with 44×44px as the preferred product target. Validate actual combinations rather than assuming token values certify compliance.

- Semantic landmarks, one main heading, ordered section headings, skip link and meaningful button/link names. Use ordinary checkboxes for routine/outcome completion. Never nest clickable controls inside a clickable row button.
- Keyboard order follows DOM/reading order. Every menu and dialog supports Escape and returns focus to its invoker or logical successor. Account for dirty/busy guards explicitly; do not trap users indefinitely while a failed request hangs. Keep the visible Close/Cancel route available once safe to leave.
- Reflow at 320 CSS px without page-level horizontal overflow. The full week calendar may use an appropriately labeled two-dimensional scrolling region and offer day/list alternatives; lists and forms must reflow. Support 200% text enlargement and 400% browser zoom. Sticky headers/navigation cannot obscure focused controls.
- Timer visual SVG is decorative; provide readable time text and an explicit mode/state label. Use `role="timer"` without per-second live announcements. Announce user-triggered pause/resume/switch/finish once via polite status; do not announce every tick or countdown digit. Offer readable exact elapsed/remaining values on demand.
- Honor Windows forced-colors, increased contrast and platform scaling. Do not rely on shadows, hue or thin ring strokes for required state. Selected/running/paused each include words.
- Forms have labels, constraint hints and associated errors. Keep raw seconds/timezone information where conversion matters. Date-only choices use account-local dates; ambiguous/missing DST wall times require explicit correction, never silent shifting.
- Pointer, touch and keyboard users receive the same actions. No hover-only edit, drag-only rescheduling or shortcut-only capture. Touch completion controls and adjacent overflow buttons cannot overlap.
- Native dialog/APG patterns guide focus behavior; retain the existing guarded native-dialog mechanism unless a replacement provides equal behavior. Screen-reader checks remain necessary even with accessible primitives.

## 3. React composition and state ownership

Proposed architecture stays inside existing package boundaries. Do not import database, Node, server services or Electron into browser-safe packages. Next adapters own server composition; shared React uses the same authenticated HTTP boundary on web and the local desktop origin.

```text
apps/web route adapters                 existing URLs/auth boundary
  AuthenticatedWorkspace                verified account lifecycle
    WorkspaceFrame                      top/bottom navigation, landmarks
    CaptureProvider                     account-bound memory draft + retry intent
    ExecutionController                 one snapshot + session mutation coordinator
      TodayWorkspace
        DailyHeader
        TodayGrid
          DailyAgenda
            PriorityLead / OutcomeRows / NextAction / AgendaRows / TimeEvidence
          CoreFocusSlot -> SessionInstrument
          MicroHabits -> RoutineCheckRow
        DailyContextDisclosure
      CalendarWorkspace -> BlockInspector -> SessionInstrument (transferred slot)
      FocusWorkspace -> SessionInstrument (expanded slot)
    CommandDialog / CaptureDialog / active editor

packages/ui                             visual primitives/tokens only
packages/app                            domain views/controllers and HTTP client
packages/shared                         browser-safe DTOs and pure time/date functions
packages/validation                     strict input schemas
packages/api + database                 unchanged trusted services/repositories
apps/desktop                            unchanged privileged lifecycle/trust boundary
```

Composition example — **illustrative pseudocode only**, not application code or a request to implement:

```tsx
<WorkspaceFrame active="today" onCapture={capture.open}>
  <DailyHeader date={snapshot.date} timeZone={snapshot.timeZone} />
  <TodayGrid>
    <DailyAgenda plan={snapshot.plan} schedule={snapshot.schedule}
      nextAction={nextAction} evidence={snapshot.snapshot} />
    <CoreFocusSlot>
      <SessionInstrument selected={sessions.selected}
        status={sessions.status} onPause={sessions.pause}
        onResume={sessions.resume} onFinish={sessions.reviewFinish} />
    </CoreFocusSlot>
    <MicroHabits routines={snapshot.routines} date={snapshot.date} />
  </TodayGrid>
</WorkspaceFrame>
```

`nextAction` is a pure view projection over available data, not a new authority or scoring service. Domain commands stay in controllers/adapters, not `Button`, `Panel` or generic hooks that infer ownership. Route composition chooses a single timer host; session state is not duplicated per card or block inspector.

State contracts:

| State | Owner and lifetime |
| --- | --- |
| Personal records, intervals, versions, execution totals | Backend; last verified snapshot in account-scoped memory |
| Selected session/date/filter | Validated URL IDs/dates where supported; no text, notes or secret values in URLs |
| Capture/notes/form drafts | Account-and-record-scoped memory; shared shell lifetime; explicit discard/account-change behavior |
| Timer rendering clock | One calibrated tick source; isolate per-second render to instrument/text indicator, not entire dashboard |
| Pending intent | Stable command payload and request UUID; retry coordinator until confirmed or explicitly resolved |
| Disclosures and temporary browse state | Local view memory; no promise of restart persistence |
| Durable draft/correction/native interruption metadata | Future trusted service, only after separate contract design |

Foreground/visibility refresh and existing visible 60-second polling remain; do not add polling for each region. Snapshot results carry owner stamps; old generations and mismatched identities are ignored. Mutations retain CSRF and account preconditions. Account changes purge cached private views before another account's data appears. Draft editors are not overwritten by background snapshots. Reconcile stale versions explicitly.

One request coordinator serializes timer commands and freezes pending intents. Other safe operations need not be globally disabled because the timer is pending. Avoid a new global state library until actual coordination requirements exceed React context/reducer and current request helpers. Cross-window single-runner enforcement remains a backend responsibility.

### Component specifications

| Component | Inputs | Output and important rule |
| --- | --- | --- |
| `DailyAgenda` | Plan, schedule, bounded Tasks/ranking, selected date | Presentation and explicit callbacks; no independent data fetch |
| `PriorityLead` | One Thing, Big 3, plan version | Headline and independently completable outcomes; versioned full-plan save |
| `NextAction` | Running session/current block/ranked candidate | Exactly one recommended primary path with explanation; no inferred completion |
| `SessionInstrument` | Authoritative session, server clock anchor, pending status | One circle; emits requested control action, never writes elapsed totals |
| `SavedSessionList` | Loaded sessions, runner/selection IDs, next cursor | Resume versus Details explicitly separate; paginated loading |
| `CaptureComposer` | Memory draft and delivery state | Text, save/discard/close; entity-neutral |
| `RoutineCheckRow` | Routine/date/completion/pending state | Checkbox + per-row retry; local-date command |
| `MutationFeedback` | Pending/conflict/error/confirmed result | Persistent feedback at action site; one polite announcement |

## 4. Styling strategy: evaluate the actual baseline

The current project already uses Tailwind 4.3.3, one shared `packages/ui/src/styles.css`, explicit monorepo source detection, owned UI primitives, Lucide and a narrowly scoped Radix dropdown-menu dependency. “Existing CSS versus Tailwind” is not a greenfield binary choice here. Layout replacement can retain the build infrastructure while replacing visual and composition decisions.

| Approach | Accessibility | Maintainability | Performance | Fit and decision |
| --- | --- | --- | --- | --- |
| Shared semantic CSS | Does not supply focus management; supports precise reflow/forced-colors rules | Clear domain geometry; risks repeated overrides if ungoverned | Static CSS, no styling runtime | Retain for grids, timer geometry, calendar and complex states |
| Installed Tailwind | Utilities do not create semantic controls | Shared tokens/static variants; long repeated utility strings need component extraction | Build-time CSS; inspect emitted size/source detection | Retain for bounded component composition; no migration needed |
| Radix primitives | Useful keyboard/focus mechanics with correct composition and labels | Dependency/API cost but less hand-maintained menu behavior | Incremental JS per imported primitive; measure | Keep current menus; add primitives only for demonstrated behavior gaps |
| shadcn/ui owned source | Depends on chosen primitive and application integration | Easy customization; copied source and upstream changes become our responsibility | Depends on imported component/dependencies, not the name | Borrow selective component patterns after review; no CLI sweep, duplicated tokens or wholesale replacement |
| New CSS-in-JS runtime/full UI framework | No automatic accessibility guarantee | Adds another styling/upgrade system | Potential runtime/bundle cost | No demonstrated benefit for this scope; do not adopt |

Recommendation: one canonical token layer and CSS compilation, semantic layouts plus static utilities, minimal accessible primitives, and owned reusable UI components. Do not append a new stylesheet overriding the old one indefinitely. During replacement use scoped new region styles; delete obsolete rules only when their last consumer is retired and parity is checked. Preserve legacy states until their consumers migrate. No library install or package update is part of this proposal.

Official technical references: [Tailwind theme architecture](https://tailwindcss.com/docs/theme), [source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files), [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility), [shadcn/ui owned components](https://ui.shadcn.com/docs).

## 5. API and data mapping

These are current contract mappings, not proposed endpoints. Strict command variants require their complete schema-defined fields; the table lists meaningful fields, not exhaustive payload examples. Unknown fields are rejected. Never send a request-supplied user ID as owner authority.

| Proposed surface/action | Existing contract/data | Constraints and limits |
| --- | --- | --- |
| Today/date/context | `GET /api/execution/today`, `ExecutionSnapshot` | `date`, `calendarDays=1/7`, `focusId`, available minutes/energy; verified account timezone and `serverNow` |
| Priority headline/Big 3/start/close/reopen | `POST /api/execution`, action `plan`; `DailyPlan` | Full versioned set, oneThing nullable, up to 3 outcomes; reflection object preserved; no One Thing completion field |
| Daily Agenda blocks | Snapshot schedule/series; execution `schedule`, `schedule-series` | Task OR Project; category/objective; versions, overlap rejection, UTC instants, timezone/DST validation |
| Calendar expansion | Same snapshot, 1 or 7 days | Day max 100 blocks, week max 500; week starts selected date, not assumed Monday |
| Next action/attention | Snapshot Tasks, recommendations and reasons | Up to 200 candidate Tasks plus preserved chosen links; bounded data, no exhaustive urgency claim |
| Actual/planned evidence | `snapshot.focusSeconds` / `snapshot.scheduledMinutes` | Interval seconds versus clipped planned minutes; no sum with Task totals |
| New countdown/stopwatch | execution `focus-start` | `timerMode` countdown/stopwatch; stable session/request IDs; objective max 500; planned minutes 1–720 required by current strict schema in either mode; notes max 2000; Task OR Project |
| Pause/resume/finish | execution `focus-control` | ID/current version, operation, outcome, notes, explicit `completeTask`; existing atomic switching and finish |
| Saved sessions | `GET /api/execution/focus?before=...`; snapshot sessions/next | 50 per page; selected and runner included in Today when needed; no cap on paused storage |
| Session notes | execution `focus-notes` | Unfinished sessions only; versioned save; no automatic objective/link edit |
| Actual-work target/trends | Snapshot `workTime`; execution `work-target` | Versioned target 1–1440 minutes; 7/30-day views; current target applies historically; averages include zero-work days |
| Review/correct/reset/discard/confirm | `GET /api/execution/work-session/{id}`; execution `work-adjust` | Owned versioned operations with reason; correction trims existing intervals; interval pagination 100, latest 100 audit changes; post-0009 Task credits reconcile |
| Micro-Habits | Snapshot routines; execution `routine-check` | Routine ID, local date, completed, notes; max 100 active definitions; preserve completion history |
| Manage routines | execution `routine` | Complete definition and version, weekdays, spiritual classification and archive |
| Raw capture | `POST /api/inbox` `{body, requestId}`; `GET /api/inbox` | 10,000 text chars and 16 KiB JSON limit; identical trimmed retry returns same item; 50-row pagination |
| Process capture as Task | `POST /api/tasks/from-inbox/{id}` | Atomic source-preserving conversion; original command identity retained across retries |
| Inspect original capture | `GET /api/tasks/from-inbox/{id}` | Original text and current conversion link; supports processed provenance |
| Vault processing/promotion | execution `vault` with `sourceInboxId`, `vault-task`, `vault-promote`, `inbox-dismiss` | Promotion target Goal/Project uses existing owned command; archives source transactionally |
| Vault retrieval | `GET /api/execution/vault`, `/vault/{id}` | 50/page, kind/archive filters; full text via detail; title max 200/body 10,000 |
| Search/palette | `GET /api/execution/search?q=...` | Literal search max 100 chars, 10 results/domain; no Focus-session or future-domain search assumed |
| Work detail/edit | `/api/tasks`, `/api/tasks/{id}` and `/api/direction/...` | Owner-scoped detail/ancestor trail, 50/page lists, strict full replacements and versions |
| Daily content favorites | Existing Vault save behavior | Bundled date-stable content; do not add faith scoring or an unimplemented dedicated journal |

All private operations retain verified sessions, `no-store`, exact-Origin/CSRF controls, strict validation, generation guards and account preconditions. Existing receipt fingerprints, ownership predicates, composite foreign keys and single-runner/open-interval indexes remain mandatory. A new visual client is not a new authorization layer.

Important absent relations: Focus sessions do not store `scheduleBlockId`, and One Thing does not store a Task ID. A block can prefill a Focus start but exact per-block actual comparison is not reliable by title/Task matching. Adding those relations requires separately reviewed persistence; do not invent them in analytics or UI.

## 6. Separately authorized engineering ledger

| Capability | New work required | Gate before it can appear as functional |
| --- | --- | --- |
| Count-up mode | Already implemented by `fd14ccf`; recompose its `timerMode` contract | Native package/upgrade verification, not a replacement backend |
| Correction/reconciliation | Existing owned interval review, audit, trim/reset/discard/confirm and post-0009 contribution handling | Additional missing-work insertion or legacy credit reconstruction is separate scope; preserve current limits |
| Durable sensitive drafts | Authenticated encrypted local persistence, key/retention/deletion/recovery policy, atomic payload+retry identity | Privacy/security review; crash recovery demonstrated |
| Pause on suspend/quit | Trusted main/backend lifecycle coordination, bounded shutdown, sleep/crash policy | Actual Windows suspend/restart/crash verification; renderer remains unprivileged |
| OS-wide capture | Shortcut registration and dedicated secure capture surface; explicit signed-out behavior | Separate Electron scope and narrow validated capability review |
| Per-block actual comparison | Explicit schedule↔session relation and multi-session/edited-series semantics | Domain/contract approval; no title-based inferred joins |
| Durable layout preferences / new profile settings | Account-scoped preference contract | Approval only if customization is chosen; not needed for default layout |
| Future domains / sync / hosting | Independent domain APIs, storage and access design; sync conflict model separately | Outside this frontend replacement entirely |

## 7. Staged frontend replacement roadmap

Each stage is a coherent reviewable slice in a future engineering task. This proposal does not execute these stages. Keep old routes and existing backend contracts working while the new compositions replace them. Do not split web/Electron renderers or start a second design-system package.

| Stage | Frontend deliverable | Preservation/exit gate |
| --- | --- | --- |
| 0 — Approve direction | Review wireframes, navigation labels, timer/draft boundaries and missing handoff | Approve visual direction separately from backend/native scope; inventory every current reachable action |
| 1 — Foundation and shell | Canonical token roles, responsive top/bottom shell, local navigation and feedback primitives | Existing direct URLs/auth flows work; all Tasks/Direction/Inbox/Routines/Vault/Focus actions remain discoverable |
| 2 — Today replacement | Agenda, priority composition, countdown/stopwatch Core Focus, target/activity/trend disclosure, routine checks, daily context | One existing aggregation; plan/reflection/close/reopen parity; limits and actual/planned distinction retained |
| 3 — Capture and command flow | Shared in-memory capture composer, stable retry intent, improved palette, source-preserving processing | Explicit non-durability boundary; account guards and uncertain delivery preserved; no new storage |
| 4 — Focus and connected workspaces | One timer host for both existing modes, saved-session activation, notes/finish/restart/correction review and work connections | Preserve both modes, target/analytics, pause-before-stopwatch-outcome and audited changes; one runner; recurrence/DST/edit capabilities retained |
| 5 — Remaining workspace composition | Tasks, Direction, Inbox processing, Routines and Vault use shared list/detail/form rules | All supported fields, measurements, full context, archive/reopen, parent pagination and source links preserved |
| 6 — Optional contract extensions | Independently approved durable drafts, missing-work insertion/legacy reconciliation and native interruption policy | Each has its own service/schema/security review and isolated recovery acceptance; do not rebuild existing stopwatch/correction APIs |
| 7 — Final acceptance and retirement | Bounded packaged offline acceptance, keyboard/accessibility review, obsolete frontend styles removed | User accepts final flows; native gates and rollback/profile compatibility documented before installation |

Rollback strategy for a future frontend-only change: retain the last accepted frontend checkpoint and compatible packaged application; revert the presentation slice without touching stored records or migration history. If optional extensions add schema, define backward compatibility and backup/application-version recovery first; a frontend rollback does not authorize a database downgrade. No destructive profile reset, reinstall or production migration is a design acceptance technique.

Feature parity inventory must include: all Task statuses/ratings/actual-duration fields; Goal measurements; Vision creation; Season activation/100% allocations; Milestones; independent Projects; plan reflections/reopening; single/series/exception schedule edits; overtime/finish/notes/switching; routine archive/completion history; Vault full context and promotions; processed capture detail; search/navigation; login/logout/draft guards. Simplified presentation cannot remove these behaviors.

## 8. Measurable acceptance criteria

These are targets for future implementation/validation, not results. No application test suites, builds or installations were run for this documentation-only proposal.

| Area | Acceptance target and method |
| --- | --- |
| Next-action clarity | In a formative study with 5–8 representative participants, at least 80% identify the next meaningful action and current session state within 10 seconds without coaching. Record misunderstandings; small-sample results are directional |
| First-use capture | From every authenticated workspace, one visible action opens editable capture without entity selection; save needs no classification or parent |
| Capture speed | At least 80% of formative participants save a provided short thought within 15 seconds from the current page; exclude typing speed only if declared before testing |
| Capture reliability | Double-submit/lost-response replay yields one Inbox item for the same intent; text and UUID remain unchanged until confirmed; changed-body retry conflicts do not destroy input |
| Draft honesty | Closing/reopening composer preserves input while shell lives; UI never claims restart durability until encrypted service passes recovery checks; no private browser persistence |
| Homepage composition | At 1440×900 and 1280×800 CSS px, priority lead/next action and timer primary control are visible without opening a disclosure; all three regions exist without separate metric cards |
| Responsive behavior | Review 320, 390, 768, 1024, 1280 and 1440px, portrait/landscape and long labels; no overlap/cutoff or unintended page-level horizontal scroll; mobile sequence follows blueprint |
| Action discovery | All critical journeys work without shortcuts; formative participants find saved sessions, Inbox processing and linked work in at most two meaningful navigation/disclosure actions from the relevant surface |
| Accessibility | No known WCAG 2.2 A/AA failure in changed surfaces after automated and manual keyboard, NVDA, zoom/text, Windows forced-colors and touch review; do not equate an automated pass with conformance |
| Timer singularity | One visible/accessibility timer instrument in Today, focused or block context; background instrument removed/hidden when transferred; no per-second live announcements |
| Switching integrity | Synthetic A12m → pause7m → B4m → A3m produces A15m/B4m with independent notes and one runner; concurrent window/double-click tests preserve DB invariants |
| Actual/planned integrity | Actual daily evidence excludes paused time, splits at account-local midnight/DST and never adds Task aggregate totals; planned blocks unchanged by Focus finish/correction |
| Timing display | Foreground display matches server-calibrated whole-second timing within 1 second after a successful reconciliation; no accuracy promise while service/time is unverified |
| Finish integrity | Retrying one finish adds Task contribution once; finishing paused A leaves running B intact; optional Task completion explicit; Big 3 not silently changed |
| Boundary preservation | Changed renderer imports no Node/Electron/server/database modules; retains sandbox/isolation/origin/certificate/permission restrictions and owner/CSRF/version guards |
| Offline daily use | On actual Windows packaged app with network disconnected: existing login/session behavior, snapshot, capture, processing, planning, habits and Focus work against bundled backend; no font/CDN/API required |
| Performance | On a declared reference laptop/profile, warm Today navigation becomes usable within 1 second at p95 across 30 measured navigations; no new per-region request fanout, no per-tick whole-page rerender |
| Bundle discipline | Record baseline route JS/CSS before implementation; target no >10% transferred-byte growth for equivalent routes without documented benefit; do not invent baseline sizes now |
| Existing work-time parity and extensions | Both modes survive restart; existing reviewed corrections/reset/discard retain audit and reconcile eligible credits. Separately, durable sensitive drafts and changed native suspend/quit policy require their own acceptance |

Measure performance using synthetic records on an isolated profile, with hardware/build/sample size recorded. Installation QA must preserve real profiles and use the existing native release/recovery process. Validation may identify design revisions; it is not a reason to broaden this assignment into new domains or synchronization.

## 9. Review conclusion

The frontend can be substantially replaced while reusing authentication, ownership, daily aggregation, planning, schedule/recurrence, countdown/stopwatch switching, work targets/trends/audited corrections, routines, Inbox processing, Vault and private search. The three-region homepage and purpose-based navigation are presentation decisions.

Durable encrypted unsent input, missing-work insertion/legacy-credit reconciliation, changed native interruption policy and explicit per-block actual relations remain separate engineering capabilities. Stopwatch and bounded audited corrections already exist in Cloud `fd14ccf` and must be preserved. Proceed with design implementation only after the relevant decisions in the [approval ledger](README.md#7-recommendations-tradeoffs-and-approval-decisions) are confirmed; the user's subsequent laptop-update request authorizes installation coordination for completed code, not a claim that these wireframes are implemented.
