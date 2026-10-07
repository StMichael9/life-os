# LIFE OS
## Master Product, Architecture, Engineering & Build Specification

You are the lead product architect and senior software engineer responsible for designing and building **Life OS**, a private personal operating system for deliberate execution, career development, business building, wealth creation, physical performance, faith, reflection and long-term decision-making.

This is not a generic productivity application.

This is not simply a task manager.

This is not a habit-tracking game.

This application exists to answer:

> **What should I be doing right now that has the highest expected positive impact on my life?**

The product should help the user allocate:

- time
- attention
- energy
- money
- professional relationships
- learning
- business effort
- physical performance

toward the objectives that matter most.

It must also provide space for:

- God
- prayer
- Scripture
- gratitude
- reflection
- character
- private journaling

Faith must not be reduced to a productivity score.

---

# 1. CORE PRODUCT PHILOSOPHY

Life OS should help its user:

1. Do what matters.
2. Avoid productive procrastination.
3. Protect focus.
4. Understand where time actually goes.
5. Connect daily actions to long-term objectives.
6. Develop valuable skills.
7. Build career capital.
8. Build professional relationships.
9. Create businesses.
10. Increase income.
11. Accumulate wealth.
12. Maintain physical performance.
13. Maintain a relationship with God.
14. Reflect honestly.
15. Improve judgment.
16. Avoid chasing every attractive new idea.
17. Make better decisions about attention.

Central principle:

> **Life OS does not help the user do more. It helps the user do what matters.**

Another core principle:

> **Everything cannot be Priority #1.**

The system should actively encourage tradeoffs.

---

# 2. COST REQUIREMENT

Life OS is initially a personal application.

The production application should be capable of operating at approximately **$0 recurring monthly software cost** within reasonable free-tier usage for one personal user.

Do not introduce paid dependencies unnecessarily.

Specifically:

- No required paid LLM API.
- No required OpenAI API.
- No required Anthropic API.
- No required paid productivity API.
- No Plaid integration initially.
- No paid Bible API requirement.
- No paid quote API requirement.

Prefer:

- open-source libraries
- local/static datasets
- free hosting tiers
- free PostgreSQL tiers
- deterministic algorithms
- rule-based analytics

If a chosen provider's free tier is insufficient or changes materially, architecture should permit migration.

Do not compromise security merely to achieve zero cost.

---

# 3. NO REQUIRED LLM

The core application must function completely without an LLM.

Do NOT implement an AI chatbot as a core dependency.

Instead build a deterministic **Insights / Coach Engine** based on:

- rules
- analytics
- trends
- goal alignment
- time allocation
- thresholds
- historical comparisons
- priority calculations

Examples:

"Algorithms are allocated 35% of your active Season but received only 14% of your deep-work time this week."

"You planned 18 tasks but completed 7."

"A Tier 1 opportunity has a follow-up due tomorrow."

"Your average planned workload has exceeded your completed workload for three consecutive weeks."

"Your 90-minute focus sessions have produced more completed objectives than shorter sessions."

"Spending increased materially this month while income remained unchanged."

These insights should use templates and real application data.

Future architecture may support an OPTIONAL intelligence provider interface.

Examples:

IntelligenceProvider:
- RuleBasedProvider
- LocalModelProvider
- OpenAIProvider
- OtherProvider

However:

**Only RuleBasedProvider should be required.**

The entire product must remain fully useful when no external AI provider exists.

---

# 4. PLATFORM

Life OS must exist as ONE PRODUCT accessible through:

## Desktop

Installable Electron application for Windows.

## Web

Hosted responsive web application.

Both must use the same:

- account
- backend
- database
- application logic
- core UI system

Changes made on desktop should appear on web and vice versa.

Do not create two independent products.

---

# 5. PRODUCTION EXPERIENCE

Normal desktop usage must be:

Open Life OS from Windows
→ authenticate if needed
→ use application.

The user must NOT need to:

- open VS Code
- start Node manually
- run npm commands
- start a development server
- run a database
- launch a backend manually
- open a terminal

Normal web usage:

Open hosted URL
→ authenticate
→ use Life OS.

---

# 6. TECHNICAL ARCHITECTURE

This is a greenfield application.

Prefer an all-TypeScript architecture unless investigation reveals a compelling technical reason otherwise.

Recommended architecture:

## Monorepo

Use pnpm workspaces and/or Turborepo if appropriate.

Conceptually:

apps/
  web/
  desktop/

packages/
  app/
  ui/
  database/
  api/
  validation/
  insights/
  shared/
  config/

Exact structure may change if a cleaner architecture is justified.

Document meaningful deviations.

---

# 7. WEB

Preferred:

- Next.js
- TypeScript
- React
- App Router
- Tailwind CSS

