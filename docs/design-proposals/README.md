# Life OS: a workspace for the next meaningful action

Design proposal · 2026-10-15 · Status: proposed, awaiting review

This is a design-only specification. It authorizes no implementation, migration, dependency installation, native capability, hosting, or synchronization work. All people, activities, times and metrics in wireframes are **synthetic examples**, not stored user data. No usability study was conducted; criteria below are proposed targets.

## Reading order

1. This document: product thesis, evidence, navigation, disclosure and approval decisions.
2. [Experience blueprints](experience-blueprints.md): responsive homepage, capture, Focus, state behavior and end-to-end journeys.
3. [System and delivery](system-and-delivery.md): design tokens, React boundaries, contract mappings, replacement stages and measurable acceptance.

## 1. Product design thesis

Life OS should open at the point where intention becomes action. Its organizing unit is a person's day and current work, rather than a catalog of productivity tools. A user should be able to answer three questions immediately: **What matters? What is next? What am I doing now?**

Rebuild the frontend around a broad, quiet work canvas with a horizontal navigation bar. Today has three purposeful regions: a dominant Daily Agenda, one Core Focus instrument, and a compact Micro-Habits checklist. The One Thing and Big 3 live within the Agenda's priority composition; actual work is a clearly labeled line of evidence, not a score card. Season, daily Scripture, thought and reflection remain accessible without competing with execution.

This deliberately replaces the current sidebar and calendar-first page composition. It does not replace the domain model, APIs or protected local runtime. A Bento layout is useful here because unequal regions communicate unequal importance. It is not a reason to put every fact into a separate tile.

Design judgments:

- Favor a clear next action over a dense overview of everything the user owns.
- Give a recurring behavior one-click completion; give complex work a focused workspace.
- Capture raw intent immediately; ask for structure during Inbox processing.
- Use visible controls for common actions and a palette for acceleration and discovery.
- Preserve location and unfinished work when a person changes context.
- Keep time honest: planned calendar occupancy, measured active work and manually recorded Task totals are different facts.
- Treat faith and reflection as private narrative and practice, never performance scoring.

Untested hypotheses: a three-region homepage will reduce time to action; a horizontal shell will reduce perceived administrative overhead; embedding priorities inside Agenda will make them easier to act on. These need formative validation, not claims of proven improvement.

## 2. Baseline and evidence boundaries

The repository is nested at `work/life-os` inside the provided workspace. Reviewed sources include root `AGENTS.md`, `docs/progress.md`, `architecture.md`, `data-model.md`, relevant product-spec sections, `design-system.md`, the offline and Focus handoffs, shared React views, shared DTOs, validation commands, HTTP handlers and Focus interval writes.

**Baseline reconciliation — 2026-10-15:** the original review used Windows checkpoint `76304ff`. After the user requested coordination and the newest laptop release, remote `work` was fetched and checkpoint `fd14ccf` inspected. Its `docs/actual-work-handoff.md` supplies the previously missing input: stopwatch mode, configurable work target, interval review/correction, reset/discard, restart review and 7/30-day analytics are already implemented in Cloud. They are not proof of a laptop installation. This revision incorporates those contracts; do not rebuild them as new features. Durable drafts and native pause-on-suspend/quit remain separate proposals.

Documentation includes historical online-first passages and older installation statuses. The latest dated Windows progress entry reports the normal unsigned 0.1.3 offline installation and targeted checks; older architecture/progress passages describe earlier checkpoints. This proposal adopts the user's offline desktop priority and the later dated record, while making no independent claim about the running installed application or comprehensive native acceptance.

| Capability              | Evidence of existing behavior                                                                                                               | Design boundary                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Offline Windows runtime | Bundled local backend/PGlite; protected private HTTPS; installed lifecycle reports                                                          | Preserve; no renderer filesystem or database access                                        |
| Today                   | One bounded, verified aggregation with priorities, blocks, routines, ranking and actual Focus seconds                                       | Rearrange existing information; preserve limits                                            |
| Capture                 | Inbox raw text, owner-scoped request IDs, Task/Vault processing, retained originals                                                         | In-app capture can reuse contracts; durable unsent drafts cannot                           |
| Focus / actual work     | `fd14ccf`: countdown/stopwatch, configurable target, atomic switching, interval corrections/audit, reset/discard, restart review and trends | Reuse; native installation/acceptance still required; missed-work insertion is unsupported |
| Calendar                | Day/week blocks; recurrence and exceptions; overlap/DST validation                                                                          | Preserve focused calendar workspace; do not imply external integration or drag/resize      |
| Direction/Tasks         | Real owner-scoped hierarchy, versions, pagination and deep links                                                                            | Preserve full detail/edit capability beneath simpler entry points                          |
| Routines/Vault/search   | Stored completions, source-preserving promotion, literal private search                                                                     | Recompose; avoid treating routine checks as timed work                                     |
| Future domains          | Destination models/specification                                                                                                            | No implemented Career, Wealth, Business, Faith journal or Performance module is claimed    |

## 3. Research and interpretation

