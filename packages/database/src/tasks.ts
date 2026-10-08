import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { TaskCommand } from '@life-os/validation';
import type { Task, TaskDetail, TaskStatus } from '@life-os/shared';
import { DirectionConflict, DirectionNotFound, DirectionInvalid } from './direction';
import * as schema from './schema';
const { tasks, inboxItems, users, goals, projects, milestones, visions, categories } = schema;
function dto(row: typeof tasks.$inferSelect): Task {
  const {
    userId: _owner,
    conversionHash: _hash,
    dueAt,
    completedAt,
    createdAt,
    updatedAt,
    ...rest
  } = row;
  void _owner;
  void _hash;
  return {
    ...rest,
    dueAt: dueAt?.toISOString() ?? null,
    completedAt: completedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
function fields(input: TaskCommand) {
  const { version: _version, dueAt, ...rest } = input;
  void _version;
  return { ...rest, dueAt: dueAt ? new Date(dueAt) : null };
}
function fingerprint(input: TaskCommand) {
  return createHash('sha256')
    .update(JSON.stringify(fields(input)))
    .digest('hex');
}
export function createTaskRepository<T extends PgQueryResultHKT>(db: PgDatabase<T, typeof schema>) {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  async function lock(tx: Tx, userId: string) {
    const [row] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (!row) throw new DirectionNotFound();
  }
  async function find(tx: Tx, userId: string, id: string) {
    const [row] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.id, id)));
    if (!row) throw new DirectionNotFound();
    return row;
  }
  async function links(tx: Tx, userId: string, input: TaskCommand) {
    if (input.goalId && input.projectId) throw new DirectionInvalid('Choose a single parent.');
    for (const [table, id] of [
      [goals, input.goalId],
      [projects, input.projectId],
      [categories, input.categoryId],
    ] as const) {
      if (!id) continue;
      const [row] = await tx
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.id, id)));
      if (!row) throw new DirectionNotFound();
    }
  }
  async function create(
    tx: Tx,
    userId: string,
    input: TaskCommand,
    source?: { id: string; hash: string },
  ) {
    const [created] = await tx
      .insert(tasks)
      .values({
        ...fields(input),
        userId,
        completedAt: input.status === 'completed' ? new Date() : null,
        sourceInboxId: source?.id ?? null,
        conversionHash: source?.hash ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) throw new DirectionConflict();
    return dto(created);
  }
  return {
    async capture(userId: string, id: string) {
      return db.transaction(
        async (tx) => {
          const [capture] = await tx
            .select({
              id: inboxItems.id,
              body: inboxItems.body,
              processedAt: inboxItems.processedAt,
            })
            .from(inboxItems)
            .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, id)));
          if (!capture) throw new DirectionNotFound();
          const [converted] = await tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.userId, userId), eq(tasks.sourceInboxId, id)));
          return {
            capture: { id: capture.id, body: capture.body },
            convertedTaskId: converted?.id ?? null,
            processed: !!capture.processedAt,
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
    async list(
      userId: string,
      before?: string,
      status?: TaskStatus,
      goalId?: string,
      projectId?: string,
    ) {
      return db.transaction(
        async (tx) => {
          if (before) await find(tx, userId, before);
          for (const [table, id] of [
            [goals, goalId],
            [projects, projectId],
          ] as const) {
            if (!id) continue;
            const [owned] = await tx
              .select({ id: table.id })
              .from(table)
              .where(and(eq(table.userId, userId), eq(table.id, id)));
            if (!owned) throw new DirectionNotFound();
          }
          const rows = await tx
            .select()
            .from(tasks)
            .where(
              and(
                eq(tasks.userId, userId),
                status ? eq(tasks.status, status) : undefined,
                goalId ? eq(tasks.goalId, goalId) : undefined,
                projectId ? eq(tasks.projectId, projectId) : undefined,
                before
                  ? sql`(${tasks.createdAt}, ${tasks.id}) < (select created_at,id from task where id = ${before} and user_id = ${userId})`
                  : undefined,
              ),
            )
            .orderBy(desc(tasks.createdAt), desc(tasks.id))
            .limit(51);
          return {
            items: rows.slice(0, 50).map(dto),
            nextCursor: rows.length > 50 ? rows[49]!.id : null,
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
    async detail(userId: string, id: string): Promise<TaskDetail> {
      return db.transaction(
        async (tx) => {
          const row = await find(tx, userId, id);
          const ancestors: TaskDetail['ancestors'] = [];
          let goalId = row.goalId;
          if (row.projectId) {
            const [project] = await tx
              .select()
              .from(projects)
              .where(and(eq(projects.userId, userId), eq(projects.id, row.projectId)));
            if (!project) throw new DirectionNotFound();
            ancestors.unshift({ kind: 'project', id: project.id, title: project.title });
            goalId = project.goalId;
            if (project.milestoneId) {
              const [milestone] = await tx
                .select()
                .from(milestones)
                .where(and(eq(milestones.userId, userId), eq(milestones.id, project.milestoneId)));
              if (!milestone) throw new DirectionNotFound();
              ancestors.unshift({ kind: 'milestone', id: milestone.id, title: milestone.title });
              goalId = milestone.goalId;
            }
          }
          if (goalId) {
            const [goal] = await tx
              .select()
              .from(goals)
              .where(and(eq(goals.userId, userId), eq(goals.id, goalId)));
            if (!goal) throw new DirectionNotFound();
            ancestors.unshift({ kind: 'goal', id: goal.id, title: goal.title });
            if (goal.visionId) {
              const [vision] = await tx
                .select()
                .from(visions)
                .where(and(eq(visions.userId, userId), eq(visions.id, goal.visionId)));
              if (!vision) throw new DirectionNotFound();
              ancestors.unshift({ kind: 'vision', id: vision.id, title: vision.title });
            }
          }
          return { item: dto(row), ancestors };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
    async save(userId: string, input: TaskCommand) {
      return db.transaction(async (tx) => {
        await lock(tx, userId);
        const [old] = await tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.userId, userId), eq(tasks.id, input.id)));
        await links(tx, userId, input);
        if (!input.version) {
          if (!old) return create(tx, userId, input);
          if (
            old.version !== 1 ||
            old.sourceInboxId ||
            !Object.entries(fields(input)).every(
              ([key, value]) =>
                JSON.stringify(old[key as keyof typeof old]) === JSON.stringify(value),
            )
          )
            throw new DirectionConflict();
          return dto(old);
        }
        if (!old) throw new DirectionNotFound();
        if (old.version !== input.version) throw new DirectionConflict();
        const [updated] = await tx
          .update(tasks)
          .set({
            ...fields(input),
            version: input.version + 1,
            completedAt:
              input.status === 'completed'
                ? old.status === 'completed'
                  ? old.completedAt
                  : new Date()
                : null,
          })
          .where(
            and(eq(tasks.userId, userId), eq(tasks.id, input.id), eq(tasks.version, input.version)),
          )
          .returning();
        if (!updated) throw new DirectionConflict();
        return dto(updated);
      });
    },
    async convert(userId: string, inboxId: string, input: TaskCommand) {
      return db.transaction(async (tx) => {
        await lock(tx, userId);
        const [capture] = await tx
          .select()
          .from(inboxItems)
          .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, inboxId)))
          .for('update');
        if (!capture) throw new DirectionNotFound();
        const [prior] = await tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.userId, userId), eq(tasks.sourceInboxId, inboxId)));
        const hash = fingerprint(input);
        if (prior) {
          if (prior.id !== input.id || prior.conversionHash !== hash) throw new DirectionConflict();
          return dto(prior); // Exact replay returns the linked Task, even after later edits.
        }
        if (capture.processedAt || input.version !== 0) throw new DirectionConflict();
        await links(tx, userId, input);
        const item = await create(tx, userId, input, { id: inboxId, hash });
        await tx
          .update(inboxItems)
          .set({ processedAt: new Date() })
          .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, inboxId)));
        return item;
      });
    },
  };
}
export type TaskRepository = ReturnType<typeof createTaskRepository>;