Use server functionality appropriately.

Avoid unnecessarily complicated client-side global state.

Use an established query/cache solution where useful.

---

# 8. DESKTOP

Use:

- Electron
- TypeScript
- shared React application
- electron-builder or another mature packaging solution

Use appropriate security practices:

- contextIsolation enabled
- nodeIntegration disabled in renderer
- restrictive IPC
- secure navigation rules
- Content Security Policy
- validate IPC inputs
- sandbox where appropriate
- never expose unrestricted filesystem access to renderer

The renderer should not possess arbitrary Node privileges.

---

# 9. DATABASE

Use hosted PostgreSQL.

Prefer Neon PostgreSQL unless another provider provides a clear advantage.

Use a mature TypeScript ORM/query system such as:

- Drizzle ORM

or another well-supported alternative if justified.

Requirements:

- migrations
- constraints
- indexes
- foreign keys
- ownership checks
- timestamps
- transaction support where appropriate
- typed database interactions

Never connect browser or Electron renderer directly to PostgreSQL.

All privileged data access passes through trusted server code.

---

# 10. VALIDATION

Use shared validation schemas where appropriate.

Zod is preferred.

Avoid allowing frontend and backend validation rules to drift unnecessarily.

---

# 11. DEPLOYMENT

Preferred initial production architecture:

Web/API:
- Vercel or comparable zero-cost hosting suitable for the architecture

Database:
- Neon PostgreSQL

Electron:
- packaged Windows application

Do not hard-code the product so it cannot migrate hosting providers later.

Separate:

- development
- test
- production

configuration.

Never commit secrets.

---

# 12. AUTHENTICATION

Support secure email/password authentication.

Design authentication separately for browser and Electron where their security requirements differ.

## Web

Prefer:

- secure HttpOnly cookies
- Secure in production
- appropriate SameSite configuration
- CSRF-aware architecture

## Desktop

Never store long-lived sensitive tokens in renderer localStorage.

Use secure OS-level credential/token storage through the Electron main process where needed.

Renderer should receive only what it requires.

Support:

- login
- persistent session
- logout
- refresh/session rotation
- server-side authorization
- user ownership verification

Architecture should support multiple users even though initial usage is primarily one personal account.

---

# 13. DESIGN DIRECTION

Life OS should visually communicate:

- discipline
- control
- calm
- ambition
- maturity
- clarity
- confidence
- premium quality

It should NOT feel:

- childish
- overly gamified
- neon
- cluttered
- like a generic admin template
- like Jira
- like an enterprise CRM
- like a social network

Preferred visual direction:

Dark-first.

Use:

- near-black / charcoal backgrounds
- elevated dark surfaces
- warm off-white typography
- restrained accents
- subtle borders
- high-quality typography
- generous spacing
- strong hierarchy
- tasteful micro-interactions
- subtle Framer Motion when useful

Conceptually combine qualities associated with:

- Linear
- executive dashboards
- premium finance applications
- focused journaling applications

Do not copy another product.

Build an original coherent system.

---

# 14. RESPONSIVE EXPERIENCE

Must work extremely well on:

- large desktop
- laptop
- tablet
- mobile Safari
- modern mobile browsers

Mobile must be intentionally designed.

Do not merely squeeze desktop cards into a narrow column.

---

# 15. PRIMARY NAVIGATION

Desktop navigation should conceptually include:

## COMMAND
- Today
- Schedule
- Focus
- Inbox

## DIRECTION
- Goals
- Projects
- Seasons

## CAREER
- Skills
- Problems
- Network
- Opportunities

## BUILD
- Business
- Experiments

## WEALTH
- Money
- Net Worth
- Scenarios

## PERFORMANCE
- Health & Routines

## FAITH
- God & Reflection

## REFLECT
- Reviews
- Decisions
- Vault

Bottom utility area:

- Search / Command Palette
- Settings
- Account

Navigation may be refined for usability.

Do not expose every sub-feature as a primary navigation item.

---

# 16. TODAY / COMMAND CENTER

This is the most important screen in Life OS.

Opening Life OS should immediately communicate:

1. Where am I going?
2. What matters today?
3. What should I do next?
4. Am I living according to my priorities?

The dashboard should include the following.

---

# 17. DATE

Example:

Tuesday, October 6

Keep it visually clear but understated.

---

# 18. DAILY SCRIPTURE

Show one Bible verse per calendar day.

Use KJV content initially to avoid requiring a paid/licensed Scripture API.

Requirements:

- verse text
- book
- chapter
- verse
- favorite/save
- open in God & Reflection
- optional reflection action

The verse must remain stable for that entire local calendar day.

Refreshing the page must not change it.

Do not require internet access to retrieve daily Scripture beyond normal app synchronization.

