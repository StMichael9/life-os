import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
  integer,
  numeric,
  boolean,
  index,
  unique,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
const owned = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ...timestamps(),
});
export const workStatus = pgEnum('work_status', [
  'inbox',
  'planned',
  'in_progress',
  'completed',
  'deferred',
  'cancelled',
]);
export const directionStatus = pgEnum('direction_status', [
  'planned',
  'active',
  'completed',
  'archived',
]);
export const energyLevel = pgEnum('energy_level', ['low', 'medium', 'high']);
export const users = pgTable(
  'app_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    timeZone: text('time_zone').notNull().default('UTC'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [check('email_normalized', sql`${t.email} = lower(trim(${t.email}))`)],
);
export const credentials = pgTable('auth_credential', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  ...timestamps(),
});
export const sessions = pgTable(
  'auth_session',
  {
    ...owned(),
    tokenHash: text('token_hash').notNull().unique(),
    client: text('client').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }).notNull().defaultNow(),
    previousTokenHash: text('previous_token_hash').unique(),
    previousValidUntil: timestamp('previous_valid_until', { withTimezone: true }),
  },
  (t) => [
    index('session_user_idx').on(t.userId),
    index('session_expiry_idx').on(t.expiresAt),
    check('session_client', sql`${t.client} in ('web','desktop')`),
  ],
);

