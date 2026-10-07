import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type {
  SeasonCommand,
  GoalCommand,
  MilestoneCommand,
  ProjectCommand,
  CategoryCommand,
} from '@life-os/validation';
import { canonicalDecimal, type DirectionResource, type DirectionEntities } from '@life-os/shared';
import * as schema from './schema';
const { users, categories, visions, seasons, seasonAllocations, goals, milestones, projects } =
  schema;
const tables = { seasons, goals, milestones, projects };
export class DirectionNotFound extends Error {
  constructor() {
    super('Record not found.');
  }
}
export class DirectionConflict extends Error {
  constructor() {
    super('This record changed. Reload it and review your edits before saving.');
  }
}
export class DirectionInvalid extends Error {
  constructor(message: string) {
    super(message);
  }
}
const equivalent = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function publicRow<T extends { userId: string; createdAt: Date; updatedAt: Date }>(row: T) {
  const { userId: _owner, createdAt, updatedAt, ...fields } = row;
  void _owner;
  return { ...fields, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}
export function createDirectionRepository<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof schema>,
) {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  async function lockOwner(tx: Tx, userId: string) {
    const [owner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (!owner) throw new DirectionNotFound();
  }
  async function requireLink(
    tx: Tx,
    table: typeof categories | typeof visions | typeof goals | typeof milestones,
    userId: string,
    id: string | null,
  ) {
    if (!id) return;
    const [row] = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.id, id)));
    if (!row) throw new DirectionNotFound();
  }
  async function allocationRows(connection: Tx | typeof db, userId: string, ids: string[]) {
    if (!ids.length) return [];
    return connection
      .select({
        seasonId: seasonAllocations.seasonId,
        categoryId: seasonAllocations.categoryId,
        percent: seasonAllocations.percent,
        name: categories.name,
      })
      .from(seasonAllocations)
      .innerJoin(
        categories,
        and(eq(categories.id, seasonAllocations.categoryId), eq(categories.userId, userId)),
      )
      .where(and(eq(seasonAllocations.userId, userId), inArray(seasonAllocations.seasonId, ids)))
      .orderBy(desc(seasonAllocations.percent), categories.name);
  }
  async function read<R extends DirectionResource>(
    connection: Tx | typeof db,
    userId: string,
    resource: R,
    id: string,
  ): Promise<DirectionEntities[R]> {
    const table: (typeof tables)[DirectionResource] = tables[resource];
    const [row] = await connection
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.id, id)));
    if (!row) throw new DirectionNotFound();
    const item = publicRow(row);
    if (resource === 'seasons') {
      const allocations = (await allocationRows(connection, userId, [id])).map(
        ({ seasonId: _season, ...allocation }) => {
          void _season;
          return allocation;
        },
      );
      return { ...item, allocations } as DirectionEntities[R];
    }
    if ('completedAt' in row)
      return {
        ...item,
        completedAt: row.completedAt?.toISOString() ?? null,
      } as DirectionEntities[R];
    return item as DirectionEntities[R];
  }
  async function versionRow<R extends DirectionResource>(
    tx: Tx,
    userId: string,
    resource: R,
    id: string,
    version: number,
  ) {
    const table: (typeof tables)[DirectionResource] = tables[resource];
    const [row] = await tx
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.id, id)));
    const typed = row as (typeof tables)[R]['$inferSelect'] | undefined;
    if (version > 0 && !typed) throw new DirectionNotFound();
    if (typed && typed.version !== (version || 1)) throw new DirectionConflict();
    return typed;
  }
  async function switchActive(tx: Tx, userId: string, except: string) {
    await tx
      .update(seasons)
      .set({ status: 'planned', version: sql`${seasons.version} + 1` })
      .where(
        and(
          eq(seasons.userId, userId),
          eq(seasons.status, 'active'),
          sql`${seasons.id} <> ${except}`,
        ),
      );
  }
  return {
    async activeSeason(userId: string) {
      return db.transaction(
        async (tx) => {
          const [active] = await tx
            .select({ id: seasons.id })
            .from(seasons)
            .where(and(eq(seasons.userId, userId), eq(seasons.status, 'active')));
          return active ? read(tx, userId, 'seasons', active.id) : null;
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
    async meta(userId: string) {
      return db.transaction(
        async (tx) => {
          const areas = await tx
            .select({ id: categories.id, name: categories.name, spiritual: categories.spiritual })
            .from(categories)
            .where(eq(categories.userId, userId))
            .orderBy(categories.name)
            .limit(100);
          const parents = await tx
            .select({ id: visions.id, title: visions.title })
            .from(visions)
            .where(eq(visions.userId, userId))
            .orderBy(visions.title)
            .limit(100);
          const [active] = await tx
            .select({ id: seasons.id })
            .from(seasons)
            .where(and(eq(seasons.userId, userId), eq(seasons.status, 'active')));
          return {
            categories: areas,
            visions: parents,
            activeSeason: active ? await read(tx, userId, 'seasons', active.id) : null,
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
    async category(userId: string, input: CategoryCommand) {
      return db.transaction(async (tx) => {
        await lockOwner(tx, userId);
        const [old] = await tx
          .select()
          .from(categories)
          .where(and(eq(categories.userId, userId), eq(categories.id, input.id)));
        if (old) {
          if (old.name !== input.name || old.spiritual !== input.spiritual)
            throw new DirectionConflict();
          return { id: old.id, name: old.name, spiritual: old.spiritual };
        }
        const existing = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.userId, userId))
          .limit(100);
        if (existing.length >= 100)
          throw new DirectionInvalid('Up to 100 categories are supported.');
        const [row] = await tx
          .insert(categories)
          .values({ ...input, userId, slug: input.id })
          .onConflictDoNothing()
          .returning({ id: categories.id, name: categories.name, spiritual: categories.spiritual });
        if (!row) throw new DirectionConflict();
        return row;
      });
    },
    async list(userId: string, resource: DirectionResource, before?: string, goalId?: string) {
      return db.transaction(
        async (tx) => {
          const table: (typeof tables)[DirectionResource] = tables[resource];
          if (before) await read(tx, userId, resource, before);
          if (goalId) await requireLink(tx, goals, userId, goalId);
          // Compare the cursor's timestamp in SQL; no microseconds are lost in JS.
          const cursor = before
            ? sql`(${table.createdAt}, ${table.id}) < (select created_at, id from ${table} where id = ${before} and user_id = ${userId})`
            : undefined;
          const rows = await tx
            .select()
            .from(table)
            .where(
              and(
                eq(table.userId, userId),
                cursor,
                resource === 'milestones' && goalId ? eq(milestones.goalId, goalId) : undefined,
              ),
            )
            .orderBy(desc(table.createdAt), desc(table.id))
            .limit(51);
          const page = rows.slice(0, 50);
          const allocations =
            resource === 'seasons'
              ? await allocationRows(
                  tx,
                  userId,
                  page.map((r) => r.id),
                )
              : [];
          const items = page.map((row) => {
            const item = publicRow(row);
            if (resource === 'seasons')
              return {
                ...item,
                allocations: allocations
                  .filter((a) => a.seasonId === row.id)
                  .map(({ seasonId: _season, ...a }) => {
                    void _season;
                    return a;
                  }),
              };
            if ('completedAt' in row)
              return { ...item, completedAt: row.completedAt?.toISOString() ?? null };
            return item;
          });
          return { items, nextCursor: rows.length > 50 ? page.at(-1)!.id : null };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
    async detail(userId: string, resource: DirectionResource, id: string) {
      return db.transaction(
        async (tx) => {
          const item = await read(tx, userId, resource, id);
          const ancestors: { kind: 'vision' | 'goal' | 'milestone'; id: string; title: string }[] =
            [];
          let goalId: string | null = 'goalId' in item ? item.goalId : null;
          if ('milestoneId' in item && item.milestoneId) {
            const [parent] = await tx
              .select()
              .from(milestones)
              .where(and(eq(milestones.userId, userId), eq(milestones.id, item.milestoneId)));
            if (!parent) throw new DirectionNotFound();
            ancestors.unshift({ kind: 'milestone', id: parent.id, title: parent.title });
            goalId = parent.goalId;
          }
          let visionId: string | null = 'visionId' in item ? item.visionId : null;
          if (goalId) {
            const [goal] = await tx
              .select()
              .from(goals)
              .where(and(eq(goals.userId, userId), eq(goals.id, goalId)));
            if (!goal) throw new DirectionNotFound();
            ancestors.unshift({ kind: 'goal', id: goal.id, title: goal.title });
            visionId = goal.visionId;
          }
          if (visionId) {
            const [vision] = await tx
              .select()
              .from(visions)
              .where(and(eq(visions.userId, userId), eq(visions.id, visionId)));
            if (!vision) throw new DirectionNotFound();
            ancestors.unshift({ kind: 'vision', id: vision.id, title: vision.title });
          }
          return { item, ancestors };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
    async saveSeason(userId: string, input: SeasonCommand) {
      return db.transaction(async (tx) => {
        await lockOwner(tx, userId);
        // Validate the complete set inside the transaction as well as at the service boundary.
        if (
          input.allocations.reduce((n, a) => n + a.percent, 0) !== 100 ||
          new Set(input.allocations.map((a) => a.categoryId)).size !== input.allocations.length
        )
          throw new DirectionInvalid('Allocate exactly 100% using each category once.');
        const old = await versionRow(tx, userId, 'seasons', input.id, input.version);
        const { allocations, version, ...fields } = input;
        for (const allocation of allocations)
          await requireLink(tx, categories, userId, allocation.categoryId);
        if (!version && old) {
          const persisted = await read(tx, userId, 'seasons', input.id);
          const previous = await tx
            .select({
              categoryId: seasonAllocations.categoryId,
              percent: seasonAllocations.percent,
            })
            .from(seasonAllocations)
            .where(
              and(eq(seasonAllocations.userId, userId), eq(seasonAllocations.seasonId, input.id)),
            );
          const sorted = (values: typeof allocations) =>
            [...values].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
          if (
            !Object.entries(fields).every(([key, value]) =>
              equivalent(old[key as keyof typeof old], value),
            ) ||
            !equivalent(sorted(previous), sorted(allocations))
          )
            throw new DirectionConflict();
          return persisted;
        }
        if (input.status === 'active') await switchActive(tx, userId, input.id);
        if (version)
          await tx
            .update(seasons)
            .set({ ...fields, version: version + 1 })
            .where(
              and(
                eq(seasons.userId, userId),
                eq(seasons.id, input.id),
                eq(seasons.version, version),
              ),
            );
        else {
          const [created] = await tx
            .insert(seasons)
            .values({ ...fields, userId })
            .onConflictDoNothing()
            .returning({ id: seasons.id });
          if (!created) throw new DirectionConflict();
        }
        await tx
          .delete(seasonAllocations)
          .where(
            and(eq(seasonAllocations.userId, userId), eq(seasonAllocations.seasonId, input.id)),
          );
        await tx
          .insert(seasonAllocations)
          .values(allocations.map((a) => ({ ...a, seasonId: input.id, userId })));
        return read(tx, userId, 'seasons', input.id);
      });
    },
    async activate(userId: string, id: string, version: number) {
      return db.transaction(async (tx) => {
        await lockOwner(tx, userId);
        const old = await versionRow(tx, userId, 'seasons', id, version);
        if (!old) throw new DirectionNotFound();
        const allocations = await allocationRows(tx, userId, [id]);
        if (!allocations.length || allocations.reduce((sum, a) => sum + a.percent, 0) !== 100)
          throw new DirectionInvalid('Set a complete 100% allocation before activating.');
        await switchActive(tx, userId, id);
        await tx
          .update(seasons)
          .set({ status: 'active', version: version + 1 })
          .where(and(eq(seasons.userId, userId), eq(seasons.id, id)));
        return read(tx, userId, 'seasons', id);
      });
    },
    async saveGoal(userId: string, input: GoalCommand) {
      return db.transaction(async (tx) => {
        await lockOwner(tx, userId);
        const old = await versionRow(tx, userId, 'goals', input.id, input.version);
        await requireLink(tx, categories, userId, input.categoryId);
        await requireLink(tx, visions, userId, input.visionId);
        const { version, ...fields } = input;
        if (!version && old) {
          if (
            !Object.entries(fields).every(([key, value]) =>
              equivalent(
                key.endsWith('Value')
                  ? canonicalDecimal(old[key as 'targetValue'] ?? null)
                  : old[key as keyof typeof old],
                key.endsWith('Value') ? canonicalDecimal(value as string | null) : value,
              ),
            )
          )
            throw new DirectionConflict();
        } else if (version)
          await tx
            .update(goals)
            .set({ ...fields, version: version + 1 })
            .where(
              and(eq(goals.userId, userId), eq(goals.id, input.id), eq(goals.version, version)),
            );
        else {
          const [created] = await tx
            .insert(goals)
            .values({ ...fields, userId })
            .onConflictDoNothing()
            .returning({ id: goals.id });
          if (!created) throw new DirectionConflict();
        }
        return read(tx, userId, 'goals', input.id);
      });
    },
    async saveMilestone(userId: string, input: MilestoneCommand) {
      return db.transaction(async (tx) => {
        await lockOwner(tx, userId);
        const old = await versionRow(tx, userId, 'milestones', input.id, input.version);
        await requireLink(tx, goals, userId, input.goalId);
        const { version, completed, ...fields } = input;
        if (!version && old) {
          if (
            !('completedAt' in old) ||
            !!old.completedAt !== completed ||
            !Object.entries(fields).every(([key, value]) =>
              equivalent(old[key as keyof typeof old], value),
            )
          )
            throw new DirectionConflict();
        } else {
          const completedAt = completed
            ? old && 'completedAt' in old && old.completedAt
              ? old.completedAt
              : new Date()
            : null;
          if (version)
            await tx
              .update(milestones)
              .set({ ...fields, completedAt, version: version + 1 })
              .where(
                and(
                  eq(milestones.userId, userId),
                  eq(milestones.id, input.id),
                  eq(milestones.version, version),
                ),
              );
          else {
            const [created] = await tx
              .insert(milestones)
              .values({ ...fields, completedAt, userId })
              .onConflictDoNothing()
              .returning({ id: milestones.id });
            if (!created) throw new DirectionConflict();
          }
        }
        return read(tx, userId, 'milestones', input.id);
      });
    },
    async saveProject(userId: string, input: ProjectCommand) {
      return db.transaction(async (tx) => {
        await lockOwner(tx, userId);
        const old = await versionRow(tx, userId, 'projects', input.id, input.version);
        await requireLink(tx, categories, userId, input.categoryId);
        await requireLink(tx, goals, userId, input.goalId);
        await requireLink(tx, milestones, userId, input.milestoneId);
        if (input.goalId && input.milestoneId)
          throw new DirectionInvalid('Choose a single parent.');
        const { version, ...fields } = input;
        if (!version && old) {
          if (
            !Object.entries(fields).every(([key, value]) =>
              equivalent(old[key as keyof typeof old], value),
            )
          )
            throw new DirectionConflict();
        } else if (version)
          await tx
            .update(projects)
            .set({ ...fields, version: version + 1 })
            .where(
              and(
                eq(projects.userId, userId),
                eq(projects.id, input.id),
                eq(projects.version, version),
              ),
            );
        else {
          const [created] = await tx
            .insert(projects)
            .values({ ...fields, userId })
            .onConflictDoNothing()
            .returning({ id: projects.id });
          if (!created) throw new DirectionConflict();
        }
        return read(tx, userId, 'projects', input.id);
      });
    },
  };
}
export type DirectionRepository = ReturnType<typeof createDirectionRepository>;
