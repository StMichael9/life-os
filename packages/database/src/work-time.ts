import { and, eq, sql, desc, isNull } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ExecutionCommand } from '@life-os/validation';
import type { FocusSession, WorkTimeSnapshot, WorkSessionDetail } from '@life-os/shared';
import { shiftDate, elapsedFocusMilliseconds } from '@life-os/shared';
import { DirectionConflict, DirectionInvalid, DirectionNotFound } from './direction';
import * as s from './schema';
const json = <T>(value: unknown): T =>
  JSON.parse(JSON.stringify(value, (key, v: unknown) => (key === 'userId' ? undefined : v))) as T;
const rows = <T>(value: unknown) => (value as { rows: T[] }).rows;

export async function readWorkTime<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof s>,
  userId: string,
  date: string,
  zone: string,
  now: Date,
  targetMinutes: number,
  targetVersion: number,
): Promise<WorkTimeSnapshot> {
  // Half-open UTC intervals clipped to real local midnights; floor only AFTER summing.
  const base = sql`select i.starts_at, least(coalesce(i.ends_at,${now}),${now}) as ends_at,
    f.id, f.objective, f.task_id, f.project_id, f.ended_at, f.resumed_at,
    coalesce(f.category_id,t.category_id,p.category_id,g.category_id,mg.category_id,tg.category_id) as category_id
    from focus_interval i join focus_session f on f.id=i.session_id and f.user_id=i.user_id
    left join task t on t.id=f.task_id and t.user_id=f.user_id
    left join project p on p.id=coalesce(f.project_id,t.project_id) and p.user_id=f.user_id
    left join goal g on g.id=p.goal_id and g.user_id=f.user_id
    left join milestone m on m.id=p.milestone_id and m.user_id=f.user_id
    left join goal mg on mg.id=m.goal_id and mg.user_id=f.user_id
    left join goal tg on tg.id=t.goal_id and tg.user_id=f.user_id
    where i.user_id=${userId}::uuid and not i.excluded and f.discarded_at is null
    and i.starts_at <= ${now} and i.starts_at < (${shiftDate(date, 1)}::date::timestamp at time zone ${zone})
    and coalesce(i.ends_at,${now}) > (${shiftDate(date, -29)}::date::timestamp at time zone ${zone})`;
  const days = rows<WorkTimeSnapshot['days'][number]>(
    await db.execute(sql`with base as (${base}), days as (
    select d::date as day, d::date::timestamp at time zone ${zone} as lo,
    (d::date+1)::timestamp at time zone ${zone} as hi
    from generate_series(${shiftDate(date, -29)}::date::timestamp,${date}::date::timestamp,interval '1 day') d)
    select day::text as date, floor(coalesce(sum(case when b.id is null then 0 else greatest(0,extract(epoch from (least(b.ends_at,hi)-greatest(b.starts_at,lo)))) end),0))::double precision as seconds
    from days left join base b on b.starts_at<hi and b.ends_at>lo group by day order by day`),
  );
  const bounds = rows<{ start: string; end: string }>(
    await db.execute(sql`select
    to_char(${date}::date::timestamp at time zone ${zone} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as start,
    to_char((${date}::date+1)::timestamp at time zone ${zone} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as end`),
  )[0]!;
  const activities = rows<WorkTimeSnapshot['activities'][number]>(
    await db.execute(sql`with base as (${base})
    select b.objective||':'||coalesce(b.task_id::text,'')||':'||coalesce(b.project_id::text,'')||':'||coalesce(b.category_id::text,'') as key,
    b.objective, coalesce(c.name,'Uncategorized') as category,
    floor(sum(extract(epoch from (least(b.ends_at,${bounds.end}::timestamptz)-greatest(b.starts_at,${bounds.start}::timestamptz)))))::double precision as seconds,
    bool_or(b.resumed_at is not null and b.ended_at is null and ${now}>=${bounds.start}::timestamptz and ${now}<${bounds.end}::timestamptz) as running,
    bool_or(b.ended_at is null and b.resumed_at is null) as paused
    from base b left join category c on c.id=b.category_id and c.user_id=${userId}::uuid
    where b.starts_at<${bounds.end}::timestamptz and b.ends_at>${bounds.start}::timestamptz
    group by b.objective,b.task_id,b.project_id,b.category_id,c.name order by seconds desc,b.objective`),
  );
  const categories = rows<WorkTimeSnapshot['categories'][number]>(
    await db.execute(sql`with base as (${base})
    select coalesce(c.name,'Uncategorized') as name,
    floor(sum(greatest(0,extract(epoch from (least(b.ends_at,${bounds.end}::timestamptz)-greatest(b.starts_at,(${shiftDate(date, -29)}::date::timestamp at time zone ${zone})))))))::double precision as seconds
    from base b left join category c on c.id=b.category_id and c.user_id=${userId}::uuid
    group by c.id,c.name order by seconds desc`),
  );
  const history = await db
    .select()
    .from(s.focusSessions)
    .where(
      and(
        eq(s.focusSessions.userId, userId),
        sql`${s.focusSessions.startedAt} < ${bounds.end}::timestamptz and coalesce(${s.focusSessions.endedAt},${now}) >= (${shiftDate(date, -29)}::date::timestamp at time zone ${zone})`,
      ),
    )
    .orderBy(desc(s.focusSessions.startedAt), desc(s.focusSessions.id))
    .limit(21);
  return {
    date,
    dayStart: bounds.start,
    dayEnd: bounds.end,
    targetMinutes,
    targetVersion,
    seconds: days[days.length - 1]?.seconds ?? 0,
    days,
    activities,
    categories,
    history: json(history.slice(0, 20)),
    historyLimited: history.length > 20,
  };
}

