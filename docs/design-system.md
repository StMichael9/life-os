# Design system

## Intent

Quiet confidence, warm typography, restrained olive accents and meaningful empty
space. Execution has a clear hierarchy; Scripture and thought are calmer. No
neon dashboards, gamified spiritual metrics or imitation CRM navigation.

Tokens live in `packages/ui/src/styles.css` and are consumed by the shared React
app. UI primitives are Button, Panel and Eyebrow; expand them when an actual
interaction needs reuse, not as an exhaustive component-library exercise.

| Token          | Value   | Purpose                                         |
| -------------- | ------- | ----------------------------------------------- |
| background     | #101210 | Main canvas                                     |
| sidebar        | #131512 | Persistent navigation                           |
| surface        | #191c18 | Cards and dialogs                               |
| surface-raised | #20241e | Controls and elevated areas                     |
| text           | #eeeee5 | Warm primary text                               |
| muted          | #a3aa9b | Supporting text                                 |
| quiet          | #87917e | Metadata, never disabled-only important content |
| border         | #30372b | Subtle separation                               |
| accent         | #c4d2a2 | Direction, selected state and focus ring        |
| radius         | 12px    | Panels; controls use 5–7px                      |

System sans-serif for UI avoids third-party font requests and works across Windows
and mobile. Georgia/Times for reflective copy creates hierarchy without another
asset dependency. Content is readable without network font loading.

## Current surface

Today contains a preview notice, local date, Season guidance, the One Thing,
Big 3 guidance, daily KJV Scripture, and an original Life OS thought. No placeholder
metrics, task completion controls, fake accounts or simulated syncing. Navigation
links move to actual sections; future modules do not get empty pages.

The timezone dialog is functional. It defaults to the device timezone and uses an
explicit selected zone until reload. This is deliberately not described as a saved
account preference. Authenticated preferences will replace this adapter later.
Daily content updates at the next minute tick at local midnight, including DST.
The v1 corpus contains seven complete KJV verses and seven original aphorisms;
it repeats weekly and should grow only through a versioned future mapping.

Login and Inbox reuse the same tokens, panels and buttons. Forms use persistent
labels, password-manager autocomplete, visible status/error feedback and bounded
text input. Inbox distinguishes saving, uncertain delivery/retry and expired session;
private text is shown only after authentication and capture confirmation. There is
no simulated persistence. Both layouts collapse into a single column on mobile.

## Responsive behavior

Wide screens have a 232px sidebar and bounded central content. The sidebar reduces
to 205px at laptop widths. At 800px and below it becomes a horizontal navigation
strip above the content, without a desktop drawer squeezed onto a phone. At 580px,
the primary outcome comes first and reflective panels follow in reading order.
Touch controls and dialogs stay inside the viewport. Long Scripture wraps naturally.

## Accessibility

Use semantic headings, nav, main, sections, blockquotes and real buttons. Native
dialog provides focus containment, Escape dismissal and return to the triggering
control. Every control has a label; a skip link and visible focus rings support
keyboard navigation. Selected navigation uses aria-current. Decorations are not
interactive checkboxes. Motion respects prefers-reduced-motion. The date/content
clock is not an intrusive live region. Test all future forms at 200% zoom and with
keyboard + screen reader; automated axe checks do not replace that review.

Keep faithful reflection free of completion percentages or execution scoring.
Favorite/reflect actions will appear once authenticated persistence works.

## Content rights

The initial Scripture uses KJV text. KJV is public domain in many jurisdictions,
but UK Crown rights need review before UK distribution. The curated text is bundled
locally; no licensed Scripture or quote API is required. All thoughts are original
Life OS copy and are labeled as such, with no invented historical attribution.
