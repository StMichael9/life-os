# Data model

## Implemented migrations

`0000_foundation.sql`: 16 normalized tables, enums, ownership constraints,
checks, uniqueness and query indexes, generated from `src/schema.ts`.
`0001_updated_at.sql`: PostgreSQL trigger maintains `updated_at` on all 16 tables.
`0002_auth_inbox.sql`: adds persistent authentication rate-limit buckets, idle
expiry/rotation/grace fields, and an owner-scoped Inbox retry UUID constraint.
Inbox `created_at` becomes timestamptz(3) for lossless JavaScript pagination. This
rounds existing sub-millisecond values; back up before production migration. Existing
sessions receive idle expiry at migration time and must sign in again. New columns
are additive; no original table or content is dropped. There are now 17 tables.
`0003_direction_versions.sql`: additive integer `version` columns (default 1) on
Season, Goal, Milestone and Project. Existing fields, parent constraints, dates,
notes, IDs and timestamp triggers are preserved. No tables or content are dropped.
An upgrade test seeds pre-0003 records and verifies preservation and repeat migration.
Migration metadata and snapshots are committed; generation must not alter old SQL
once deployed. Destructive rollback is not automatic.

| Table             | Purpose and relationships                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| app_user          | Unique normalized email, display name, verified timestamp, IANA timezone                               |
| auth_credential   | One password hash per user; no plaintext password                                                      |
| auth_session      | Many per user; hashed current/previous tokens, absolute/idle expiry, rotation/grace and revocation     |
| auth_rate_limit   | Fixed-window bucket key (global or HMAC email), bounded attempts, reset instant and expiry index       |
| category          | User-owned category slug/name, explicit spiritual classification                                       |
| season            | User-owned objective/date range; at most one active per user                                           |
| season_allocation | Season × category, unique pair; integer percentage 0–100                                               |
| vision            | User-owned long-term direction                                                                         |
| goal              | Optional Vision and category; typed measurement values/unit and target date                            |
| milestone         | Required Goal; completion and target date                                                              |
| project           | Optional Milestone **or** direct Goal, never both; optional category                                   |
| task              | Optional Project **or** direct Goal, never both; optional category, scores, due instant and duration   |
| inbox_item        | Owner-scoped retry UUID, bounded text, processed timestamp, millisecond created time and ordered index |
| daily_plan        | Unique user/local-date, timezone snapshot, a single primary outcome                                    |
| daily_big_three   | Up to positions 1–3 per plan; deliberate outcome text, optional Task link                              |
| schedule_block    | Start/end instants, kind, optional Task link                                                           |
| focus_session     | Objective, optional Task/category, active duration/outcome; one open per user                          |

Except auth credentials (whose user PK identifies the row), owned tables have UUID
IDs, owners, created and updated timestamps. Content references include owner in
the FK, so a user's task cannot reference someone else's goal. Relationship deletes
are restricted unless part of explicit owned aggregation (e.g. Big 3 within a plan).
Account deletion cascades all owned records; it must be a deliberate authenticated
operation with export/recovery considerations. No deletion endpoint exists yet.

A direct Goal on a Task/Project is an alternative parent, not a duplicate of the
ancestor. Resolve the inherited Goal through Project→Milestone→Goal when present.
This avoids contradictory hierarchy links. Unlinked work is valid. Project progress
is derived from outcomes/milestones rather than a manually maintained fake percentage.
Schedule blocks carry scheduled instants; Tasks do not duplicate a single scheduled
time because one task can occupy multiple blocks. Dates without times use SQL date;
actual instants use timestamptz. DST boundaries are resolved using user timezone.

Not yet enforced by SQL: allocation totals of 100%, IANA timezone membership,
textual labels beyond the documented bounded fields. Direction versions and
whole-set Season totals are enforced by transactional services, not independent
SQL aggregate checks.
Future domains must use shared validation and transactional services before exposing
writes. The production pool is server-only; a default connection is never created
on module import. Migration credentials are explicit. Reads always need ownership
filters; composite FKs alone are not row-level read authorization.