export const categories = pgTable(
  'category',
  {
    ...owned(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    spiritual: boolean('spiritual').notNull().default(false),
  },
  (t) => [
    unique('category_owner_key').on(t.id, t.userId),
    unique('category_slug').on(t.userId, t.slug),
  ],
);
export const seasons = pgTable(
  'season',
  {
    ...owned(),
    name: text('name').notNull(),
    description: text('description'),
    objective: text('objective').notNull(),
    successCriteria: text('success_criteria'),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    status: directionStatus('status').notNull().default('planned'),
  },
  (t) => [
    unique('season_owner_key').on(t.id, t.userId),
    uniqueIndex('one_active_season_per_user')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    check('season_dates', sql`${t.endsOn} >= ${t.startsOn}`),
  ],
);
export const seasonAllocations = pgTable(
  'season_allocation',
  {
    ...owned(),
    seasonId: uuid('season_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    percent: integer('percent').notNull(),
  },
  (t) => [
    unique('allocation_category').on(t.seasonId, t.categoryId),
    foreignKey({
      columns: [t.seasonId, t.userId],
      foreignColumns: [seasons.id, seasons.userId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check('allocation_percent', sql`${t.percent} between 0 and 100`),
    index('allocation_user_idx').on(t.userId),
  ],
);
export const visions = pgTable(
  'vision',
  {
    ...owned(),
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => [unique('vision_owner_key').on(t.id, t.userId)],
);
export const goals = pgTable(
  'goal',
  {
    ...owned(),
    visionId: uuid('vision_id'),
    categoryId: uuid('category_id'),
    title: text('title').notNull(),
    description: text('description'),
    notes: text('notes'),
    targetDate: date('target_date'),
    status: directionStatus('status').notNull().default('planned'),
    priority: integer('priority').notNull().default(3),
    targetValue: numeric('target_value', { precision: 18, scale: 4 }),
    currentValue: numeric('current_value', { precision: 18, scale: 4 }),
    unit: text('unit'),
  },
  (t) => [
    unique('goal_owner_key').on(t.id, t.userId),
    foreignKey({ columns: [t.visionId, t.userId], foreignColumns: [visions.id, visions.userId] }),
    foreignKey({
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check('goal_priority', sql`${t.priority} between 1 and 5`),
    index('goal_user_status_idx').on(t.userId, t.status),
  ],
);
export const milestones = pgTable(
  'milestone',
  {
    ...owned(),
    goalId: uuid('goal_id').notNull(),
    title: text('title').notNull(),
    targetDate: date('target_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    unique('milestone_owner_key').on(t.id, t.userId),
    foreignKey({ columns: [t.goalId, t.userId], foreignColumns: [goals.id, goals.userId] }),
    index('milestone_goal_idx').on(t.goalId, t.userId),
  ],
);
export const projects = pgTable(
  'project',
  {
    ...owned(),
    milestoneId: uuid('milestone_id'),
    goalId: uuid('goal_id'),
    categoryId: uuid('category_id'),
    title: text('title').notNull(),
    description: text('description'),
    notes: text('notes'),
    status: directionStatus('status').notNull().default('planned'),
    startsOn: date('starts_on'),
    targetDate: date('target_date'),
  },
  (t) => [
    unique('project_owner_key').on(t.id, t.userId),
    foreignKey({ columns: [t.goalId, t.userId], foreignColumns: [goals.id, goals.userId] }),
    foreignKey({
      columns: [t.milestoneId, t.userId],
      foreignColumns: [milestones.id, milestones.userId],
    }),
    foreignKey({
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check(
      'project_single_parent',
      sql`not (${t.goalId} is not null and ${t.milestoneId} is not null)`,
    ),
    index('project_user_status_idx').on(t.userId, t.status),
  ],
);
export const tasks = pgTable(
  'task',
  {
    ...owned(),
    projectId: uuid('project_id'),
    goalId: uuid('goal_id'),
    categoryId: uuid('category_id'),
    title: text('title').notNull(),
    description: text('description'),
    notes: text('notes'),
    status: workStatus('status').notNull().default('inbox'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    estimateMinutes: integer('estimate_minutes'),
    actualMinutes: integer('actual_minutes'),
    impact: integer('impact').notNull().default(0),
    urgency: integer('urgency').notNull().default(0),
    opportunity: integer('opportunity').notNull().default(0),
    goalAlignment: integer('goal_alignment').notNull().default(0),
    energy: energyLevel('energy').notNull().default('medium'),
  },
  (t) => [
    unique('task_owner_key').on(t.id, t.userId),
    foreignKey({
      columns: [t.projectId, t.userId],
      foreignColumns: [projects.id, projects.userId],
    }),
    foreignKey({ columns: [t.goalId, t.userId], foreignColumns: [goals.id, goals.userId] }),
    foreignKey({
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check('task_single_parent', sql`not (${t.goalId} is not null and ${t.projectId} is not null)`),
    check(
      'task_scores',
      sql`${t.impact} between 0 and 5 and ${t.urgency} between 0 and 5 and ${t.opportunity} between 0 and 5 and ${t.goalAlignment} between 0 and 5`,
    ),
    check(
      'task_durations',
      sql`(${t.estimateMinutes} is null or ${t.estimateMinutes} > 0) and (${t.actualMinutes} is null or ${t.actualMinutes} >= 0)`,
    ),
    index('task_user_status_due_idx').on(t.userId, t.status, t.dueAt),
  ],
);
export const inboxItems = pgTable(
  'inbox_item',
  {
    ...owned(),
    body: text('body').notNull(),
    requestId: uuid('request_id').notNull().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    unique('inbox_owner_request_key').on(t.userId, t.requestId),
    index('inbox_user_created_idx').on(t.userId, t.createdAt, t.id),
    check('inbox_body_length', sql`length(trim(${t.body})) between 1 and 10000`),
  ],
);
export const dailyPlans = pgTable(
  'daily_plan',
  {
    ...owned(),
    localDate: date('local_date').notNull(),
    timeZone: text('time_zone').notNull(),
    oneThing: text('one_thing'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    unique('daily_plan_date').on(t.userId, t.localDate),
    unique('plan_owner_key').on(t.id, t.userId),
    check(
      'one_thing_length',
      sql`${t.oneThing} is null or length(trim(${t.oneThing})) between 1 and 500`,
    ),
  ],
);
export const dailyBigThree = pgTable(
  'daily_big_three',
  {
    ...owned(),
    planId: uuid('plan_id').notNull(),
    position: integer('position').notNull(),
    outcome: text('outcome').notNull(),
    taskId: uuid('task_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    unique('big_three_position').on(t.planId, t.position),
    check('big_three_limit', sql`${t.position} between 1 and 3`),
    check('big_three_outcome', sql`length(trim(${t.outcome})) between 1 and 500`),
    foreignKey({
      columns: [t.planId, t.userId],
      foreignColumns: [dailyPlans.id, dailyPlans.userId],
    }).onDelete('cascade'),
    foreignKey({ columns: [t.taskId, t.userId], foreignColumns: [tasks.id, tasks.userId] }),
    index('big_three_user_idx').on(t.userId),
  ],
);
export const scheduleBlocks = pgTable(
  'schedule_block',
  {
    ...owned(),
    title: text('title').notNull(),
    kind: text('kind').notNull(),
    taskId: uuid('task_id'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.taskId, t.userId], foreignColumns: [tasks.id, tasks.userId] }),
    check('schedule_duration', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'schedule_kind',
      sql`${t.kind} in ('task','focus','routine','meeting','training','custom')`,
    ),
    index('schedule_user_start_idx').on(t.userId, t.startsAt),
  ],
);
export const focusSessions = pgTable(
  'focus_session',
  {
    ...owned(),
    taskId: uuid('task_id'),
    categoryId: uuid('category_id'),
    objective: text('objective').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    plannedMinutes: integer('planned_minutes').notNull(),
    activeSeconds: integer('active_seconds').notNull().default(0),
    outcome: text('outcome'),
    notes: text('notes'),
  },
  (t) => [
    foreignKey({ columns: [t.taskId, t.userId], foreignColumns: [tasks.id, tasks.userId] }),
    foreignKey({
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check(
      'focus_duration',
      sql`${t.plannedMinutes} > 0 and ${t.activeSeconds} >= 0 and (${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt})`,
    ),
    uniqueIndex('one_open_focus_per_user')
      .on(t.userId)
      .where(sql`${t.endedAt} is null`),
    index('focus_user_start_idx').on(t.userId, t.startedAt),
  ],
);

export const authRateLimits = pgTable(
  'auth_rate_limit',
  {
    key: text('key').primaryKey(),
    attempts: integer('attempts').notNull(),
    resetsAt: timestamp('resets_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('auth_rate_limit_expiry_idx').on(t.resetsAt),
    check('rate_attempts_positive', sql`${t.attempts} > 0`),
  ],
);
