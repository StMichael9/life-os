import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate as liteMigrate } from 'drizzle-orm/pglite/migrator';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { sql, eq } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { randomUUID as id } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  createDatabase,
  createAuthRepository,
  createExecutionRepository,
  schema as s,
  DirectionNotFound,
  DirectionConflict,
} from '@life-os/database';
import { createAuthService } from './auth';
import { createExecutionService, createExecutionHttp } from './execution';
import { createHttpSecurity } from './http-security';
import { AuthenticationRequired } from './index';
import { emptyReflection } from '@life-os/shared';
const secret = 'execution-fixture-secret-at-least-32-bytes',
  folder = fileURLToPath(new URL('../../database/migrations', import.meta.url));
let db: PgDatabase<PgQueryResultHKT, typeof s>,
  close: () => Promise<void>,
  auth: ReturnType<typeof createAuthService>,
  service: ReturnType<typeof createExecutionService>;
let a: string, b: string, aid: string, bid: string, task: string, foreign: string;
beforeAll(async () => {
  const url = process.env.LIFE_OS_EXECUTION_TEST_DATABASE_URL;
  if (url) {
    if (!new URL(url).pathname.endsWith('_tests'))
      throw new Error('Disposable _tests database required.');
    const c = createDatabase(url);
    db = c.db;
    close = c.close;
    await pgMigrate(c.db, { migrationsFolder: folder });
  } else {
    const c = new PGlite();
    db = drizzle(c, { schema: s });
    close = () => c.close();
    await liteMigrate(drizzle(c), { migrationsFolder: folder });
  }
}, 30000);
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  vi.useRealTimers();
  await db.execute(sql`truncate app_user cascade`);
  await db.execute(sql`truncate auth_rate_limit`);
  auth = createAuthService(createAuthRepository(db), secret);
  service = createExecutionService(auth, createExecutionRepository(db));
  const password = 'Execution fixture password 123!';
  aid = (
    await auth.createAccount({
      email: 'a@execution.test',
      password,
      displayName: 'A',
      timeZone: 'America/Los_Angeles',
    })
  ).id;
  bid = (
    await auth.createAccount({
      email: 'b@execution.test',
      password,
      displayName: 'B',
      timeZone: 'UTC',
    })
  ).id;
  a = (await auth.login({ email: 'a@execution.test', password })).token;
  b = (await auth.login({ email: 'b@execution.test', password })).token;
  task = id();
  foreign = id();
  await db.insert(s.tasks).values([
    {
      id: task,
      userId: aid,
      title: 'Important work',
      status: 'planned',
      estimateMinutes: 50,
      impact: 5,
    },
    { id: foreign, userId: bid, title: 'Private B', status: 'planned' },
  ]);
});
const plan = (patch: Record<string, unknown> = {}) => ({
  action: 'plan',
  requestId: id(),
  date: '2026-10-08',
  version: 0,
  oneThing: 'Deliver useful work',
  outcomes: [{ outcome: 'An intentional result', taskId: task, completed: false }],
  workflow: 'save',
  reflection: emptyReflection,
  ...patch,
});
const block = (patch: Record<string, unknown> = {}) => ({
  action: 'schedule',
  requestId: id(),
  id: id(),
  version: 0,
  title: 'Protected work',
  kind: 'task',
  taskId: task,
  startsAt: '2026-10-08T09:00:00-07:00',
  endsAt: '2026-10-08T10:00:00-07:00',
  remove: false,
  ...patch,
});
const start = (patch: Record<string, unknown> = {}) => ({
  action: 'focus-start',
  requestId: id(),
  id: id(),
  objective: 'Write the result',
  taskId: task,
  projectId: null,
  categoryId: null,
  plannedMinutes: 50,
  ...patch,
});
const routine = (patch: Record<string, unknown> = {}) => ({
  action: 'routine',
  requestId: id(),
  id: id(),
  version: 0,
  title: 'Morning planning',
  notes: 'Keep it simple',
  days: [0, 1, 2, 3, 4, 5, 6],
  spiritual: false,
  archived: false,
  ...patch,
});
const vault = (patch: Record<string, unknown> = {}) => ({
  action: 'vault',
  requestId: id(),
  id: id(),
  version: 0,
  title: 'A future idea',
  body: 'Protect the original context.',
  kind: 'not_now',
  archived: false,
  sourceInboxId: null,
  ...patch,
});
describe('authenticated daily execution', () => {
  it('fails closed and rejects supplied ownership, invalid dates and oversized Big 3', async () => {
    await expect(service.today(undefined, {})).rejects.toBeInstanceOf(AuthenticationRequired);
    await expect(service.mutate(a, { ...plan(), userId: bid })).rejects.toThrow();
    await expect(service.mutate(a, plan({ date: '2026-02-30' }))).rejects.toThrow();
    // Promoted Vault titles must remain editable under Task/Goal/Project schemas.
    await expect(service.mutate(a, vault({ title: 'x'.repeat(201) }))).rejects.toThrow();
    await expect(
      service.mutate(
        a,
        plan({
          outcomes: Array.from({ length: 4 }, () => ({
            outcome: 'Too many',
            taskId: null,
            completed: false,
          })),
        }),
      ),
    ).rejects.toThrow();
    await expect(service.mutate(a, plan(), bid)).rejects.toBeInstanceOf(AuthenticationRequired);
  });
  it('persists One Thing and atomic Big 3, exact retries and stale-write protection', async () => {
    const c = plan();
    const r = await service.mutate(a, c);
    expect(await service.mutate(a, c)).toEqual(r);
    let d = await service.today(a, { date: c.date });
    expect(d.plan?.oneThing).toBe(c.oneThing);
    expect(d.plan?.outcomes).toHaveLength(1);
    await expect(service.mutate(a, { ...c, oneThing: 'Changed retry' })).rejects.toBeInstanceOf(
      DirectionConflict,
    );
    await expect(
      service.mutate(
        a,
        plan({ version: 1, outcomes: [{ outcome: 'Foreign', taskId: foreign, completed: false }] }),
      ),
    ).rejects.toBeInstanceOf(DirectionNotFound);
    expect((await service.today(a, { date: c.date })).plan?.version).toBe(1);
    await service.mutate(
      a,
      plan({
        version: 1,
        outcomes: [{ outcome: 'A distinct outcome', taskId: null, completed: true }],
      }),
    );
    d = await service.today(a, { date: c.date });
    expect(d.plan?.outcomes[0]?.completedAt).not.toBeNull();
    expect(d.plan?.version).toBe(2);
    await expect(service.mutate(a, plan({ version: 1 }))).rejects.toBeInstanceOf(DirectionConflict);
    expect((await service.today(b, { date: c.date })).plan).toBeNull();
  });
  it('retains selected completed Tasks when Today reaches its recommendation candidate bound', async () => {
    await db.update(s.tasks).set({ status: 'completed' }).where(eq(s.tasks.id, task));
    await db.insert(s.tasks).values(
      Array.from({ length: 201 }, (_, i) => ({
        id: id(),
        userId: aid,
        title: 'Candidate ' + i,
        status: 'planned' as const,
        estimateMinutes: 25,
      })),
    );
    const c = plan();
    await service.mutate(a, c);
    const d = await service.today(a, { date: c.date });
    expect(d.limits.tasks).toBe(true);
    expect(d.tasks).toHaveLength(201);
    expect(d.tasks.find((t) => t.id === task)?.status).toBe('completed');
    expect(d.plan?.outcomes[0]?.taskId).toBe(task);
    expect(d.recommendations.some((r) => r.id === task)).toBe(false);
    expect((await service.today(b, { date: c.date })).tasks.some((t) => t.id === task)).toBe(false);
  });
  it('Start / Close / Reopen stores private reflections without changing completion history', async () => {
    await expect(service.mutate(a, plan({ workflow: 'close' }))).rejects.toThrow();
    await service.mutate(
      a,
      plan({ workflow: 'start', reflection: { ...emptyReflection, gratitude: 'A quiet morning' } }),
    );
    await service.mutate(
      a,
      plan({
        version: 1,
        workflow: 'close',
        reflection: {
          ...emptyReflection,
          learned: 'Protect attention',
          prayer: 'Private reflection',
        },
      }),
    );
    const d = await service.today(a, { date: '2026-10-08' });
    expect(d.plan?.morning.gratitude).toBe('A quiet morning');
    expect(d.plan?.evening.prayer).toBe('Private reflection');
    expect(d.plan?.closedAt).not.toBeNull();
    await expect(service.mutate(a, plan({ version: 2 }))).rejects.toThrow(/Reopen/);
    await service.mutate(a, plan({ version: 2, workflow: 'reopen' }));
    expect((await service.today(a, { date: '2026-10-08' })).plan?.closedAt).toBeNull();
  });
  it('uses account local days and DST-length days for counts and cross-midnight schedule', async () => {
    await db
      .update(s.tasks)
      .set({ status: 'completed', completedAt: new Date('2026-11-02T07:30:00Z') })
      .where(eq(s.tasks.id, task));
    await service.mutate(
      a,
      block({ startsAt: '2026-11-01T23:30:00-08:00', endsAt: '2026-11-02T00:30:00-08:00' }),
    );
    const d = await service.today(a, { date: '2026-11-01' });
    expect(d.snapshot.completedTasks).toBe(1);
    expect(d.schedule).toHaveLength(1);
    expect(d.snapshot.scheduledMinutes).toBe(30);
    expect(d.content.date).toBe('2026-11-01');
    expect((await service.today(a, { date: '2026-11-02' })).schedule).toHaveLength(1);
    expect((await service.today(a, { date: '2026-11-02' })).snapshot.scheduledMinutes).toBe(30);
    expect((await service.today(b, { date: '2026-11-01' })).snapshot.scheduledMinutes).toBe(0);
    await service.mutate(
      a,
      block({
        startsAt: '2026-03-08T00:00:00-08:00',
        endsAt: '2026-03-09T00:00:00-07:00',
      }),
    );
    expect((await service.today(a, { date: '2026-03-08' })).snapshot.scheduledMinutes).toBe(
      23 * 60,
    );
    expect((await service.today(a, { date: '2026-03-09' })).snapshot.scheduledMinutes).toBe(0);
  });
  it('creates / edits / removes blocks, rejects overlap and foreign task links', async () => {
    const c = block();
    await service.mutate(a, c);
    await expect(service.mutate(a, block())).rejects.toThrow(/overlaps/);
    await expect(service.mutate(b, { ...c, requestId: id(), version: 1 })).rejects.toBeInstanceOf(
      DirectionNotFound,
    );
    await expect(service.mutate(a, block({ taskId: foreign }))).rejects.toBeInstanceOf(
      DirectionNotFound,
    );
    await service.mutate(a, { ...c, requestId: id(), version: 1, title: 'Edited' });
    await service.mutate(a, { ...c, requestId: id(), version: 2, remove: true });
    expect((await service.today(a, { date: '2026-10-08' })).schedule).toEqual([]);
  });
  it('keeps one open Focus, restores pause / resume, records actual minutes exactly once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const initial = Date.now();
    vi.setSystemTime(initial);
    const c = start();
    await service.mutate(a, c);
    await expect(service.mutate(a, start())).rejects.toBeInstanceOf(DirectionConflict);
    vi.setSystemTime(initial + 125000);
    const control = {
      action: 'focus-control',
      requestId: id(),
      id: c.id,
      version: 1,
      operation: 'pause',
      outcome: '',
      notes: '',
    };
    await service.mutate(a, control);
    expect((await service.today(a, {})).focus?.activeSeconds).toBe(125);
    vi.setSystemTime(initial + 300000);
    await service.mutate(a, { ...control, requestId: id(), version: 2, operation: 'resume' });
    vi.setSystemTime(initial + 365000);
    const finish = {
      ...control,
      requestId: id(),
      version: 3,
      operation: 'finish',
      outcome: 'Useful progress',
      notes: 'Remember this',
    };
    await service.mutate(a, finish);
    await service.mutate(a, finish);
    const [row] = await db.select().from(s.tasks).where(eq(s.tasks.id, task));
    expect(row?.actualMinutes).toBe(3);
    expect(row?.version).toBe(2);
    expect((await service.today(a, {})).focus).toBeNull();
    vi.useRealTimers();
  });
  it('rejects foreign Focus reads through aggregation, controls and project/category parents', async () => {
    const c = start();
    await service.mutate(a, c);
    expect((await service.today(b, {})).focus).toBeNull();
    await expect(
      service.mutate(b, {
        action: 'focus-control',
        requestId: id(),
        id: c.id,
        version: 1,
        operation: 'finish',
        outcome: '',
        notes: '',
      }),
    ).rejects.toBeInstanceOf(DirectionNotFound);
    await expect(service.mutate(a, start({ taskId: foreign }))).rejects.toBeInstanceOf(
      DirectionNotFound,
    );
  });
  it('stores recurring completion on local day, reopens it and preserves archived history', async () => {
    const c = routine();
    await service.mutate(a, c);
    const check = {
      action: 'routine-check',
      requestId: id(),
      id: c.id,
      date: '2026-10-08',
      completed: true,
      notes: 'Kept the promise',
    };
    await service.mutate(a, check);
    await service.mutate(a, check);
    expect((await service.today(a, { date: check.date })).routines[0]?.completed).toBe(true);
    expect((await service.today(a, { date: '2026-10-09' })).routines[0]?.completed).toBe(false);
    await expect(service.mutate(b, { ...check, requestId: id() })).rejects.toBeInstanceOf(
      DirectionNotFound,
    );
    await service.mutate(a, { ...check, requestId: id(), completed: false });
    expect((await service.today(a, { date: check.date })).routines[0]?.completed).toBe(false);
    await service.mutate(a, { ...c, requestId: id(), version: 1, archived: true });
    expect((await service.today(a, { date: check.date })).routines).toEqual([]);
  });
  it('moves captures into Vault atomically, retries safely and promotes once into Tasks', async () => {
    const source = id();
    await db.insert(s.inboxItems).values({ id: source, userId: aid, body: 'Original capture' });
    const c = vault({ sourceInboxId: source });
    await service.mutate(a, c);
    await service.mutate(a, c);
    expect((await service.vault(a, {})).items).toHaveLength(1);
    expect((await service.today(a, {})).snapshot.inboxCount).toBe(0);
    const [original] = await db.select().from(s.inboxItems).where(eq(s.inboxItems.id, source));
    expect(original?.body).toBe('Original capture');
    await expect(service.mutate(b, vault({ sourceInboxId: source }))).rejects.toBeInstanceOf(
      DirectionNotFound,
    );
    const convert = { action: 'vault-task', requestId: id(), id: c.id, version: 1, taskId: id() };
    await service.mutate(a, convert);
    await service.mutate(a, convert);
    expect((await service.vault(a, { archived: 'true' })).items[0]?.convertedTaskId).toBe(
      convert.taskId,
    );
    expect((await service.vault(b, {})).items).toEqual([]);
  });
  it('searches owned Tasks / Goals / Projects / Vault, with literal wildcards', async () => {
    await service.mutate(a, vault({ title: 'Important idea' }));
    const r = await service.search(a, { q: 'Important' });
    expect(r.items).toHaveLength(2);
    expect((await service.search(b, { q: 'Important' })).items).toEqual([]);
    expect((await service.search(a, { q: '%' })).items).toEqual([]);
    await expect(service.search(a, { q: 'x', userId: bid })).rejects.toThrow();
  });
  it('ranks stored tasks and active allocations, excludes reflective work, reports real evidence', async () => {
    const cat = id(),
      faith = id(),
      season = id();
    await db.insert(s.categories).values([
      { id: cat, userId: aid, slug: 'work', name: 'Work' },
      { id: faith, userId: aid, slug: 'faith', name: 'Faith', spiritual: true },
    ]);
    await db.insert(s.seasons).values({
      id: season,
      userId: aid,
      name: 'Build',
      objective: 'Finish',
      startsOn: '2026-01-01',
      endsOn: '2026-12-31',
      status: 'active',
    });
    await db
      .insert(s.seasonAllocations)
      .values({ userId: aid, seasonId: season, categoryId: cat, percent: 100 });
    await db.update(s.tasks).set({ categoryId: cat }).where(eq(s.tasks.id, task));
    await db.insert(s.tasks).values({
      userId: aid,
      title: 'Faith practice',
      categoryId: faith,
      estimateMinutes: 25,
      status: 'planned',
      impact: 5,
    });
    const d = await service.today(a, {});
    expect(d.recommendations).toHaveLength(1);
    expect(d.recommendations[0]?.reasons).toContain('A major allocation in your active Season');
    expect(d.snapshot.completedTasks).toBe(0);
    expect((await service.today(a, { availableMinutes: 25 })).recommendations).toEqual([]);
  });
  it('HTTP preserves CSRF, no-store, verified owner stamps and logout revocation', async () => {
    const security = createHttpSecurity('http://localhost:3000', secret, true),
      http = createExecutionHttp(service, security),
      cookie = security.sessionCookie(a, new Date(Date.now() + 3600000)).split(';')[0]!;
    const get = await http(
      new Request('http://localhost:3000/api/execution/today', { headers: { Cookie: cookie } }),
      ['today'],
    );
    expect(get.status).toBe(200);
    expect(get.headers.get('Cache-Control')).toBe('private, no-store');
    expect((await get.json()).ownerId).toBe(aid);
    const blocked = await http(
      new Request('http://localhost:3000/api/execution', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify(plan()),
      }),
    );
    expect(blocked.status).toBe(403);
    const csrf = security.issueCsrf(new Request('http://localhost:3000')),
      headers = {
        Cookie: cookie + '; ' + csrf.cookie!.split(';')[0],
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        'X-CSRF-Token': csrf.token,
        'X-Life-OS-Account': bid,
      };
    expect(
      (
        await http(
          new Request('http://localhost:3000/api/execution', {
            method: 'POST',
            headers,
            body: JSON.stringify(plan()),
          }),
        )
      ).status,
    ).toBe(401);
    await auth.logout(a);
    expect(
      (
        await http(
          new Request('http://localhost:3000/api/execution/today', { headers: { Cookie: cookie } }),
          ['today'],
        )
      ).status,
    ).toBe(401);
  });
  it('serializes concurrent Big 3 replacements and same-owner mutation retries', async () => {
    const c = plan();
    const results = await Promise.all([service.mutate(a, c), service.mutate(a, c)]);
    expect(results[0]).toEqual(results[1]);
    const edits = await Promise.allSettled([
      service.mutate(a, plan({ version: 1, oneThing: 'One' })),
      service.mutate(a, plan({ version: 1, oneThing: 'Two' })),
    ]);
    expect(edits.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await service.today(a, { date: c.date })).plan?.version).toBe(2);
  });
});