Use an internally stored or bundled KJV dataset/curated verse library.

Architecture should permit additional translations later.

---

# 19. MOTIVATIONAL QUOTE

Dashboard should contain a separate:

**Thought for Today**

Themes:

- discipline
- courage
- leadership
- persistence
- restraint
- responsibility
- long-term thinking
- ambition
- resilience
- excellence
- business
- character

Avoid fake/misattributed Internet quotes.

Prefer:

- verified historical quotations where legally appropriate
- public-domain sources
- original Life OS aphorisms

Daily quote remains stable throughout the calendar day.

---

# 20. CURRENT SEASON

Show:

- active Season
- primary objective
- date range
- progress
- current allocation strategy

Example:

BREAK INTO TECH

Primary objective:
Become technically interview-ready and secure a strong software opportunity.

---

# 21. THE ONE THING

Prominent component answering:

> If I accomplish only one thing today, what would move my life forward most?

Exactly one primary outcome.

Do not turn this into another task list.

---

# 22. BIG 3

Maximum three major daily outcomes.

Not simply the first three tasks.

The user deliberately selects the outcomes that define a successful day.

---

# 23. DAILY SCHEDULE

Include an actual timeline/time-blocking interface.

Support:

- tasks
- focus blocks
- routines
- meetings
- training
- custom events

Eventually architecture should support Google Calendar integration.

Calendar integration is not required for the core initial version.

Internal scheduling must work independently.

---

# 24. RECOMMENDED NEXT ACTION

Use the Priority Engine to recommend the highest-value available next action.

Example:

Recommended:

Algorithms — 90 minutes

Reasons:

- high active-Season alignment
- important career opportunity
- approaching deadline
- high expected impact

Recommendations must be explainable.

---

# 25. OPPORTUNITY ATTENTION

Show professional opportunities needing attention:

- follow-up due
- commitment approaching
- meeting upcoming
- important contact becoming stale
- opportunity deadline

Do not implement a dedicated job-application pipeline.

---

# 26. DAILY SNAPSHOT

Compact metrics only.

Possible values:

- deep work
- Big 3 completion
- meaningful tasks completed
- training status
- daily spending
- current execution score

Avoid dashboard clutter.

---

# 27. START DAY

Provide a short morning flow.

Ask:

1. What am I grateful for?
2. What must happen today for today to be successful?
3. What is occupying my mind?
4. Confirm One Thing.
5. Confirm Big 3.

Allow skipping.

Target completion time:

1–3 minutes.

---

# 28. CLOSE DAY

Provide an evening closure flow.

Ask:

- What did I accomplish?
- Where did I waste time?
- What did I learn?
- What am I grateful for?
- What do I want to pray about?
- What should change tomorrow?

Automatically summarize objective data:

- focus time
- Big 3 results
- completed tasks
- routines
- training
- spending
- opportunity actions

Do not automatically judge spiritual behavior.

---

# 29. LIFE HIERARCHY

Support:

Vision
→ Goal
→ Milestone
→ Project
→ Task

Every meaningful task may optionally show:

**Why am I doing this?**

Example:

Solve Hash Map Problem
→ Algorithms mastery
→ Interview preparation
→ Software engineering career
→ Increased earning power
→ Wealth objective

Users should be able to navigate the hierarchy.

---

# 30. GOALS

Fields:

- title
- description
- category
- target date
- status
- priority
- measurable target
- current value
- associated milestones
- parent vision
- notes

Possible categories:

- career
- business
- wealth
- health
- faith
- education
- personal

Do not force categories where unnecessary.

---

# 31. SEASONS

Life priorities change.

Create Seasons.

Fields:

- name
- description
- primary objective
- start date
- target end
- status
- success criteria
- category allocations

Normally one Season is active.

Example:

Break Into Tech

Algorithms — 35%
Education — 30%
Networking — 20%
Career execution — 10%
Startup — 5%

Priority calculations should incorporate Season allocations.

---

# 32. PROJECTS

Project fields:

- title
- description
- linked goal
- category
- status
- priority
- start date
- target date
- progress
- milestones
- tasks
- notes

Keep project management substantially simpler than Jira.

---

# 33. TASKS

Task fields should support:

- title
- description
- project
- goal
- category
- priority
- status
- due date
- scheduled time
- estimate
- actual duration
- impact
- urgency
- opportunity value
- goal alignment
- season alignment
- energy requirement
- notes

Statuses:

- Inbox
- Planned
- In Progress
- Completed
- Deferred
- Cancelled

Quick capture must be exceptionally fast.

---

# 34. PRIORITY ENGINE

Build a deterministic, transparent priority system.

Inputs may include:

- Impact
- Urgency
- Opportunity value
- Goal alignment
- Season alignment
- Deadline proximity
- Time cost
- energy/context suitability