Sources accessed 2026-10-15. Standards and vendor documentation establish behavior or platform capability; product articles describe their authors' choices. Neither proves this design works for Life OS.

| Research finding                                                                                                            | Source                                                                                                                                                                        | Application and evidence level                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Focus visibility, reflow, contrast, keyboard access, target sizing and status feedback have explicit accessibility criteria | [WCAG 2.2](https://www.w3.org/TR/WCAG22/)                                                                                                                                     | Normative baseline. Target AA and stronger 44px primary touch controls; validate the finished UI                                        |
| Modal dialogs contain focus and return it appropriately when closed                                                         | [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)                                                                                       | Guidance for capture, confirmations and mobile sheets                                                                                   |
| A searchable suggestion widget needs coherent keyboard and accessibility semantics                                          | [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)                                                                                               | Guidance if palette results become an autocomplete listbox; do not mix incompatible link/menu/listbox behavior                          |
| Recognition reduces memory demands; disclosure can keep secondary options available                                         | [NN/g recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/), [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)   | Practitioner guidance, not Life OS test results. Keep labels and primary actions visible                                                |
| Feed, list-detail and supporting-pane layouts adapt to available space                                                      | [Material canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview), [Material card principles](https://m1.material.io/components/cards.html) | Primary design guidance. Use grouped surfaces with clear purpose; three-region Bento is our judgment, not a validated universal pattern |
| Consistent chrome and adjusted density can reduce competing emphasis                                                        | [Linear's redesign account](https://linear.app/now/how-we-redesigned-the-linear-ui)                                                                                           | First-party case study. Borrow consistency principles, not its surface or navigation                                                    |
| A discoverable command menu can expose shortcuts alongside commands                                                         | [Todoist's command-menu account](https://www.todoist.com/da/inspiration/todoist-command-menu-keyboard-shortcuts)                                                              | First-party interaction precedent. Palette accelerates visible workflows                                                                |
| Theme variables express shared styling decisions                                                                            | [Tailwind theme variables](https://tailwindcss.com/docs/theme)                                                                                                                | Technical documentation; retain the installed build pipeline                                                                            |
| Accessible primitives handle specific interaction mechanics; product authors still supply labels and composition            | [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)                                                                                        | Technical documentation; primitives do not certify a product                                                                            |
| Owned component source offers customization with maintenance responsibility                                                 | [shadcn/ui introduction](https://ui.shadcn.com/docs)                                                                                                                          | Technical/product documentation. Selective patterns may help; wholesale adoption is not justified                                       |
| Isolation and sandboxing define a critical native trust boundary                                                            | [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)        | Platform documentation. No capture or timer feature warrants relaxing those protections                                                 |

No evidence supports claiming that Bento shapes, a dark theme, a circular timer or fewer navigation labels inherently improve productivity. Those are design choices to evaluate with realistic tasks.

## 4. Information architecture and navigation

### Proposed shell

Desktop top bar: **Life OS · Today · Plan · Library · Search · Capture · Account**. No permanent sidebar. The native title bar and its window controls remain native; do not introduce custom draggable title-bar behavior as part of this redesign.

| Destination | Purpose                                                | Existing route mapping                                                |
| ----------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Today       | Execute the selected day; current Focus and routines   | `/`                                                                   |
| Plan        | Schedule work and connect it to direction              | Default `/schedule`; local links to Tasks, Goals, Projects, Seasons   |
| Library     | Retrieve captured thinking and browse work collections | Default `/inbox`; local links to Vault, Routines, Tasks and Direction |
| Search      | Search owned records and run commands                  | Existing palette/search contract                                      |
| Capture     | Write now, classify later                              | Shared Inbox composer                                                 |
| Account     | Session/account controls and supported local utilities | Existing supported actions only; no invented settings page            |

Plan and Library are purpose-based entry groups, not new data domains or required route changes. The shell derives active group from the route. Direct URLs remain valid. Tasks is reachable from both groups because it serves planning and retrieval; it remains one collection and editor. Within a group, show a compact labeled local navigation row, not a second global sidebar. Use ordinary links, not tab roles for full route changes.

Keep `/focus` as a direct deep link to the focused workspace, available through Core Focus and the palette. It does not need a permanent global navigation slot. `/routines` and `/vault` remain first-class reachable workspaces, not deleted functionality.

On mobile, bottom navigation is **Today · Plan · Library**, with visible Search and Capture buttons in the top bar. Text labels accompany icons. Capture is an action, not a fourth destination. Tablet keeps the desktop bar while space allows; at narrow widths use the mobile structure. Browser back and in-workspace Back preserve date, filters and selection where safely representable in URLs.

Tradeoff: removing dedicated global Tasks/Goals/Focus entries costs one extra browse step. Local navigation, direct contextual links and searchable commands offset this; validate discovery with users who do not use shortcuts. Do not add a sidebar back solely to expose every domain.

### Context and hierarchy

Show an owned breadcrumb in detail: Vision → Goal → Milestone → Project → Task, omitting absent ancestors. Never require all hierarchy levels or manufacture a parent. A Task has one optional Project or direct Goal, not both. A Project has one optional Milestone or direct Goal. Category is a classification, not a substitute owner or parent.

Daily Big 3 outcomes remain deliberate, independently completable commitments. Checking a linked Task does not silently check its outcome; finishing Focus offers explicit Task completion only. The One Thing is currently text, with no separate completion field or direct Task link: render it as the day's headline, not a new checkbox or synthetic relationship.

## 5. Progressive disclosure contract

| Level    | Always available here                                                                                      | Revealed deliberately                                           | Kept in focused workspace                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Shell    | Navigation labels, Search, Capture, active-session text indicator when timer is elsewhere                  | Account menu and command list                                   | Account forms/native utilities only when supported           |
| Today    | Date/timezone, One Thing or setup prompt, next action, current/upcoming blocks, main timer, routine checks | Big 3 editor, rest of agenda, saved-session list, daily context | Full calendar, work collection management, extended history  |
| Work row | Title, status, meaningful date/time, one contextual primary action                                         | Notes, reason, parent, overflow actions                         | Full ratings, measurements, recurrence, archive confirmation |
| Focus    | Objective, mode, timer state, Pause/Resume, Finish, work link                                              | Notes and saved sessions                                        | Finish review, history, future interval reconciliation       |
| Capture  | Text, Save to Inbox, close/keep behavior and delivery state                                                | Optional origin context; process saved item                     | Parent/classification forms after capture                    |

Rules: never hide validation errors, unsaved state, stale-data warnings, running state, destructive consequences or required fields in a collapsed region. If an error is in a disclosure, open it and focus its error summary. Closing a disclosure preserves its values. Show existing saved optional values as a short summary. Use overflow menus for rare actions, never the only way to complete, pause, capture or retry. Limit to one modal at a time; replace its content or finish it before opening another.

## 6. Future-domain scalability

Future domains enter a Library browse view and relevant contextual workflows, not a growing global menu. Plan remains for commitments, Today for action, Library for retrieval. A future domain workspace may have its own local navigation and explicit typed links. No generic polymorphic relationship table, new domain contract or dashboard aggregation is introduced by this proposal.

| Future domain | Contextual entrance                                | Today contribution, only after separate implementation                                |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Career        | Library → Career; linked Goal/Project; palette     | A real follow-up Task, practice block or due review                                   |
| Wealth        | Library → Wealth; financial review workspace       | An explicitly chosen reminder; no permanent balance tile or inferred financial advice |
| Business      | Library → Business; Project context                | Chosen experiment action linked to actual records                                     |
| Faith         | Library → Faith; daily Scripture context           | Optional reflection/practice; excluded from ranking and execution scores              |
| Performance   | Library → Performance; routine or training context | Scheduled training or intentionally chosen check-in                                   |

A contribution must explain why it is due, link to its source and allow contextual action. No domain automatically receives its own homepage card. Sensitive future narrative is excluded from broad previews and search until its access/lock policy is defined. The present search does not yet provide a privacy-lock guarantee.

Future extensibility is a small typed navigation registry and domain-specific adapters when needed, not a plugin marketplace or universal entity abstraction. Saved custom homepage layouts and pinned domain favorites would require separately designed preferences persistence.

## 7. Recommendations, tradeoffs and approval decisions

Main recommendations: replace the sidebar with three stable purpose-based destinations; make Today an unequal three-region Bento; preserve one timer across all contexts; build capture around Inbox and stable delivery identity; retain the existing styling toolchain while replacing the layout and component composition.

| Decision               | Recommended choice                                                                  | Cost or alternative                                                                            | Approval needed before engineering                                 |
| ---------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A. Navigation          | Today / Plan / Library with contextual workspaces                                   | Less direct global browsing; alternative is four destinations including Work                   | Approve naming and grouping                                        |
| B. Homepage            | Agenda dominant, Focus supporting, Micro-Habits compact                             | More vertical scrolling on narrow devices; full calendar is one step away                      | Approve hierarchy and dark visual direction                        |
| C. Timer scope         | Recompose the existing countdown/stopwatch model from `fd14ccf` into one instrument | Preserve mode and current strict fields; do not introduce a second timing backend              | Approve visual composition; native install is separately requested |
| D. Session switching   | Activating another session means pause current and resume target                    | Accidental starts possible; label rows “Resume” and retain a separate read-only Details action | Confirm behavior and labels                                        |
| E. Draft lifetime      | Memory preservation first; encrypted durable drafts as a separate slice             | Memory cannot survive reload/crash; automatic Inbox saves would create unwanted records        | Approve durable-draft retention/privacy policy separately          |
| F. Time recovery       | Reuse existing audited trimming/reset/discard/confirmation contracts                | Missing-work insertion and automatic adjustment of pre-0009 Task credits remain unsupported    | Approve any expansion beyond current recovery semantics separately |
| G. Native interruption | Propose pause-on-clean-quit/suspend, reconcile crash gaps                           | Changes lifecycle behavior and requires trusted native events                                  | Approve native policy separately; do not infer it already exists   |

This document is ready for design review. Approval of the visual/interaction direction should not be interpreted as authorization for the separate backend/native capabilities or for deployment. The roadmap explicitly gates them.