it('splits Focus intervals across midnight and excludes paused time from daily metrics', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const initial = Date.parse('2026-10-09T06:58:30Z');
  vi.setSystemTime(initial);
  const c = start();
  await service.mutate(a, c);
  vi.setSystemTime(initial + 90000);
  const pause = {
    action: 'focus-control',
    requestId: id(),
    id: c.id,
    version: 1,
    operation: 'pause',
    outcome: '',
    notes: '',
  };
  await service.mutate(a, pause);
  vi.setSystemTime(initial + 390000);
  await service.mutate(a, { ...pause, requestId: id(), version: 2, operation: 'resume' });
  vi.setSystemTime(initial + 490000);
  await service.mutate(a, { ...pause, requestId: id(), version: 3, operation: 'finish' });
  expect((await service.today(a, { date: '2026-10-08' })).snapshot.focusSeconds).toBe(90);
  expect((await service.today(a, { date: '2026-10-09' })).snapshot.focusSeconds).toBe(100);
  vi.useRealTimers();
});
it('preserves Vault provenance on promotion to Goal / Project and rejects foreign promotion', async () => {
  for (const target of ['goal', 'project'] as const) {
    const c = vault();
    await service.mutate(a, c);
    const p = {
      action: 'vault-promote',
      requestId: id(),
      id: c.id,
      version: 1,
      target,
      targetId: id(),
    };
    await expect(service.mutate(b, p)).rejects.toBeInstanceOf(DirectionNotFound);
    await service.mutate(a, p);
    await service.mutate(a, p);
    const row = (await service.vault(a, { archived: 'true' })).items.find((r) => r.id === c.id)!;
    expect(target === 'goal' ? row.convertedGoalId : row.convertedProjectId).toBe(p.targetId);
    await expect(
      service.mutate(a, {
        action: 'vault-task',
        requestId: id(),
        id: c.id,
        version: 2,
        taskId: id(),
      }),
    ).rejects.toBeInstanceOf(DirectionConflict);
  }
});
it('paginates Vault using SQL timestamp precision and rejects foreign cursors', async () => {
  const rows = Array.from({ length: 57 }, (_, i) => ({
    id: id(),
    userId: aid,
    title: 'Historical ' + i,
    body: 'Context',
    kind: 'idea',
  }));
  await db.insert(s.vaultItems).values(rows);
  const first = await service.vault(a, {});
  expect(first.items).toHaveLength(50);
  const second = await service.vault(a, { before: first.next });
  expect(second.items).toHaveLength(7);
  expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(57);
  await expect(service.vault(b, { before: first.next })).rejects.toBeInstanceOf(DirectionNotFound);
});
it.skipIf(!process.env.LIFE_OS_EXECUTION_TEST_DATABASE_URL)(
  'executes daily workflows with restricted runtime grants and denies foreign links / DDL',
  async () => {
    const role = 'life_os_execution_' + id().replaceAll('-', '');
    await db.execute(sql.raw(`CREATE ROLE ${role} NOLOGIN`));
    try {
      await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
      await db.execute(
        sql.raw(
          `GRANT SELECT ON app_user,category,season,season_allocation,goal,milestone,project,vision,inbox_item TO ${role}`,
        ),
      );
      await db.execute(sql.raw(`GRANT UPDATE(id) ON app_user TO ${role}`));
      await db.execute(sql.raw(`GRANT UPDATE(processed_at) ON inbox_item TO ${role}`));
      await db.execute(sql.raw(`GRANT SELECT,UPDATE ON auth_session,task TO ${role}`));
      await db.execute(sql.raw(`GRANT INSERT ON task,goal,project TO ${role}`));
      await db.execute(
        sql.raw(
          `GRANT SELECT,INSERT,UPDATE ON daily_plan,daily_big_three,schedule_block,focus_session,focus_interval,routine,routine_completion,vault_item TO ${role}`,
        ),
      );
      await db.execute(
        sql.raw(`GRANT DELETE ON daily_big_three,schedule_block,routine_completion TO ${role}`),
      );
      await db.execute(sql.raw(`GRANT SELECT,INSERT ON execution_receipt TO ${role}`));
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        const repo = createExecutionRepository(tx);
        await repo.mutate(aid, plan() as Parameters<typeof repo.mutate>[1]);
        const focusInput = start();
        await repo.mutate(aid, focusInput as Parameters<typeof repo.mutate>[1]);
        expect((await repo.today(aid, '2026-10-08')).plan?.oneThing).toBe('Deliver useful work');
        await expect(
          repo.mutate(bid, {
            action: 'focus-control',
            requestId: id(),
            id: focusInput.id,
            version: 1,
            operation: 'pause',
            outcome: '',
            notes: '',
          }),
        ).rejects.toBeInstanceOf(DirectionNotFound);
      });
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
          await tx.execute(sql`delete from app_user`);
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
          await tx.execute(sql.raw('CREATE TABLE execution_forbidden(id int)'));
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    } finally {
      await db.execute(sql.raw(`DROP OWNED BY ${role}`));
      await db.execute(sql.raw(`DROP ROLE ${role}`));
    }
  },
);

