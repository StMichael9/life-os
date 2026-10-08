import { createHash } from 'node:crypto';
import { and, eq, sql, desc, asc, inArray, isNull, lt, gt } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ExecutionCommand } from '@life-os/validation';
import { localDate, dailyContent, emptyReflection, elapsedFocus } from '@life-os/shared';
import type {
  ExecutionSnapshot,
  DailyPlan,
  FocusSession,
  Reflection,
  VaultItem,
} from '@life-os/shared';
import { DirectionConflict, DirectionNotFound, DirectionInvalid } from './direction';
import * as s from './schema';
function clean<T>(value: unknown): T {
  // JSON is the API boundary. Never include stored owner IDs or conversion fingerprints.
  return JSON.parse(
    JSON.stringify(value, (key, v: unknown) =>
      key === 'userId' || key === 'conversionHash' ? undefined : v,
    ),
  ) as T;
}
function focus(row: typeof s.focusSessions.$inferSelect) {
  return clean<FocusSession>(row);
}
function reflection(raw: string): Reflection {
  return { ...emptyReflection, ...(JSON.parse(raw) as Partial<Reflection>) };
}
export function createExecutionRepository<T extends PgQueryResultHKT>(db: PgDatabase<T, typeof s>) {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  async function owned(
    tx: Tx,
    table:
      | typeof s.tasks
      | typeof s.projects
      | typeof s.categories
      | typeof s.inboxItems
      | typeof s.dailyPlans
      | typeof s.scheduleBlocks
      | typeof s.focusSessions
      | typeof s.routines
      | typeof s.vaultItems,
    id: string,
    userId: string,
  ) {
    const [row] = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id), eq(table.userId, userId)));
    if (!row) throw new DirectionNotFound();
  }
  async function versionCheck(
    tx: Tx,
    table:
      typeof s.scheduleBlocks | typeof s.focusSessions | typeof s.routines | typeof s.vaultItems,
    id: string,
    userId: string,
    version: number,
  ) {
    const [row] = await tx
      .select({ version: table.version })
      .from(table)
      .where(and(eq(table.id, id), eq(table.userId, userId)));
    if (version === 0) {
      if (row) throw new DirectionConflict();
    } else {
      if (!row) throw new DirectionNotFound();
      if (row.version !== version) throw new DirectionConflict();
    }
  }
  async function links(
    tx: Tx,
    userId: string,
    taskId: string | null,
    projectId: string | null = null,
    categoryId: string | null = null,
  ) {
    if (taskId) await owned(tx, s.tasks, taskId, userId);
    if (projectId) await owned(tx, s.projects, projectId, userId);
    if (categoryId) await owned(tx, s.categories, categoryId, userId);
  }
  return {
    async mutate(userId: string, c: ExecutionCommand) {
      return db.transaction(async (tx) => {
        const [user] = await tx.select().from(s.users).where(eq(s.users.id, userId)).for('update');
        if (!user) throw new DirectionNotFound();
        const fingerprint = createHash('sha256').update(JSON.stringify(c)).digest('hex');
        const [receipt] = await tx
          .select()
          .from(s.executionReceipts)
          .where(
            and(
              eq(s.executionReceipts.userId, userId),
              eq(s.executionReceipts.requestId, c.requestId),
            ),
          );
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) throw new DirectionConflict();
          return JSON.parse(receipt.result) as { id: string };
        }
        const now = new Date();
        let resultId = '';
        if (c.action === 'plan') {
          const [prior] = await tx
            .select()
            .from(s.dailyPlans)
            .where(and(eq(s.dailyPlans.userId, userId), eq(s.dailyPlans.localDate, c.date)));
          if ((prior?.version ?? 0) !== c.version) throw new DirectionConflict();
          if (prior?.closedAt && !['reopen'].includes(c.workflow))
            throw new DirectionInvalid('Reopen this day before changing it.');
          if (c.workflow === 'close' && !prior?.startedAt)
            throw new DirectionInvalid('Start the day before closing it.');
          for (const o of c.outcomes) await links(tx, userId, o.taskId);
          const values = {
            oneThing: c.oneThing,
            version: c.version + 1,
            timeZone: prior?.timeZone ?? user.timeZone,
            startedAt:
              c.workflow === 'start' ? (prior?.startedAt ?? now) : (prior?.startedAt ?? null),
            closedAt:
              c.workflow === 'close'
                ? now
                : c.workflow === 'reopen'
                  ? null
                  : (prior?.closedAt ?? null),
            morning:
              c.workflow === 'start' ? JSON.stringify(c.reflection) : (prior?.morning ?? '{}'),
            evening:
              c.workflow === 'close' ? JSON.stringify(c.reflection) : (prior?.evening ?? '{}'),
          };
          let planId = prior?.id;
          if (prior)
            await tx
              .update(s.dailyPlans)
              .set(values)
              .where(and(eq(s.dailyPlans.userId, userId), eq(s.dailyPlans.id, prior.id)));
          else {
            const [created] = await tx
              .insert(s.dailyPlans)
              .values({ ...values, userId, localDate: c.date })
              .returning({ id: s.dailyPlans.id });
            planId = created!.id;
          }
          const old = await tx
            .select()
            .from(s.dailyBigThree)
            .where(and(eq(s.dailyBigThree.userId, userId), eq(s.dailyBigThree.planId, planId!)));
          await tx
            .delete(s.dailyBigThree)
            .where(and(eq(s.dailyBigThree.userId, userId), eq(s.dailyBigThree.planId, planId!)));
          if (c.outcomes.length)
            await tx.insert(s.dailyBigThree).values(
              c.outcomes.map((o, i) => ({
                userId,
                planId: planId!,
                position: i + 1,
                outcome: o.outcome,
                taskId: o.taskId,
                completedAt: o.completed
                  ? (old.find((x) => x.outcome === o.outcome && x.taskId === o.taskId)
                      ?.completedAt ?? now)
                  : null,
              })),
            );
          resultId = planId!;
        } else if (c.action === 'schedule') {
          await versionCheck(tx, s.scheduleBlocks, c.id, userId, c.version);
          await links(tx, userId, c.taskId);
          if (c.remove) {
            if (!c.version) throw new DirectionNotFound();
            await tx
              .delete(s.scheduleBlocks)
              .where(and(eq(s.scheduleBlocks.id, c.id), eq(s.scheduleBlocks.userId, userId)));
          } else {
            const values = {
              title: c.title,
              kind: c.kind,
              taskId: c.taskId,
              startsAt: new Date(c.startsAt),
              endsAt: new Date(c.endsAt),
              version: c.version + 1,
            };
            // Adjacent blocks are allowed; overlapping blocks require a different time.
            const overlaps = await tx
              .select({ id: s.scheduleBlocks.id })
              .from(s.scheduleBlocks)
              .where(
                and(
                  eq(s.scheduleBlocks.userId, userId),
                  sql`${s.scheduleBlocks.id} <> ${c.id}`,
                  lt(s.scheduleBlocks.startsAt, values.endsAt),
                  gt(s.scheduleBlocks.endsAt, values.startsAt),
                ),
              )
              .limit(1);
            if (overlaps.length)
              throw new DirectionInvalid('This time overlaps another block. Choose a free time.');
            if (c.version)
              await tx
                .update(s.scheduleBlocks)
                .set(values)
                .where(and(eq(s.scheduleBlocks.id, c.id), eq(s.scheduleBlocks.userId, userId)));
            else await tx.insert(s.scheduleBlocks).values({ ...values, id: c.id, userId });
          }
          resultId = c.id;
        } else if (c.action === 'focus-start') {
          await links(tx, userId, c.taskId, c.projectId, c.categoryId);
          const open = await tx
            .select({ id: s.focusSessions.id })
            .from(s.focusSessions)
            .where(and(eq(s.focusSessions.userId, userId), isNull(s.focusSessions.endedAt)))
            .limit(1);
          if (open.length) throw new DirectionConflict();
          await tx.insert(s.focusSessions).values({
            id: c.id,
            userId,
            objective: c.objective,
            taskId: c.taskId,
            projectId: c.projectId,
            categoryId: c.categoryId,
            plannedMinutes: c.plannedMinutes,
            startedAt: now,
            resumedAt: now,
          });
          await tx.insert(s.focusIntervals).values({ userId, sessionId: c.id, startsAt: now });
          resultId = c.id;
        } else if (c.action === 'focus-control') {
          await versionCheck(tx, s.focusSessions, c.id, userId, c.version);
          const [row] = await tx
            .select()
            .from(s.focusSessions)
            .where(and(eq(s.focusSessions.id, c.id), eq(s.focusSessions.userId, userId)));
          if (!row || row.endedAt) throw new DirectionConflict();
          if (
            (c.operation === 'pause' && !row.resumedAt) ||
            (c.operation === 'resume' && row.resumedAt)
          )
            throw new DirectionConflict();
          const seconds = elapsedFocus(focus(row), now);
          if (c.operation === 'resume')
            await tx.insert(s.focusIntervals).values({ userId, sessionId: c.id, startsAt: now });
          else
            await tx
              .update(s.focusIntervals)
              .set({ endsAt: now })
              .where(
                and(
                  eq(s.focusIntervals.userId, userId),
                  eq(s.focusIntervals.sessionId, c.id),
                  isNull(s.focusIntervals.endsAt),
                ),
              );
          await tx
            .update(s.focusSessions)
            .set({
              version: c.version + 1,
              activeSeconds: seconds,
              resumedAt: c.operation === 'resume' ? now : null,
              endedAt: c.operation === 'finish' ? now : null,
              outcome: c.operation === 'finish' ? c.outcome : row.outcome,
              notes: c.operation === 'finish' ? c.notes : row.notes,
            })
            .where(and(eq(s.focusSessions.id, c.id), eq(s.focusSessions.userId, userId)));
          if (c.operation === 'finish' && row.taskId)
            await tx
              .update(s.tasks)
              .set({
                actualMinutes: sql`coalesce(${s.tasks.actualMinutes},0) + ${Math.round(seconds / 60)}`,
                version: sql`${s.tasks.version}+1`,
              })
              .where(and(eq(s.tasks.id, row.taskId), eq(s.tasks.userId, userId)));
          resultId = c.id;
        } else if (c.action === 'routine') {
          await versionCheck(tx, s.routines, c.id, userId, c.version);
          if (c.version && !c.archived) {
            const [prior] = await tx
              .select({ archived: s.routines.archived })
              .from(s.routines)
              .where(and(eq(s.routines.userId, userId), eq(s.routines.id, c.id)));
            if (prior?.archived) {
              const [count] = await tx
                .select({ n: sql<number>`count(*)::int` })
                .from(s.routines)
                .where(and(eq(s.routines.userId, userId), eq(s.routines.archived, false)));
              if (count!.n >= 100)
                throw new DirectionInvalid(
                  'Archive a routine before restoring more than 100 active routines.',
                );
            }
          }
          const values = {
            version: c.version + 1,
            title: c.title,
            notes: c.notes,
            days: [...c.days].sort().join(','),
            spiritual: c.spiritual,
            archived: c.archived,
          };
          if (c.version)
            await tx
              .update(s.routines)
              .set(values)
              .where(and(eq(s.routines.id, c.id), eq(s.routines.userId, userId)));
          else {
            const count = await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(s.routines)
              .where(and(eq(s.routines.userId, userId), eq(s.routines.archived, false)));
            if (count[0]!.n >= 100)
              throw new DirectionInvalid(
                'Archive a routine before adding more than 100 active routines.',
              );
            await tx.insert(s.routines).values({ ...values, id: c.id, userId });
          }
          resultId = c.id;
        } else if (c.action === 'routine-check') {
          await owned(tx, s.routines, c.id, userId);
          const [row] = await tx
            .select()
            .from(s.routines)
            .where(and(eq(s.routines.id, c.id), eq(s.routines.userId, userId)));
          const weekday = new Date(`${c.date}T12:00:00Z`).getUTCDay();
          if (row!.archived || !row!.days.split(',').includes(String(weekday)))
            throw new DirectionInvalid('This routine is not scheduled on that day.');
          if (c.completed)
            await tx
              .insert(s.routineCompletions)
              .values({ userId, routineId: c.id, localDate: c.date, notes: c.notes })
              .onConflictDoUpdate({
                target: [s.routineCompletions.routineId, s.routineCompletions.localDate],
                set: { notes: c.notes },
              });
          else
            await tx
              .delete(s.routineCompletions)
              .where(
                and(
                  eq(s.routineCompletions.userId, userId),
                  eq(s.routineCompletions.routineId, c.id),
                  eq(s.routineCompletions.localDate, c.date),
                ),
              );
          resultId = c.id;
        } else if (c.action === 'vault') {
          await versionCheck(tx, s.vaultItems, c.id, userId, c.version);
          if (c.sourceInboxId) {
            await owned(tx, s.inboxItems, c.sourceInboxId, userId);
            const [source] = await tx
              .select()
              .from(s.inboxItems)
              .where(and(eq(s.inboxItems.id, c.sourceInboxId), eq(s.inboxItems.userId, userId)));
            if (c.version === 0 && source!.processedAt) throw new DirectionConflict();
          }
          if (c.version) {
            const [prior] = await tx
              .select()
              .from(s.vaultItems)
              .where(and(eq(s.vaultItems.id, c.id), eq(s.vaultItems.userId, userId)));
            if (prior!.sourceInboxId !== c.sourceInboxId)
              throw new DirectionInvalid('The original capture link cannot be changed.');
          }
          const values = {
            version: c.version + 1,
            title: c.title,
            body: c.body,
            kind: c.kind,
            archived: c.archived,
            sourceInboxId: c.sourceInboxId,
          };
          let favorite: typeof s.vaultItems.$inferSelect | undefined;
          if (!c.version && !c.sourceInboxId && ['scripture', 'thought'].includes(c.kind))
            [favorite] = await tx
              .select()
              .from(s.vaultItems)
              .where(
                and(
                  eq(s.vaultItems.userId, userId),
                  eq(s.vaultItems.kind, c.kind),
                  eq(s.vaultItems.title, c.title),
                  eq(s.vaultItems.body, c.body),
                ),
              )
              .limit(1);
          if (favorite) {
            if (favorite.archived)
              await tx
                .update(s.vaultItems)
                .set({ archived: false, version: favorite.version + 1 })
                .where(and(eq(s.vaultItems.userId, userId), eq(s.vaultItems.id, favorite.id)));
          } else if (c.version)
            await tx
              .update(s.vaultItems)
              .set(values)
              .where(and(eq(s.vaultItems.id, c.id), eq(s.vaultItems.userId, userId)));
          else await tx.insert(s.vaultItems).values({ ...values, id: c.id, userId });
          if (c.sourceInboxId)
            await tx
              .update(s.inboxItems)
              .set({ processedAt: now })
              .where(and(eq(s.inboxItems.id, c.sourceInboxId), eq(s.inboxItems.userId, userId)));
          resultId = favorite?.id ?? c.id;
        } else if (c.action === 'vault-task') {
          await versionCheck(tx, s.vaultItems, c.id, userId, c.version);
          const [item] = await tx
            .select()
            .from(s.vaultItems)
            .where(and(eq(s.vaultItems.id, c.id), eq(s.vaultItems.userId, userId)));
          if (item!.convertedTaskId || item!.convertedGoalId || item!.convertedProjectId)
            throw new DirectionConflict();
          await tx.insert(s.tasks).values({
            id: c.taskId,
            userId,
            title: item!.title,
            description: item!.body,
            status: 'planned',
          });
          await tx
            .update(s.vaultItems)
            .set({ convertedTaskId: c.taskId, archived: true, version: c.version + 1 })
            .where(and(eq(s.vaultItems.id, c.id), eq(s.vaultItems.userId, userId)));
          resultId = c.taskId;
        } else if (c.action === 'vault-promote') {
          await versionCheck(tx, s.vaultItems, c.id, userId, c.version);
          const [item] = await tx
            .select()
            .from(s.vaultItems)
            .where(and(eq(s.vaultItems.id, c.id), eq(s.vaultItems.userId, userId)));
          if (!item || item.convertedTaskId || item.convertedGoalId || item.convertedProjectId)
            throw new DirectionConflict();
          const fields = {
            id: c.targetId,
            userId,
            title: item.title,
            description: item.body.slice(0, 2000),
            notes: 'Full source context is preserved in Vault item ' + item.id,
            status: 'planned' as const,
          };
          if (c.target === 'goal') await tx.insert(s.goals).values(fields);
          else await tx.insert(s.projects).values(fields);
          await tx
            .update(s.vaultItems)
            .set({
              version: c.version + 1,
              archived: true,
              ...(c.target === 'goal'
                ? { convertedGoalId: c.targetId }
                : { convertedProjectId: c.targetId }),
            })
            .where(and(eq(s.vaultItems.id, c.id), eq(s.vaultItems.userId, userId)));
          resultId = c.targetId;
        } else if (c.action === 'inbox-dismiss') {
          await owned(tx, s.inboxItems, c.id, userId);
          await tx
            .update(s.inboxItems)
            .set({ processedAt: now })
            .where(and(eq(s.inboxItems.id, c.id), eq(s.inboxItems.userId, userId)));
          resultId = c.id;
        }
        const result = { id: resultId };
        await tx
          .insert(s.executionReceipts)
          .values({ requestId: c.requestId, userId, fingerprint, result: JSON.stringify(result) });
        return result;
      });
    },
    async today(
      userId: string,
      date?: string,
    ): Promise<Omit<ExecutionSnapshot, 'recommendations' | 'insights'>> {
      const now = new Date();
      // One repeatable-read snapshot bounds every collection, including Season allocations.

      return db.transaction(
        async (tx) => {
          const [user] = await tx.select().from(s.users).where(eq(s.users.id, userId));
          if (!user) throw new DirectionNotFound();
          const day = date ?? localDate(now, user.timeZone);
          const [seasonRow] = await tx
            .select()
            .from(s.seasons)
            .where(and(eq(s.seasons.userId, userId), eq(s.seasons.status, 'active')));
          const allocations = seasonRow
            ? await tx
                .select({
                  categoryId: s.seasonAllocations.categoryId,
                  percent: s.seasonAllocations.percent,
                  name: s.categories.name,
                })
                .from(s.seasonAllocations)
                .innerJoin(
                  s.categories,
                  and(
                    eq(s.categories.id, s.seasonAllocations.categoryId),
                    eq(s.categories.userId, userId),
                  ),
                )
                .where(
                  and(
                    eq(s.seasonAllocations.userId, userId),
                    eq(s.seasonAllocations.seasonId, seasonRow.id),
                  ),
                )
            : [];
          const season = seasonRow
            ? { ...clean<NonNullable<ExecutionSnapshot['activeSeason']>>(seasonRow), allocations }
            : null;

          // Use local calendar predicates, including 23/25-hour DST days and blocks crossing midnight.
          const inDay = (column: typeof s.tasks.completedAt | typeof s.focusSessions.startedAt) =>
            sql`(${column} at time zone ${user.timeZone})::date = ${day}::date`;
          const [planRow] = await tx
            .select()
            .from(s.dailyPlans)
            .where(and(eq(s.dailyPlans.userId, userId), eq(s.dailyPlans.localDate, day)));
          const outcomes = planRow
            ? await tx
                .select()
                .from(s.dailyBigThree)
                .where(
                  and(eq(s.dailyBigThree.userId, userId), eq(s.dailyBigThree.planId, planRow.id)),
                )
                .orderBy(asc(s.dailyBigThree.position))
            : [];
          const plan: DailyPlan | null = planRow
            ? {
                ...clean<DailyPlan>(planRow),
                morning: reflection(planRow.morning),
                evening: reflection(planRow.evening),
                outcomes: clean<DailyPlan['outcomes']>(outcomes),
              }
            : null;
          const blocks = await tx
            .select()
            .from(s.scheduleBlocks)
            .where(
              and(
                eq(s.scheduleBlocks.userId, userId),
                sql`(${s.scheduleBlocks.startsAt} at time zone ${user.timeZone})::date <= ${day}::date AND (${s.scheduleBlocks.endsAt} at time zone ${user.timeZone})::date >= ${day}::date AND ${s.scheduleBlocks.endsAt} > (${day}::date::timestamp at time zone ${user.timeZone})`,
              ),
            )
            .orderBy(asc(s.scheduleBlocks.startsAt))
            .limit(101);
          const candidates = await tx
            .select({
              task: s.tasks,
              effectiveCategory: sql<
                string | null
              >`coalesce(${s.tasks.categoryId},(select coalesce(p.category_id,g.category_id,mg.category_id) from project p left join goal g on g.id=p.goal_id and g.user_id=p.user_id left join milestone m on m.id=p.milestone_id and m.user_id=p.user_id left join goal mg on mg.id=m.goal_id and mg.user_id=p.user_id where p.id=${s.tasks.projectId} and p.user_id=${userId}), (select category_id from goal where id=${s.tasks.goalId} and user_id=${userId}))`,
            })
            .from(s.tasks)
            .where(
              and(
                eq(s.tasks.userId, userId),
                inArray(s.tasks.status, ['inbox', 'planned', 'in_progress']),
              ),
            )
            .orderBy(asc(s.tasks.priority), asc(s.tasks.dueAt), asc(s.tasks.id))
            .limit(201);
          // Bound recommendations independently from the plan's selected Task links.
          // Completed or lower-ranked selections must survive a full candidate page.
          const tasks = candidates.slice(0, 200).map((c) => c.task);
          const linked = outcomes.flatMap((o) => (o.taskId ? [o.taskId] : []));
          if (linked.length) {
            const linkedRows = await tx
              .select()
              .from(s.tasks)
              .where(and(eq(s.tasks.userId, userId), inArray(s.tasks.id, linked)));
            for (const row of linkedRows) if (!tasks.some((t) => t.id === row.id)) tasks.push(row);
          }
          const rankingCategories = Object.fromEntries(
            candidates.map((c) => [c.task.id, c.effectiveCategory]),
          );
          const [completed] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(s.tasks)
            .where(
              and(
                eq(s.tasks.userId, userId),
                eq(s.tasks.status, 'completed'),
                inDay(s.tasks.completedAt),
              ),
            );
          const [inbox] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(s.inboxItems)
            .where(and(eq(s.inboxItems.userId, userId), isNull(s.inboxItems.processedAt)));
          const [current] = await tx
            .select()
            .from(s.focusSessions)
            .where(and(eq(s.focusSessions.userId, userId), isNull(s.focusSessions.endedAt)));
          const history = await tx
            .select()
            .from(s.focusSessions)
            .where(
              and(
                eq(s.focusSessions.userId, userId),
                sql`${s.focusSessions.endedAt} is not null`,
                inDay(s.focusSessions.startedAt),
              ),
            )
            .orderBy(desc(s.focusSessions.startedAt))
            .limit(20);
          const dayStart = sql`${day}::date::timestamp at time zone ${user.timeZone}`;
          const dayEnd = sql`(${day}::date + 1)::timestamp at time zone ${user.timeZone}`;
          const [scheduled] = await tx
            .select({
              n: sql<number>`coalesce(sum(extract(epoch from (least(${s.scheduleBlocks.endsAt},${dayEnd}) - greatest(${s.scheduleBlocks.startsAt},${dayStart}))) / 60),0)::double precision`,
            })
            .from(s.scheduleBlocks)
            .where(
              and(
                eq(s.scheduleBlocks.userId, userId),
                sql`${s.scheduleBlocks.startsAt} < ${dayEnd}`,
                sql`${s.scheduleBlocks.endsAt} > ${dayStart}`,
              ),
            );
          const [seconds] = await tx
            .select({
              n: sql<number>`coalesce(sum(floor(extract(epoch from (least(coalesce(${s.focusIntervals.endsAt},${now}),${dayEnd}) - greatest(${s.focusIntervals.startsAt},${dayStart}))))),0)::int`,
            })
            .from(s.focusIntervals)
            .where(
              and(
                eq(s.focusIntervals.userId, userId),
                sql`${s.focusIntervals.startsAt} < ${dayEnd}`,
                sql`coalesce(${s.focusIntervals.endsAt},${now}) > ${dayStart}`,
              ),
            );
          const routines = await tx
            .select()
            .from(s.routines)
            .where(
              and(
                eq(s.routines.userId, userId),
                sql`(${s.routines.archived}=false or exists(select 1 from routine_completion rc where rc.routine_id=${s.routines.id} and rc.user_id=${userId} and rc.local_date=${day}))`,
              ),
            )
            .orderBy(asc(s.routines.title))
            .limit(101);
          const checks = await tx
            .select()
            .from(s.routineCompletions)
            .where(
              and(eq(s.routineCompletions.userId, userId), eq(s.routineCompletions.localDate, day)),
            )
            .limit(100);
          const categories = await tx
            .select({
              id: s.categories.id,
              name: s.categories.name,
              spiritual: s.categories.spiritual,
            })
            .from(s.categories)
            .where(eq(s.categories.userId, userId))
            .limit(100);
          const projects = await tx
            .select({ id: s.projects.id, title: s.projects.title })
            .from(s.projects)
            .where(
              and(eq(s.projects.userId, userId), inArray(s.projects.status, ['planned', 'active'])),
            )
            .orderBy(asc(s.projects.title))
            .limit(100);
          const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
          return {
            ownerId: userId,
            date: day,
            timeZone: user.timeZone,
            serverNow: now.toISOString(),
            content: dailyContent(new Date(`${day}T12:00:00Z`), 'UTC'),
            plan,
            activeSeason: season,
            schedule: clean(blocks.slice(0, 100)),
            tasks: clean(tasks),
            rankingCategories,
            focus: current ? focus(current) : null,
            focusHistory: history.map(focus),
            routines: routines.slice(0, 100).map((row) => {
              const check = checks.find((x) => x.routineId === row.id);
              return {
                ...clean<typeof row>(row),
                days: row.days.split(',').map(Number),
                scheduled: !row.archived && row.days.split(',').includes(String(weekday)),
                completed: !!check,
                completionNotes: check?.notes ?? null,
              };
            }),
            categories,
            projects,
            snapshot: {
              completedTasks: completed!.n,
              focusSeconds: seconds!.n,
              scheduledMinutes: scheduled!.n,
              inboxCount: inbox!.n,
            },
            limits: {
              tasks: candidates.length > 200,
              schedule: blocks.length > 100,
              routines: routines.length > 100,
            },
          };
        },
        { isolationLevel: 'repeatable read' },
      );
    },
    async vaultDetail(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(s.vaultItems)
        .where(and(eq(s.vaultItems.userId, userId), eq(s.vaultItems.id, id)));
      if (!row) throw new DirectionNotFound();
      return clean<VaultItem>(row);
    },
    async vault(userId: string, before?: string, kind?: string, archived = false) {
      return db.transaction(
        async (tx) => {
          if (before) await owned(tx, s.vaultItems, before, userId);
          const rows = await tx
            .select()
            .from(s.vaultItems)
            .where(
              and(
                eq(s.vaultItems.userId, userId),
                eq(s.vaultItems.archived, archived),
                kind ? eq(s.vaultItems.kind, kind) : undefined,
                before
                  ? sql`(${s.vaultItems.createdAt},${s.vaultItems.id}) < (select created_at,id from vault_item where id=${before} and user_id=${userId})`
                  : undefined,
              ),
            )
            .orderBy(desc(s.vaultItems.createdAt), desc(s.vaultItems.id))
            .limit(51);
          return {
            items: clean<VaultItem[]>(rows.slice(0, 50)),
            next: rows.length > 50 ? rows[49]!.id : null,
          };
        },
        { isolationLevel: 'repeatable read' },
      );
    },
    async search(userId: string, query: string) {
      const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
      const groups = await Promise.all([
        ...(
          [
            ['tasks', s.tasks, '/tasks?id='],
            ['goals', s.goals, '/direction?resource=goals&id='],
            ['projects', s.projects, '/direction?resource=projects&id='],
            ['vault', s.vaultItems, '/vault?id='],
          ] as const
        ).map(async ([area, table, path]) => {
          const rows = await db
            .select({ id: table.id, title: table.title })
            .from(table)
            .where(
              and(
                eq(table.userId, userId),
                sql`(${table.title} ilike ${pattern} or ${'body' in table ? table.body : table.description} ilike ${pattern})`,
              ),
            )
            .orderBy(asc(table.title), asc(table.id))
            .limit(10);
          return rows.map((row) => ({ ...row, area, href: path + row.id }));
        }),
      ]);
      const seasonRows = await db
        .select({ id: s.seasons.id, title: s.seasons.name })
        .from(s.seasons)
        .where(
          and(
            eq(s.seasons.userId, userId),
            sql`(${s.seasons.name} ilike ${pattern} or ${s.seasons.objective} ilike ${pattern})`,
          ),
        )
        .orderBy(asc(s.seasons.name), asc(s.seasons.id))
        .limit(10);
      const routineRows = await db
        .select({ id: s.routines.id, title: s.routines.title })
        .from(s.routines)
        .where(
          and(
            eq(s.routines.userId, userId),
            eq(s.routines.archived, false),
            sql`(${s.routines.title} ilike ${pattern} or ${s.routines.notes} ilike ${pattern})`,
          ),
        )
        .orderBy(asc(s.routines.title), asc(s.routines.id))
        .limit(10);
      const inboxRows = await db
        .select({ id: s.inboxItems.id, title: sql<string>`left(${s.inboxItems.body},120)` })
        .from(s.inboxItems)
        .where(and(eq(s.inboxItems.userId, userId), sql`${s.inboxItems.body} ilike ${pattern}`))
        .orderBy(desc(s.inboxItems.createdAt), desc(s.inboxItems.id))
        .limit(10);
      return [
        ...groups.flat(),
        ...seasonRows.map((row) => ({
          ...row,
          area: 'seasons',
          href: '/direction?resource=seasons&id=' + row.id,
        })),
        ...routineRows.map((row) => ({
          ...row,
          area: 'routines',
          href: '/routines#routine-' + row.id,
        })),
        ...inboxRows.map((row) => ({ ...row, area: 'inbox', href: '/inbox?id=' + row.id })),
      ];
    },
  };
}
export type ExecutionRepository = ReturnType<typeof createExecutionRepository>;