## Direction invariants and supported fields

- Season retains name, description, primary objective, success criteria, local
  start/end dates and planned/active/completed/archived status. Every service save
  validates a complete 100% allocation set with distinct owned category IDs.
  Replacement and activation occur in one transaction under an owner row lock;
  the existing partial unique index enforces one active Season per owner.
- Goals retain optional owned Vision/category links, description/notes, target date,
  status, priority 1–5 and optional measurable target/current/unit. Measurements must
  be supplied together or all absent; numeric(18,4) values travel as decimal strings.
- Milestones retain a required owned Goal, title, optional target date and server
  completion instant. Reopening clears completion; editing an already completed
  milestone preserves its original instant. Projects inherit a Goal through their
  Milestone when present; explicit milestone reparenting therefore changes that chain.
- Projects retain one optional Goal **or** Milestone, category, description/notes,
  status, start date and target date. Services reject inverted dates and dual parents;
  the existing SQL single-parent check remains. Independent Projects stay valid.
- Integer versions detect conflicting edits for all four records. Create version 0
  becomes stored version 1; updates increment it. Activating another Season also
  increments the previous Season's version when returning it to planned.
- Record removal is not exposed: archive/complete preserves future Task parent links.
  Existing Task `(project_id, user_id)` and `(goal_id, user_id)` FKs are unchanged and
  ready for the next slice. No Task records are created by Direction.

Lists are 50 rows plus a lookahead; cursor is an owned anchor UUID. Timestamp tuple
comparison happens in SQL for stable microsecond pagination. Detail ancestor queries,
lookup categories/Visions and every list/change include the verified owner. Category
creation supports at most 100 categories; lookup metadata exposes up to 100 existing
Visions. Category rename/removal and Vision CRUD are deferred. Read-only snapshots
use repeatable read; writes serialize through an owner row lock and retain DB FKs.

## Authentication and Inbox invariants

Credentials contain an Argon2id PHC string with per-password salt. Session token
columns contain SHA-256 hex digests only; a unique previous-token hash supports a
bounded 30-second grace window. Verification requires unrevoked rows with both
expiry instants strictly in the future. Rotation locks the row; logout marks
`revoked_at`. Grace deadlines never override absolute or idle expiry. Client enum
supports web/desktop, but both currently use the hosted web login flow and record
`web`; it is not an authorization input.

Rate buckets have no owner or content timestamps: key is their primary key,
attempts must be positive, and UPSERT atomically resets or increments up to budget+1.
Cleanup deletes up to 100 expired rows per allowed login attempt. Session retention
cleanup is not scheduled yet; expired/revoked rows cannot authenticate.

Inbox capture stores `(user_id, request_id)` uniquely. Retried bodies must match
exactly after service trimming, otherwise return conflict. Repository listing always
filters authenticated owner and unprocessed rows before applying the validated
cursor; foreign cursor values cannot authorize another user's records. Composite
ownership constraints remain in all original domain relationships. No RLS policy
is claimed; owner predicates provide application read isolation.

## Planned domain relationships (not migrated)

These models define the destination without adding unused production tables. Each
owned FK follows the same composite-ownership convention when implemented.

