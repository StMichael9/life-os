# Life OS interface system

## Direction — 2026-10-13

A quiet personal workspace: deep charcoal/green surfaces, warm off-white text, muted
olive for primary intent and teal for Focus. Compact navigation, readable lists and
contextual actions take precedence over decorative cards or dashboard metrics. The
shared renderer serves web and the offline Electron app; no internet/font service is
needed for styling. Personal records, counts and timers remain server-owned.

Research informed implementation, rather than copying another product:

- [Linear's UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui):
  align chrome, headers and panels; reduce competing emphasis; distinguish navigation
  density from content density. Applied to the shell and list/detail workspaces.
- [Notion Calendar settings](https://www.notion.com/help/notion-calendar-settings):
  contextual panels and grid density make calendar navigation practical. Applied as
  restrained toolbars, narrow time gutters and an internally scrolling week grid;
  this does not add Notion's integrations, zoom controls or scheduling model.
- [Tailwind Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
  and [source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files):
  one PostCSS compilation with explicit monorepo sources and static utility classes.
- [shadcn/ui monorepos](https://ui.shadcn.com/docs/monorepo): keep owned reusable
  components in the existing UI workspace. Evaluated its approach; no new application,
  CLI scaffolding or wholesale component library was installed.
- [Radix dropdown menus](https://www.radix-ui.com/primitives/docs/components/dropdown-menu):
  managed focus, arrow navigation, Escape and collision handling for contextual menus.
  Existing native dialogs retain their proven busy/dirty/discard protections.

## Implementation and tokens

`packages/ui/src/styles.css` replaces the accumulated foundation/consolidation/Focus
CSS overrides with one ordered theme/base/components/responsive system. Tailwind
4.3.3 supplies theme variables, reset, utilities and component composition; semantic
styles describe domain layouts and calendar geometry. Do not append another parallel
stylesheet or repeated override layer. Extend the shared component or its canonical
rule. `apps/web/postcss.config.mjs` compiles this once for the shared Next renderer.

| Role      | Token/value           | Use                         |
| --------- | --------------------- | --------------------------- |
| Canvas    | `canvas` / #111413    | Application background      |
| Surface   | `surface` / #181d1b   | Content panels/forms        |
| Elevated  | `elevated` / #212824  | Menus/hover surfaces        |
| Text      | `ink` / #ecede7       | Primary text                |
| Secondary | `secondary` / #a9b4ac | Supporting text/labels      |
| Border    | `line` / #303a34      | Quiet structural separators |
| Primary   | `olive` / #ced8ad     | Planning/capture controls   |
| Focus     | `teal` / #9cc9bc      | Timer ring/linked work      |

Use the bundled platform sans-serif stack; reflective text uses the local Georgia
fallback. Headings scale 27–34px, section titles 18–24px, body 13–14px, supporting
labels 11–12px. Uppercase eyebrows are short, secondary labels. Spacing uses the
4px rhythm (8/12/16/20/24/32), 8px controls and 12px panels. Error text/surfaces have
warm red tones; selected, disabled, focus and hover states are consistent.

Shared `Button`, `Panel`, `Eyebrow`, `PageHeading`, `EmptyState`, `LoadingState`,
`ActionMenu` and `MenuItem` live in `packages/ui`. Menus use the narrowly scoped
`@radix-ui/react-dropdown-menu` 2.2.1 dependency and retain original handler/link
behavior through `asChild`. Lucide remains the icon set. Motion was evaluated; short
CSS menu/ring transitions suffice, avoiding an extra runtime. Reduced motion disables
transitions/animation. No network assets or paid dependency/service was introduced.

## Layout and interaction contracts

- **Shell:** 204px sidebar, Today / Calendar / Goals / More, visible search/capture,
  consistent breadcrumb/account controls. Below 850px navigation becomes a compact
  horizontal strip. Secondary routes retain their URLs; More supports keyboard and
  Escape focus return. Ctrl/Cmd+K retains guarded search and capture.
- **Today:** date/Season, One Thing/Big 3, calendar, compact real counts, then secondary
  context. Start/Close Day takes primary emphasis; Edit priorities stays visible.
  The first real recommendation links directly to its Task; full explanations/context
  remain available. Saved Focus expands on Today and is fully open on Focus.
  Scripture/thought stay quiet, with working save actions and no execution scoring.
- **Calendar:** duration-based event geometry, subdued category colors, explicit
  timezone/time labels, Day/Week controls, selectable hours and block workspace.
  Week overflow stays inside the calendar. Existing recurrence, exceptions and DST
  handling are preserved; no drag/resize or external calendar integration is added.
- **Focus:** one centered radial countdown; primary Pause/Resume, separate Finish;
  compact independent session rows and New Session. Notes, linked work, history,
  automatic switching and frozen paused time retain the existing server behavior.
  Timer ticks are not an intrusive live announcement; overtime remains recorded.
- **Goals/Projects/Tasks:** shared list/detail surfaces, concise row metadata and
  contextual hierarchy links. Mobile stacks records above details and existing heading
  focus moves to the selected record. Measurable Goal targets and Task effort/ratings
  collapse; saved measurements open automatically. Fields remain in the form and
  their values are preserved when a disclosure closes.
- **Inbox:** fast multiline capture, visible delivery/retry feedback, direct Task
  processing and a contextual Vault/archive menu. Original capture text stays intact.
- **Routines:** one checkbox per daily practice, notes when useful, Edit/archive menu;
  archived completions remain accessible. Reflective practices are never scored.
- **Vault:** compact two-column collection on desktop, one column on mobile. Context
  expands without truncating stored data; Task promotion remains visible, while
  Edit/Goal/Project promotion/archive are contextual. Confirmations remain intact.
- **Forms/search/login:** consistent native dialogs and labels, visible validation,
  input bounds, password-manager autocomplete and guarded drafts. Optional Start Day
  reflection collapses; Close Day reflection starts open. Search uses corrected
  existing Goal/Project deep links, arrow navigation and actual owned results.
- **Loading/empty/error:** shell remains stable during private aggregation loading;
  neutral skeletons represent pending data, never fake metrics. Empty states guide
  real creation actions. Failures and success messages remain readable.

## Accessibility and verification limits

Semantic headings/nav/main, labels, native controls/dialogs, explicit button names,
visible focus, skip links and reduced-motion rules are shared. Native dirty-form,
request-in-flight and account-change guards remain. No renderer privileges change.

Focused Chromium checks cover desktop/mobile overflow, WCAG A/AA axe, menus/Escape,
search, processing, calendar/Focus persistence and representative forms. Automated
checks cannot establish screen-reader usability or visual taste. Local/Lead QA owns
200% zoom, Windows high contrast/scaling, screen readers, native packaging/restart,
comprehensive regression and final visual acceptance; see ui-refresh-handoff.md.

The anonymous foundation preview remains explicitly labeled and uses no fabricated
stored user records. Its timezone choice is temporary; authenticated pages use the
stored account timezone. No account settings backend or cloud sync was added.

## Content rights

The bundled KJV selection is public domain in many jurisdictions; UK Crown rights
need review before UK distribution. Thoughts are original Life OS copy with no
invented historical attribution. The immutable seven-day corpus still repeats weekly;
favorites persist privately in Vault. Faith reflection beyond this remains later-phase
work and is never scored.