it('saves bundled daily content without duplicate favorites and searches the Phase 1 catalog', async () => {
  const content = vault({
    kind: 'scripture',
    title: 'Proverbs 16:3 (KJV)',
    body: 'Commit thy works unto the LORD.',
  });
  const first = await service.mutate(a, content);
  const second = await service.mutate(a, { ...content, requestId: id(), id: id() });
  expect(second).toEqual(first);
  const c = routine({ title: 'Unique recurring planning' });
  await service.mutate(a, c);
  await db.insert(s.inboxItems).values({ userId: aid, body: 'Unique captured research' });
  expect((await service.search(a, { q: 'Unique' })).items.map((i) => i.area).sort()).toEqual([
    'inbox',
    'routines',
  ]);
  expect((await service.search(b, { q: 'Unique' })).items).toEqual([]);
  await expect(service.vaultDetail(b, first.id)).rejects.toBeInstanceOf(DirectionNotFound);
});

it('scopes mutation retry keys by owner so accounts may independently reuse a UUID', async () => {
  const requestId = id();
  await service.mutate(a, plan({ requestId, outcomes: [] }));
  await service.mutate(b, plan({ requestId, oneThing: 'B intention', outcomes: [] }));
  expect((await service.today(a, { date: '2026-10-08' })).plan?.oneThing).toBe(
    'Deliver useful work',
  );
  expect((await service.today(b, { date: '2026-10-08' })).plan?.oneThing).toBe('B intention');
});

it('keeps archived routine completion evidence visible and restores the definition explicitly', async () => {
  const c = routine();
  await service.mutate(a, c);
  await service.mutate(a, {
    action: 'routine-check',
    requestId: id(),
    id: c.id,
    date: '2026-10-08',
    completed: true,
    notes: 'A kept promise',
  });
  await service.mutate(a, { ...c, requestId: id(), version: 1, archived: true });
  const d = await service.today(a, { date: '2026-10-08' });
  expect(d.routines[0]).toMatchObject({
    archived: true,
    completed: true,
    scheduled: false,
    completionNotes: 'A kept promise',
  });
  await service.mutate(a, { ...c, requestId: id(), version: 2, archived: false });
  expect((await service.today(a, { date: '2026-10-08' })).routines[0]?.scheduled).toBe(true);
});