Do not create fake mathematical certainty.

Prefer an interpretable score plus explanation.

Example:

Algorithms Practice
Priority: Very High

Reasons:
- directly supports active Season
- high-impact career opportunity
- time-sensitive
- manageable 90-minute commitment

Document the initial algorithm.

Allow future iteration without schema redesign.

---

# 35. INBOX / UNIVERSAL CAPTURE

The user must be able to instantly capture something without deciding what it is.

Capture examples:

- task
- idea
- research item
- reminder
- prayer
- thought
- person to follow up with
- business idea

Everything initially becomes an Inbox item.

Later it can become:

- Task
- Vault Item
- Prayer
- Project
- Experiment
- Opportunity
- Note

Capture first.

Organize later.

---

# 36. GLOBAL COMMAND PALETTE

Use a keyboard shortcut such as:

Ctrl/Cmd + K

Support:

- global search
- navigation
- create task
- start focus
- capture Inbox item
- search contact
- search goal
- open project
- open prayer
- open journal entry

Desktop interaction should feel extremely fast.

---

# 37. FOCUS / DEEP WORK

Provide focused execution mode.

User chooses:

- Task
- Project
- category
- custom activity

Common categories may include:

- Algorithms
- Education
- Business
- Networking
- Study
- Admin

Timer presets:

- 25
- 50
- 90
- Custom

Focus mode should minimize distractions.

Show:

- objective
- timer
- linked goal
- pause
- finish
- Later capture

Later capture lets the user record distractions without leaving focus mode.

At completion ask:

"What did you accomplish?"

Store:

- planned duration
- actual duration
- linked work
- notes
- outcome

---

# 38. ROUTINES & HABITS

Habits are not tasks.

Support recurring routines.

Examples:

- morning planning
- algorithm practice
- walking
- training
- Scripture
- evening reflection
- weekly review

Habits may track:

- completion
- frequency
- streak if useful
- consistency
- notes

Avoid excessive gamification.

Faith practices must NOT contribute to productivity score.

---

# 39. HEALTH & PERFORMANCE

This is a lightweight performance module.

Do not build MyFitnessPal.

Track:

- body weight
- weight trend
- steps
- sleep duration
- training sessions
- training type
- optional energy score
- optional performance/recovery notes
- lightweight nutrition notes

Training types should be configurable.

Charts should focus on meaningful trends.

Examples:

- weight trend
- weekly training frequency
- sleep trend
- steps trend

Health exists to support life performance, not become another obsession.

---

# 40. CAREER SKILLS

Create skill tracking.

Example skill tree:

Algorithms
- Arrays
- Strings
- Hash Tables
- Binary Search
- Sorting
- Linked Lists
- Trees
- Graphs
- Dynamic Programming

Skill progression:

Learn
→ Explain
→ Implement
→ Solve
→ Review
→ Interview Ready

Progress should be evidence-based rather than arbitrary percentages where possible.

---

# 41. PRACTICE PROBLEMS

Track technical problems.

Fields:

- title
- source
- URL
- topic
- difficulty
- attempts
- solved
- solved independently
- hints used
- time
- confidence
- notes
- solution summary
- next review

Create spaced-review scheduling.

Do not optimize merely for number of problems solved.

Track independent ability and retention.

---

# 42. PROFESSIONAL NETWORK

Create a professional CRM only.

Do NOT create a friends/family relationship tracker.

Contact fields:

- name
- company
- role
- contact information
- location
- tier
- relationship strength
- how met
- introduced by
- last interaction
- next action
- follow-up date
- notes
- linked opportunities
- commitments
- tags

Tiers:

Tier 1:
Could meaningfully affect career/business trajectory.

Tier 2:
Valuable professional relationship.

Tier 3:
General professional network.

Surface relationships needing attention.

---

# 43. OPPORTUNITIES

Track professional opportunities.

Examples:

- interview
- internship
- employment possibility
- mentorship
- introduction
- business partnership
- customer
- investment
- speaking/networking opportunity

Do NOT build a separate detailed job-application pipeline.

Fields:

- name
- linked contacts
- type
- stage
- potential impact
- estimated probability
- time sensitivity
- relationship strength
- next action
- deadline
- notes

Opportunity scoring should remain explainable.

---

# 44. BUSINESS OS

Support one or more businesses/projects.

Track configurable metrics such as:

- users
- active users
- signups
- retention
- revenue
- expenses
- conversion
- growth

Do not hard-code assumptions for one specific startup.

---

# 45. EXPERIMENTS

Business growth should encourage experiments.

Fields:

- title
- hypothesis
- channel
- audience
- expected result
- start
- end
- cost
- effort
- actual result
- conclusion
- next action

Example:

Hypothesis:
10% of 50 targeted readers will sign up.