export async function readWorkSession<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof s>,
  userId: string,
  id: string,
  before?: string,
): Promise<WorkSessionDetail> {
  const [session] = await db
    .select()
    .from(s.focusSessions)
    .where(and(eq(s.focusSessions.id, id), eq(s.focusSessions.userId, userId)));
  if (!session) throw new DirectionNotFound();
  if (before) {
    const [anchor] = await db
      .select()
      .from(s.focusIntervals)
      .where(
        and(
          eq(s.focusIntervals.id, before),
          eq(s.focusIntervals.sessionId, id),
          eq(s.focusIntervals.userId, userId),
        ),
      );
    if (!anchor) throw new DirectionNotFound();
  }
  const intervals = await db
    .select({
      id: s.focusIntervals.id,
      startsAt: s.focusIntervals.startsAt,
      endsAt: s.focusIntervals.endsAt,
      excluded: s.focusIntervals.excluded,
    })
    .from(s.focusIntervals)
    .where(
      and(
        eq(s.focusIntervals.userId, userId),
        eq(s.focusIntervals.sessionId, id),
        before
          ? sql`(${s.focusIntervals.startsAt},${s.focusIntervals.id}) < (select starts_at,id from focus_interval where id=${before}::uuid and user_id=${userId}::uuid and session_id=${id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(s.focusIntervals.startsAt), desc(s.focusIntervals.id))
    .limit(101);
  const changes = await db
    .select()
    .from(s.workTimeChanges)
    .where(and(eq(s.workTimeChanges.userId, userId), eq(s.workTimeChanges.sessionId, id)))
    .orderBy(desc(s.workTimeChanges.createdAt), desc(s.workTimeChanges.id))
    .limit(101);
  return {
    session: json<FocusSession>(session),
    intervals: json(intervals.slice(0, 100)),
    next: intervals.length > 100 ? intervals[99]!.id : null,
    changes: json(changes.slice(0, 100)),
    changesLimited: changes.length > 100,
    ownerId: userId,
  };
}

export async function adjustWorkTime<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof s>,
  userId: string,
  c: Extract<ExecutionCommand, { action: 'work-adjust' }>,
  now: Date,
) {
  // Caller holds app_user FOR UPDATE, shared with every Focus start/control.
  const [prior] = await db
    .select()
    .from(s.focusSessions)
    .where(and(eq(s.focusSessions.id, c.id), eq(s.focusSessions.userId, userId)));
  if (!prior) throw new DirectionNotFound();
  if (prior.version !== c.version || prior.discardedAt) throw new DirectionConflict();
  if (c.operation === 'reset' && prior.endedAt)
    throw new DirectionInvalid('Only unfinished sessions can be reset.');
  if (c.operation === 'confirm' && (!prior.resumedAt || prior.endedAt))
    throw new DirectionConflict();
  const priorMs = elapsedFocusMilliseconds(json<FocusSession>(prior), now);
  let ms = priorMs;
  let resumedAt = prior.resumedAt;
  let intervalBefore: unknown = null,
    intervalAfter: unknown = null;
  if (c.operation === 'correct') {
    const [interval] = await db
      .select()
      .from(s.focusIntervals)
      .where(
        and(
          eq(s.focusIntervals.id, c.intervalId!),
          eq(s.focusIntervals.sessionId, c.id),
          eq(s.focusIntervals.userId, userId),
        ),
      );
    if (!interval || interval.excluded) throw new DirectionNotFound();
    const start = new Date(c.startsAt!),
      end = new Date(c.endsAt!),
      oldEnd = interval.endsAt ?? now;
    // Corrections only trim recorded intervals. They cannot invent missed work or overlap others.
    if (start < interval.startsAt || end > oldEnd || end > now || end < start)
      throw new DirectionInvalid(
        'Keep corrected times inside the recorded interval, with end at or before now.',
      );
    ms = Math.max(
      0,
      priorMs -
        (oldEnd.getTime() - interval.startsAt.getTime() - (end.getTime() - start.getTime())),
    );
    intervalBefore = json(interval);
    intervalAfter = {
      ...json<Record<string, unknown>>(interval),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    };
    await db
      .update(s.focusIntervals)
      .set({ startsAt: start, endsAt: end })
      .where(and(eq(s.focusIntervals.id, interval.id), eq(s.focusIntervals.userId, userId)));
    if (!interval.endsAt) resumedAt = null; // correcting an open tail explicitly pauses this session
  } else if (c.operation === 'reset' || c.operation === 'discard') {
    const intervals = await db
      .select()
      .from(s.focusIntervals)
      .where(and(eq(s.focusIntervals.userId, userId), eq(s.focusIntervals.sessionId, c.id)));
    await db
      .update(s.focusIntervals)
      .set({ endsAt: now })
      .where(
        and(
          eq(s.focusIntervals.userId, userId),
          eq(s.focusIntervals.sessionId, c.id),
          isNull(s.focusIntervals.endsAt),
        ),
      );
    // All excluded rows remain available for audit; no session or interval is deleted.
    intervalBefore = json(intervals);
    await db
      .update(s.focusIntervals)
      .set({ excluded: true })
      .where(and(eq(s.focusIntervals.userId, userId), eq(s.focusIntervals.sessionId, c.id)));
    intervalAfter = { excluded: true };
    ms = 0;
    resumedAt = null;
  }
  const activeMs = resumedAt
    ? Math.max(prior.activeMilliseconds, prior.activeSeconds * 1000) + (ms - priorMs)
    : ms;
  const credit =
    prior.endedAt && prior.creditedMinutes > 0 ? Math.round(ms / 60000) : prior.creditedMinutes;
  const values = {
    activeMilliseconds: activeMs,
    activeSeconds: Math.floor(activeMs / 1000),
    resumedAt,
    endedAt: c.operation === 'discard' ? (prior.endedAt ?? now) : prior.endedAt,
    discardedAt: c.operation === 'discard' ? now : null,
    confirmedAt: now,
    version: prior.version + 1,
    creditedMinutes: credit,
  };
  await db
    .update(s.focusSessions)
    .set(values)
    .where(and(eq(s.focusSessions.userId, userId), eq(s.focusSessions.id, c.id)));
  if (prior.taskId && prior.endedAt && credit !== prior.creditedMinutes)
    await db
      .update(s.tasks)
      .set({
        actualMinutes: sql`greatest(0,coalesce(${s.tasks.actualMinutes},0)+${credit - prior.creditedMinutes})`,
        version: sql`${s.tasks.version}+1`,
      })
      .where(and(eq(s.tasks.userId, userId), eq(s.tasks.id, prior.taskId)));
  await db.insert(s.workTimeChanges).values({
    userId,
    sessionId: c.id,
    kind: c.operation,
    createdAt: now,
    reason: c.reason,
    before: JSON.stringify({ session: json(prior), interval: intervalBefore }),
    after: JSON.stringify({ session: values, interval: intervalAfter }),
  });
  return c.id;
}