| Domain               | Planned normalized records and relationships                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Daily reflection     | One DailyReflection per DailyPlan; explicit accomplishment, lesson, gratitude, prayer and tomorrow prompts; separate sensitive text from objective aggregation                                                                 |
| Routines             | Routine definition with recurrence rule/timezone and category; RoutineCompletion unique by routine/local-date/occurrence, separate from Tasks                                                                                  |
| Health               | WeightEntry, SleepEntry and StepEntry carry typed units and measured date/instant; TrainingSession has configurable TrainingType; optional daily energy/nutrition notes; no generic HealthEntry EAV duplication                |
| Skills               | Skill hierarchy with nullable parent Skill; SkillStage definitions and evidence links; progress derived from ProblemAttempt/ProblemReview, not arbitrary percentages                                                           |
| Problems             | PracticeProblem belongs to Skill/topic; many ProblemAttempts record time, independence, hints, confidence and summary; ProblemReview stores due/completed dates and scheduling version                                         |
| Professional network | ProfessionalContact self-reference for introduced-by; many ContactInteractions; tier and next follow-up; no friends/family CRM                                                                                                 |
| Opportunities        | Opportunity with impact/probability/deadline; OpportunityContact explicit join; interaction links where useful, no job application pipeline                                                                                    |
| Business             | Business has many BusinessMetric definitions with unit/aggregation; BusinessMetricEntry unique metric/period; Experiment belongs to Business, has hypothesis and actual result; optional Project link                          |
| Money                | FinancialAccount with type/currency; FinancialTransaction with signed integer minor units or fixed numeric by currency, posted date, account and source; transfers linked explicitly so income/spending are not double counted |
| Import               | FinancialImportBatch owns imported rows and format mapping; optional source/external ID; indexed fingerprint yields likely duplicates for review, not unconditional deduplication of equal legitimate purchases                |
| Assets/liabilities   | Account classifications produce balances; noncash asset valuations and liabilities retain historical valuation records; NetWorthSnapshot unique owner/date/base currency with component evidence                               |
| Financial goals      | FinancialGoal stores monetary target, currency and target date; optional link to general Goal; milestones can be defaults or custom                                                                                            |
| Scenarios            | FinancialScenario stores versioned validated assumptions, currency, simulation version and explicit projection disclaimer; no projection overwrites actual transaction history                                                 |
| Scripture            | Bundled immutable Scripture catalog keyed by translation/book/chapter/verse; ScriptureFavorite unique user/catalog ID; ScriptureNote references catalog ID and optional quoted text; BibleProgress bookmarks user/book/chapter |
| Daily content        | Deterministic versioned date→Scripture and date→original Quote mapping; explicit DailyScripture/DailyQuote assignment rows only if user-specific overrides or scheduled corpus changes require them                            |
| Prayer               | Prayer with status/answered timestamp; separate dated PrayerJournal entries and optional Prayer notes/history; no execution-score fields                                                                                       |
| Gratitude/journal    | GratitudeEntry and JournalEntry with dated text and explicit privacy boundaries; tag joins if needed rather than a generic document system                                                                                     |
| Reviews              | One Review table with period enum (weekly/monthly/quarterly/yearly), period start/end, unique owner/type/start, snapshot version and narrative; avoids four duplicate tables; faith narrative excluded from execution scoring  |
| Decisions            | Decision owns context/options/choice, assumptions and expected outcome; DecisionReview records actual outcomes/lessons and due date; preserve reasoning from decision time                                                     |
| Vault                | VaultItem has kind (Idea/Someday/Not Now/Research/etc.), title/body and optional category; conversion atomically creates explicit Task/Project/Goal/Experiment and preserves origin/audit link                                 |
| Insights             | GeneratedInsight stores rule/version/evidence window and dismissal if persistence is useful; inputs aggregate domain data, not unrestricted access to private text                                                             |
| Preferences          | UserPreference for product defaults; NotificationPreference unique user/category/channel; profile timezone remains canonical on app_user                                                                                       |

Search starts as owner-scoped indexed PostgreSQL search over explicitly opted-in
fields. Never build an unscoped global content index. Sensitive prayer/journal search
requires the same authorization and privacy lock as reading the underlying entry.

Financial provider adapters normalize Manual/CSV/future provider output into the
same records. Fixed-precision decimal arithmetic, currency boundaries, transfer
handling, duplicate review and import rollback get tests before financial UI.
Business metrics retain definitions and units; no hard-coded startup assumptions.

## Integrity and test strategy

PGlite runs the actual SQL migration chain in tests, including timestamp triggers.
Tests exercise cross-owner references, one active Season, Big 3 positions, one daily
plan/date, invalid values and one open focus session. PGlite is PostgreSQL-compatible
WASM, **not proof of Neon pooling/TLS/role behavior**. Before production, apply the
chain on an isolated hosted PostgreSQL branch and test with the restricted app role.