Result:
3 signups.

Conclusion:
Channel underperformed.

This encourages evidence over endless feature building.

---

# 46. MONEY

All financial data is initially entered manually.

Do NOT integrate bank accounts initially.

Track:

## Income
- employment
- contract
- business
- other

## Accounts
- checking
- savings
- cash
- investments
- custom

## Assets

## Liabilities

## Transactions

## Expenses

## Recurring expenses

Display:

- income
- spending
- savings
- savings rate
- liquid cash
- assets
- liabilities
- net worth

---

# 47. CSV FINANCIAL IMPORT

Support future import from bank CSV files.

Build an importer architecture that can:

- preview rows
- map columns
- validate data
- detect likely duplicates
- import transactions safely
- undo or identify import batches

Do not require this in earliest MVP if it would delay core execution features.

---

# 48. FUTURE PLAID / FINANCE PROVIDER ARCHITECTURE

Do not implement Plaid now.

However, avoid coupling the financial domain exclusively to manual entry.

Design an abstraction that could eventually support:

FinancialDataProvider:
- Manual
- CSV
- Plaid
- future providers

The database should remain the canonical normalized financial model.

External provider-specific IDs should be optional.

---

# 49. NET WORTH

Calculate and store historical net-worth snapshots.

Default milestone options:

$10K
$25K
$50K
$100K
$250K
$500K
$1M

Allow custom milestones.

Show trajectory without fake hype.

---

# 50. WEALTH SCENARIOS

Create a scenario calculator.

Inputs may include:

- current assets
- liabilities
- salary
- monthly savings
- annual raise
- investment contributions
- expected investment return
- business income
- business growth

Estimate timelines to milestones.

Clearly state:

**Projection, not guarantee.**

Allow scenarios to be saved and compared.

---

# 51. GOD & REFLECTION

Faith must remain spiritually meaningful rather than gamified.

NEVER assign productivity points for:

- prayer
- Bible reading
- gratitude
- Scripture study
- worship

The faith section should be visually quieter and more reflective than performance dashboards.

---

# 52. DAILY SCRIPTURE

Provide:

- verse
- reference
- save/favorite
- note/reflection

Use KJV initially.

---

# 53. PRAYER JOURNAL

Free-form dated prayer entries.

Support privacy-sensitive design.

---

# 54. PRAYER REQUESTS

Fields:

- request
- created date
- status
- notes
- answered/reflection date

Statuses:

- Praying
- Answered
- Closed

---

# 55. ANSWERED PRAYERS

Provide a historical view of answered prayers.

Allow looking back across months and years.

---

# 56. GRATITUDE

Simple dated gratitude entries.

Avoid unnecessary gamification.

---

# 57. SCRIPTURE NOTES

Store:

- reference
- verse if desired
- notes
- tags
- date

Allow search.

---

# 58. BIBLE READING

Allow simple Bible-reading progress.

Example:

Current book:
Matthew

Current chapter:
8

Support:

- book
- chapter
- reading plan if added later
- bookmarks
- notes

Do NOT score Bible reading as productivity.

---

# 59. PRIVATE JOURNAL

Free-form private dated entries.

Provide:

- search
- date navigation
- tags if helpful
- autosave or strong save behavior

Treat journal data as highly sensitive.

---

# 60. REFLECTION PROMPTS

Prompts may include:

- What am I grateful to God for?
- What am I worried about that I need to surrender?
- Did I treat people well today?
- What did I do today that I should not repeat?
- Where did I show discipline?
- Where did fear, anger, pride or laziness influence me?
- Am I pursuing success in a way I respect?
- What do I need guidance about?
- What do I want to pray about?

Prompts should be configurable and not mandatory.

---

# 61. REVIEWS

Support:

- Daily
- Weekly
- Monthly
- Quarterly
- Yearly

Reviews should combine:

objective data

with:

subjective reflection.

---

# 62. WEEKLY REVIEW

Automatically summarize:

- Big 3 completion
- deep-work hours
- time allocation
- projects advanced
- skills
- problems
- networking
- opportunities
- business
- income/spending
- training
- health trends
- important decisions

Ask:

- Biggest wins?
- Biggest failures?
- Where did my time go?
- Did actions reflect stated priorities?
- What distracted me?
- What should I stop?
- What should I continue?
- What matters most next week?

Compare actual work allocation to active Season.

---

# 63. MONTHLY REVIEW

Include:

- goal movement
- career movement
- finances
- net-worth change
- business movement
- health/performance
- time allocation
- important decisions
- recurring distractions
- major lessons

---

# 64. QUARTERLY REVIEW

Focus more strategically.

Ask:

- Is the active strategy working?
- Which goals still matter?
- What should be abandoned?
- What generated disproportionate results?
- Where was time wasted?
- Is a new Season needed?

---

# 65. YEARLY REVIEW

Provide a high-level reflection across:

- career
- wealth
- business
- health
- faith
- execution
- decisions
- major life changes

Avoid reducing a year to a single numeric score.

---

# 66. EXECUTION SCORE

A daily/weekly execution score may exist.

Reward meaningful output.

Potential inputs:

- Big 3 results
- priority-weighted completed work
- deep work
- important opportunity actions
- training
- goal advancement

Do NOT reward:

- creating more tasks
- meaningless checkbox activity
- prayer
- Bible reading
- gratitude

The score is about execution, not personal worth.

---

# 67. DECISION JOURNAL

Track important decisions.

Fields:

- decision
- date
- context
- options
- choice
- reasoning
- assumptions
- risks
- expected outcome
- confidence
- review date
- actual outcome
- lessons

Allow reviewing decision quality separately from outcome luck.

---

# 68. VAULT

Support:

- Idea
- Someday
- Not Now
- Research
- Career
- Business
- Personal

Items can later become:

- Task
- Project
- Experiment
- Goal

"Not Now" is important.

Life OS should protect the user against abandoning current priorities whenever another interesting idea appears.

---

# 69. RULE-BASED INSIGHTS ENGINE

Create an independent domain package for analytical insights.

Insights should be generated from stored data.

Possible categories:

## Alignment
Actual time vs Season allocation.

## Capacity
Planned workload vs historical completion.

## Focus
Deep-work patterns.

## Opportunity
Professional follow-ups and deadlines.

## Goal Drift
Important goals receiving no activity.

## Business
Metric changes and experiment performance.

## Finance
Income, spending, savings and net-worth movement.

## Health
Sleep, training, activity or weight trends.

## Consistency
Recurring routines.

Every insight should provide:

- title
- concise explanation
- evidence
- severity/importance where useful
- recommended action where appropriate

Recommendations should be deterministic and explainable.

Do not pretend statistical significance exists where it does not.

---

# 70. NOTIFICATIONS

Support configurable notifications.

Possible categories:

- planned focus session
- important deadline
- networking follow-up
- morning planning
- evening reflection
- review due
- routine reminder

Notifications should be restrained.

Users must be able to disable categories.

Desktop should eventually use native Electron notifications.

---

# 71. DESKTOP FEATURES

Electron should ultimately support:

- installable Windows application
- Start-menu entry
- application icon
- persistent session
- minimize to tray
- optional start with Windows
- native notifications
- global quick-capture shortcut if technically appropriate
- command palette
- secure token storage
- application lock
- external browser-link handling
- automatic updating later

Do not implement all native features before the core product works.

---

# 72. APPLICATION PRIVACY LOCK

Support optional lock after inactivity.

The lock protects access to:

- journal
- prayers
- finances
- private reflections
- overall application

Architecture should permit Windows Hello integration later.

Do not make biometric support a blocker for initial release.

---

# 73. SEARCH

Global search should eventually cover:

- tasks
- goals
- projects
- contacts
- opportunities
- practice problems
- Scripture notes
- prayers
- journal
- decisions
- Vault
- business experiments

Search architecture should be planned early even if sophisticated search is added later.

---

# 74. EXPORT

Users must retain control of their data.

Support export where appropriate.

Formats may include:

- JSON
- CSV

Possible exports:

- finances
- tasks
- focus sessions
- goals
- contacts
- health data
- journal
- prayers
- reviews

Do not make the user's important life data impossible to leave with.

---

# 75. BACKUPS & DATA INTEGRITY

Ensure sensible database backup strategy.

Document recovery expectations.

Use database constraints and migrations carefully.

Avoid destructive schema changes without appropriate migration paths.

---

# 76. ONLINE-FIRST

Initial application is ONLINE-FIRST.

Do NOT build complex offline synchronization initially.

If network connectivity is unavailable:

- show clear state
- preserve unsaved text where practical
- avoid silent data loss

True offline-first synchronization may be considered later.

Do not architect in a way that makes it impossible.

---

# 77. CALENDAR INTEGRATION

Internal scheduling works without external calendars.

Architecture should allow Google Calendar integration later.

Do not make Google integration a prerequisite.

---

# 78. INTENTIONAL EXCLUSIONS

Do NOT turn Life OS into:

- email client
- social media client
- messaging platform
- full accounting suite
- calorie/macronutrient tracking system
- team collaboration suite
- document editor
- family/friends CRM
- job application pipeline
- social/community network

Protect product focus.

---

# 79. DATA MODEL

Design normalized models for at least the concepts below.

Do not create database tables blindly from this list.

First determine proper relationships and normalization.

Likely domains include:

User

Session/AuthCredential

Season
SeasonAllocation

Vision
Goal
Milestone

Project

Task

InboxItem

DailyPlan
DailyBigThree
DailyReflection

ScheduleBlock

FocusSession

Routine
RoutineCompletion

HealthEntry
WeightEntry
SleepEntry
StepEntry
TrainingSession

Skill
SkillStage
PracticeProblem
ProblemAttempt
ProblemReview

ProfessionalContact
ContactInteraction

Opportunity
OpportunityContact

Business
BusinessMetric
BusinessMetricEntry
Experiment

FinancialAccount
FinancialTransaction
FinancialImportBatch
NetWorthSnapshot
FinancialGoal
FinancialScenario

DailyScripture
ScriptureFavorite
ScriptureNote
BibleProgress

Prayer
GratitudeEntry
JournalEntry

WeeklyReview
MonthlyReview
QuarterlyReview
YearlyReview

Decision

VaultItem

Quote
DailyQuote

GeneratedInsight

NotificationPreference

UserPreference

Appropriate tables should have:

- IDs
- ownership
- created timestamp
- updated timestamp
- appropriate indexes
- appropriate uniqueness constraints

Avoid unnecessary polymorphic complexity if explicit relations are cleaner.

---

# 80. DASHBOARD AGGREGATION

Do not force the client to issue dozens of requests to construct Today.

Create an efficient dashboard query/API layer capable of returning:

- local date
- Scripture
- quote
- active Season
- One Thing
- Big 3
- schedule
- recommended next action
- current focus metrics
- important opportunities
- selected financial snapshot
- selected health snapshot
- current insights

Avoid over-fetching.

---

# 81. TIMEZONE

Time-sensitive features must use the user's configured timezone.

Store timestamps appropriately.

Daily Scripture, Daily Quote, daily planning and review boundaries should respect local calendar date.

Do not calculate "today" solely using server UTC.

---

# 82. ACCESSIBILITY

Include:

- keyboard navigation
- visible focus states
- semantic HTML
- sufficient contrast
- labels
- accessible forms
- reduced-motion consideration

Do not sacrifice accessibility for visual aesthetics.

---

# 83. EMPTY STATES

Empty states should guide behavior.

Examples:

No active Season:

"You haven't chosen what deserves disproportionate focus right now."

No Big 3:

"Choose the three outcomes that would make today successful."

No professional contacts:

"Add the people and opportunities capable of meaningfully affecting your professional trajectory."

Avoid generic:

"No data available."

---

# 84. PERFORMANCE

The app should feel fast.

Avoid:

- enormous client bundles
- unnecessary re-renders
- loading entire history for simple dashboards
- excessive animation
- N+1 database queries
- excessive server round trips

Paginate/archive large historical collections.

---

# 85. TESTING

Establish meaningful automated testing.

Prioritize tests for:

- authentication
- authorization
- ownership boundaries
- priority engine
- insights engine
- financial calculations
- net-worth calculations
- review aggregation
- daily date/timezone behavior
- CSV import duplicate protection
- critical database services

Use appropriate unit/integration/end-to-end testing.

Do not chase meaningless code-coverage percentages.

---

# 86. DOCUMENTATION

Maintain:

docs/product-spec.md
docs/architecture.md
docs/data-model.md
docs/design-system.md
docs/deployment.md
docs/progress.md

`progress.md` is especially important.

It must contain:

- current phase
- completed work
- incomplete work
- architectural decisions
- known issues
- tests run
- next recommended task

Future Codex sessions should read these documents before changing architecture.

---

# 87. DEVELOPMENT RULE

THIS SPECIFICATION DESCRIBES THE DESTINATION.

DO NOT TRY TO IMPLEMENT EVERYTHING IN ONE RUN.

Build coherent vertical slices.

Never trade architectural quality for checking off more features.

---

# 88. PHASE 0 — ARCHITECTURE & FOUNDATION

Complete first.

Tasks:

1. Inspect repository.
2. Establish monorepo.
3. Create durable product documentation.
4. Design domain boundaries.
5. Design database schema.
6. Create architecture document.
7. Establish shared UI/design tokens.
8. Configure TypeScript strictness.
9. Configure linting/formatting.
10. Configure testing.
11. Configure migrations.
12. Configure environments.
13. Create basic Next.js web application.
14. Create basic Electron shell.
15. Verify shared packages work in both environments.
16. Establish authentication architecture.
17. Establish deployment strategy.
18. Establish CI where useful.
19. Commit coherent foundation.

Do not rush past this phase.

---

# 89. PHASE 1 — DAILY EXECUTION CORE

Build a usable daily Life OS.

Include:

- authentication
- application shell
- responsive navigation
- Today
- Daily Scripture
- Daily Quote
- Seasons
- Goals
- Projects
- Tasks
- Inbox
- One Thing
- Big 3
- internal schedule/time blocking
- Start Day
- Close Day
- Focus Sessions
- routines
- basic priority engine
- basic rule-based Insights
- command palette
- Vault capture

At the end of Phase 1, the application should already be genuinely useful every day.

---

# 90. PHASE 2 — CAREER + PERFORMANCE

Build:

- Skills
- Algorithm skill system
- Practice Problems
- Attempts
- Spaced Reviews
- Professional Network CRM
- Interactions
- Opportunities
- Opportunity scoring
- Health & Performance
- training
- weight
- steps
- sleep
- related insights

---

# 91. PHASE 3 — WEALTH + BUSINESS

Build:

- financial accounts
- transactions
- income
- spending
- savings
- assets
- liabilities
- net worth
- net-worth history
- milestones
- financial scenarios
- CSV import
- future provider boundary
- Business OS
- metrics
- Experiments

Do NOT implement Plaid yet.

---

# 92. PHASE 4 — FAITH + REFLECTION

Build:

- God & Reflection
- Prayer Journal
- Prayer Requests
- Answered Prayers
- Gratitude
- Scripture Notes
- Bible progress
- Journal
- Weekly Review
- Monthly Review
- Quarterly Review
- Yearly Review
- Decision Journal

Take privacy seriously.

---

# 93. PHASE 5 — DESKTOP POLISH & SYSTEM MATURITY

Build/refine:

- Windows packaging
- installer
- icon
- tray
- startup preference
- native notifications
- secure credential storage
- application lock
- global quick capture
- update mechanism
- export
- backups
- performance
- accessibility
- deployment hardening

Electron-specific behavior must eventually be tested on an actual Windows environment.

---

# 94. PHASE 6 — OPTIONAL INTEGRATIONS

Only after the core application is mature.

Possible future integrations:

- Google Calendar
- Plaid or equivalent
- local LLM
- optional external LLM
- additional Bible translations

Do not implement these prematurely.

---

# 95. FIRST CODEX RUN — IMPORTANT

For the FIRST RUN using this specification:

**Act primarily as a senior architect.**

Do not attempt to complete the entire application.

Your objective is to leave behind an exceptionally strong foundation that future coding sessions can safely extend.

Perform:

1. Read this entire specification.
2. Inspect repository state.
3. Identify architectural risks.
4. Determine exact monorepo structure.
5. Design domain boundaries.
6. Design database relationships.
7. Design authentication flow for BOTH web and Electron.
8. Design deployment.
9. Document major decisions.
10. Establish repository/tooling.
11. Create the application shells.
12. Establish database/migrations.
13. Establish shared design system.
14. Verify web and desktop can consume shared code.
15. Implement only the clean beginning of Phase 1 if foundation is stable.
16. Run applicable tests/build/type-check/lint.
17. Update progress.md.

Do not create dozens of placeholder pages simply to appear productive.

A smaller functional vertical slice is preferable.

---

# 96. FIRST RUN DELIVERABLE

Before finishing the first run, provide a concise implementation report containing:

## Architecture
What architecture was selected and why.

## Completed
What actually works.

## Files
Major files/packages created or changed.

## Database
Schema/migrations completed.

## Verification
Tests, type-checking, builds and linting performed.

## Risks
Known issues or decisions requiring attention.

## Next
The exact recommended next Codex task.

Also ensure `docs/progress.md` contains this information so another Codex session can continue without relying on chat history.

---

# 97. ENGINEERING BEHAVIOR

Throughout development:

- inspect before changing
- preserve working architecture
- avoid duplicate code
- reuse shared components
- write maintainable code
- test meaningful behavior
- make responsive design real
- update documentation
- avoid unnecessary dependencies
- avoid premature abstraction
- avoid massive files
- avoid hidden global behavior
- avoid security shortcuts
- avoid placeholder implementations falsely marked complete

If routine technical details are ambiguous, make strong engineering decisions rather than repeatedly asking the user.

Ask only if a decision would materially change product behavior and cannot reasonably be inferred from this specification.

---

# 98. USER EXPERIENCE STANDARD

Every major interaction should answer:

- Is this obvious?
- Is this fast?
- Is this useful?
- Does this reduce cognitive load?
- Does this reinforce the user's actual priorities?

Do not make the user maintain the productivity system more than the productivity system helps the user.

---

# 99. SUCCESS CRITERION

The finished Life OS should feel like:

> **A private executive command center for an ambitious individual's career, execution, business, wealth, physical performance, faith, reflection and long-term decisions.**

It should constantly help distinguish:

**important work**

from:

**merely productive-looking work.**

It should help the user pursue extreme ambition without losing sight of faith, health, character or judgment.

Build toward that standard.
