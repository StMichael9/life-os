import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import {
  createDatabase,
  createAuthRepository,
  createDirectionRepository,
  schema,
  DirectionNotFound,
  DirectionConflict,
} from '@life-os/database';
import { createAuthService } from './auth';
import { createDirectionService } from './direction';
import { createDirectionHttp } from './direction-http';
import { createHttpSecurity } from './http-security';
import { AuthenticationRequired } from './index';
import type { SeasonCommand, GoalCommand, ProjectCommand } from '@life-os/validation';

const secret = 'isolated-direction-test-secret-at-least-32-bytes';
const migrationsFolder = fileURLToPath(new URL('../../database/migrations', import.meta.url));
let db: PgDatabase<PgQueryResultHKT, typeof schema>, close: () => Promise<void>;
let service: ReturnType<typeof createDirectionService>, auth: ReturnType<typeof createAuthService>;
let a: string, b: string, aId: string, bId: string, categoryId: string, otherCategory: string;
beforeAll(async () => {
  const url = process.env.LIFE_OS_DIRECTION_TEST_DATABASE_URL;
  if (url) {
    if (!new URL(url).pathname.endsWith('_tests'))
      throw new Error('Direction fixtures require a disposable database ending in _tests.');
    const connection = createDatabase(url);
    db = connection.db;
    close = connection.close;
    await pgMigrate(connection.db, { migrationsFolder });
  } else {
    const pg = new PGlite();
    db = drizzle(pg, { schema });
    close = () => pg.close();
    await pgliteMigrate(drizzle(pg), { migrationsFolder });
  }
}, 30_000);
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await db.execute(sql`truncate app_user cascade`);
  await db.execute(sql`truncate auth_rate_limit`);
  auth = createAuthService(createAuthRepository(db), secret);
  service = createDirectionService(auth, createDirectionRepository(db));
  const password = 'Direction fixture password 123!';
  aId = (await auth.createAccount({ email: 'a@example.test', displayName: 'A', password })).id;
  bId = (await auth.createAccount({ email: 'b@example.test', displayName: 'B', password })).id;
  a = (await auth.login({ email: 'a@example.test', password })).token;
  b = (await auth.login({ email: 'b@example.test', password })).token;
  categoryId = (
    await service.category(a, { id: randomUUID(), name: 'Education', spiritual: false })
  ).id;
  otherCategory = (
    await service.category(b, { id: randomUUID(), name: 'Private B', spiritual: false })
  ).id;
});
const season = (overrides: Partial<SeasonCommand> = {}): SeasonCommand => ({
  id: randomUUID(),
  version: 0,
  name: 'A deliberate season',
  description: 'Focus',
  objective: 'Learn deliberately',
  successCriteria: 'Ship useful evidence',
  startsOn: '2026-10-01',
  endsOn: '2026-12-31',
  status: 'planned',
  allocations: [{ categoryId, percent: 100 }],
  ...overrides,
});
const goal = (overrides: Partial<GoalCommand> = {}): GoalCommand => ({
  id: randomUUID(),
  version: 0,
  title: 'A meaningful goal',
  description: null,
  notes: 'Preserve reasoning',
  categoryId,
  visionId: null,
  targetDate: '2026-12-31',
  status: 'planned',
  priority: 3,
  targetValue: null,
  currentValue: null,
  unit: null,
  ...overrides,
});
const project = (overrides: Partial<ProjectCommand> = {}): ProjectCommand => ({
  id: randomUUID(),
  version: 0,
  title: 'A small project',
  description: null,
  notes: null,
  categoryId,
  goalId: null,
  milestoneId: null,
  status: 'planned',
  startsOn: '2026-10-01',
  targetDate: '2026-12-31',
  ...overrides,
});

describe('Direction transactions and ownership', () => {
  it('requires verified sessions and rejects submitted owners', async () => {
    await expect(service.meta(undefined)).rejects.toThrow(AuthenticationRequired);
    await expect(service.save(a, 'goals', { ...goal(), userId: bId })).rejects.toThrow();
    await auth.logout(a);
    await expect(service.list(a, 'goals')).rejects.toThrow(AuthenticationRequired);
  });
  it('validates allocation totals, duplicates, percentages and real calendar dates', async () => {
    for (const input of [
      season({ allocations: [{ categoryId, percent: 99 }] }),
      season({
        allocations: [
          { categoryId, percent: 50 },
          { categoryId, percent: 50 },
        ],
      }),
      season({ allocations: [{ categoryId, percent: 100.5 }] }),
      season({ startsOn: '2026-02-30' }),
      season({ endsOn: '2026-09-30' }),
    ])
      await expect(service.save(a, 'seasons', input)).rejects.toThrow();
    expect((await service.list(a, 'seasons')).items).toHaveLength(0);
  });
  it('replaces complete allocations atomically and rolls back invalid ownership', async () => {
    const initial = season({ status: 'active' });
    await service.save(a, 'seasons', initial);
    const another = (
      await service.category(a, { id: randomUUID(), name: 'Practice', spiritual: false })
    ).id;
    const edited = await service.save(
      a,
      'seasons',
      {
        ...initial,
        version: 1,
        objective: 'Build evidence',
        allocations: [
          { categoryId, percent: 40 },
          { categoryId: another, percent: 60 },
        ],
      },
      initial.id,
    );
    expect('allocations' in edited && edited.allocations.map((v) => v.percent)).toEqual([60, 40]);
    await expect(
      service.save(
        a,
        'seasons',
        {
          ...initial,
          version: 2,
          name: 'Must not persist',
          allocations: [{ categoryId: otherCategory, percent: 100 }],
        },
        initial.id,
      ),
    ).rejects.toThrow(DirectionNotFound);
    const persisted = await service.detail(a, 'seasons', initial.id);
    expect('name' in persisted.item && persisted.item.name).toBe(initial.name);
    expect(persisted.item.version).toBe(2);
    expect((await service.meta(a)).activeSeason?.id).toBe(initial.id);
  });
  it('serializes concurrent activation and keeps one active Season per owner', async () => {
    const one = season(),
      two = season(),
      bob = season({
        allocations: [{ categoryId: otherCategory, percent: 100 }],
        status: 'active',
      });
    await service.save(a, 'seasons', one);
    await service.save(a, 'seasons', two);
    await service.save(b, 'seasons', bob);
    await Promise.all([
      service.activate(a, one.id, { version: 1 }),
      service.activate(a, two.id, { version: 1 }),
    ]);
    const rows = await service.list(a, 'seasons');
    expect(rows.items.filter((row) => 'status' in row && row.status === 'active')).toHaveLength(1);
    expect((await service.meta(b)).activeSeason?.id).toBe(bob.id);
    const active = (await service.meta(a)).activeSeason!;
    await expect(service.activate(a, active.id, { version: 1 })).rejects.toThrow(DirectionConflict);
  });
  it('archives/completes Seasons and protects stale edits and retry-safe creates', async () => {
    const initial = season({ status: 'active' });
    await service.save(a, 'seasons', initial);
    await service.save(a, 'seasons', initial);
    expect((await service.list(a, 'seasons')).items).toHaveLength(1);
    await expect(service.save(a, 'seasons', { ...initial, name: 'Changed retry' })).rejects.toThrow(
      DirectionConflict,
    );
    await service.save(a, 'seasons', { ...initial, version: 1, status: 'completed' }, initial.id);
    expect((await service.meta(a)).activeSeason).toBeNull();
    await expect(
      service.save(a, 'seasons', { ...initial, version: 1, name: 'Stale' }, initial.id),
    ).rejects.toThrow(DirectionConflict);
    await service.save(a, 'seasons', { ...initial, version: 2, status: 'archived' }, initial.id);
    expect((await service.detail(a, 'seasons', initial.id)).item.version).toBe(3);
  });
  it('supports owned Vision/category links and exact measurable Goal values', async () => {
    const [vision] = await db
      .insert(schema.visions)
      .values({ userId: aId, title: 'Long-term direction' })
      .returning();
    const input = goal({
      visionId: vision!.id,
      targetValue: '12345678901234.1234',
      currentValue: '0',
      unit: 'units',
    });
    const item = await service.save(a, 'goals', input);
    expect('targetValue' in item && item.targetValue).toBe('12345678901234.1234');
    await service.save(a, 'goals', input); // numeric padding does not break create replay
    expect((await service.detail(a, 'goals', input.id)).ancestors[0]!.title).toBe(
      'Long-term direction',
    );
    await expect(
      service.save(b, 'goals', goal({ categoryId: otherCategory, visionId: vision!.id })),
    ).rejects.toThrow(DirectionNotFound);
    await expect(service.save(a, 'goals', goal({ targetValue: '1' }))).rejects.toThrow();
  });
  it('creates/edits/completes milestones and resolves single-parent Project hierarchy', async () => {
    const parent = goal();
    await service.save(a, 'goals', parent);
    const milestone = {
      id: randomUUID(),
      version: 0,
      goalId: parent.id,
      title: 'Useful evidence',
      targetDate: '2026-11-30',
      completed: false,
    };
    await service.save(a, 'milestones', milestone);
    await service.save(
      a,
      'milestones',
      { ...milestone, version: 1, completed: true },
      milestone.id,
    );
    const item = (await service.detail(a, 'milestones', milestone.id)).item;
    expect('completedAt' in item && item.completedAt).not.toBeNull();
    const direct = project({ goalId: parent.id }),
      child = project({ milestoneId: milestone.id });
    await service.save(a, 'projects', direct);
    await service.save(a, 'projects', child);
    expect((await service.detail(a, 'projects', child.id)).ancestors.map((v) => v.kind)).toEqual([
      'goal',
      'milestone',
    ]);
    await expect(
      service.save(a, 'projects', project({ goalId: parent.id, milestoneId: milestone.id })),
    ).rejects.toThrow();
    await expect(
      db
        .insert(schema.projects)
        .values({ userId: aId, title: 'DB bypass', goalId: parent.id, milestoneId: milestone.id }),
    ).rejects.toThrow();
    await service.save(
      a,
      'projects',
      {
        ...child,
        version: 1,
        milestoneId: null,
        goalId: parent.id,
        notes: 'Reparented explicitly',
      },
      child.id,
    );
    expect((await service.detail(a, 'projects', child.id)).ancestors.map((v) => v.kind)).toEqual([
      'goal',
    ]);
  });
  it('rejects cross-user reads, edits, cursors, filters and all parent links', async () => {
    const parent = goal();
    await service.save(a, 'goals', parent);
    const m = {
      id: randomUUID(),
      version: 0,
      goalId: parent.id,
      title: 'Private milestone',
      targetDate: null,
      completed: false,
    };
    await service.save(a, 'milestones', m);
    const p = project({ milestoneId: m.id });
    await service.save(a, 'projects', p);
    const s = season();
    await service.save(a, 'seasons', s);
    for (const [resource, input] of [
      ['seasons', s],
      ['goals', parent],
      ['milestones', m],
      ['projects', p],
    ] as const) {
      await expect(service.detail(b, resource, input.id)).rejects.toThrow(DirectionNotFound);
      await expect(service.save(b, resource, { ...input, version: 1 }, input.id)).rejects.toThrow(
        DirectionNotFound,
      );
      await expect(service.list(b, resource, input.id)).rejects.toThrow(DirectionNotFound);
    }
    await expect(service.activate(b, s.id, { version: 1 })).rejects.toThrow(DirectionNotFound);
    await expect(service.list(b, 'milestones', undefined, parent.id)).rejects.toThrow(
      DirectionNotFound,
    );
    await expect(service.save(b, 'milestones', { ...m, id: randomUUID() })).rejects.toThrow(
      DirectionNotFound,
    );
    await expect(
      service.save(b, 'projects', project({ categoryId: otherCategory, milestoneId: m.id })),
    ).rejects.toThrow(DirectionNotFound);
    await expect(
      service.save(b, 'projects', project({ categoryId: otherCategory, goalId: parent.id })),
    ).rejects.toThrow(DirectionNotFound);
    expect((await service.meta(b)).categories.map((c) => c.id)).toEqual([otherCategory]);
  });
  it('paginates without losing rows at microsecond boundaries', async () => {
    await db
      .insert(schema.goals)
      .values(Array.from({ length: 57 }, (_, index) => ({ userId: aId, title: `Goal ${index}` })));
    await db.execute(
      sql`update goal set created_at = '2026-10-01T10:00:00.000001Z'::timestamptz + (split_part(title, ' ', 2)::int * interval '1 microsecond') where user_id = ${aId}`,
    );
    const first = await service.list(a, 'goals');
    const second = await service.list(a, 'goals', first.nextCursor);
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(7);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(57);
    expect(second.nextCursor).toBeNull();
  });
  it('preserves notes and dates during edits and rejects project date inversions', async () => {
    const input = goal();
    await service.save(a, 'goals', input);
    await service.save(
      a,
      'goals',
      {
        ...input,
        version: 1,
        title: 'Refined direction',
        notes: 'Reasons still matter',
        priority: 5,
        status: 'active',
      },
      input.id,
    );
    const updated = (await service.detail(a, 'goals', input.id)).item;
    expect('notes' in updated && updated.notes).toBe('Reasons still matter');
    expect('targetDate' in updated && updated.targetDate).toBe(input.targetDate);
    await expect(
      service.save(a, 'projects', project({ startsOn: '2026-12-31', targetDate: '2026-01-01' })),
    ).rejects.toThrow();
    expect(await db.select().from(schema.tasks)).toHaveLength(0);
  });
});

it.runIf(!!process.env.LIFE_OS_DIRECTION_TEST_DATABASE_URL)(
  'works under restricted runtime grants and cannot create accounts or tables',
  async () => {
    const role = `direction_fixture_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const identifier = sql.identifier(role);
    await db.execute(sql`create role ${identifier} nologin`);
    try {
      await db.execute(sql`grant usage on schema public to ${identifier}`);
      await db.execute(sql`grant select on app_user, auth_credential, vision to ${identifier}`);
      // PostgreSQL requires an UPDATE privilege to SELECT a user row FOR UPDATE.
      await db.execute(sql`grant update(id) on app_user to ${identifier}`);
      await db.execute(
        sql`grant select, insert, update on auth_session, season, goal, milestone, project to ${identifier}`,
      );
      await db.execute(
        sql`grant select, insert, update, delete on auth_rate_limit to ${identifier}`,
      );
      await db.execute(sql`grant select, insert on category to ${identifier}`);
      await db.execute(sql`grant select, insert, delete on season_allocation to ${identifier}`);
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local role ${identifier}`);
        const restricted = createDirectionService(
          createAuthService(createAuthRepository(tx), secret),
          createDirectionRepository(tx),
        );
        const input = season({ status: 'active' });
        await restricted.save(a, 'seasons', input);
        expect((await restricted.activeSeason(a)).activeSeason?.id).toBe(input.id);
        await restricted.save(a, 'goals', goal());
        expect((await restricted.list(b, 'goals')).items).toHaveLength(0);
      });
      for (const statement of [
        sql`insert into app_user(email,display_name) values('forbidden@example.test','Forbidden')`,
        sql`create table forbidden_direction_fixture(id integer)`,
      ]) {
        await expect(
          db.transaction(async (tx) => {
            await tx.execute(sql`set local role ${identifier}`);
            await tx.execute(statement);
          }),
        ).rejects.toThrow();
      }
    } finally {
      await db.execute(sql`drop owned by ${identifier}`);
      await db.execute(sql`drop role ${identifier}`);
    }
  },
);

describe('authenticated Direction HTTP', () => {
  it('binds Direction read responses and draft preconditions to the verified account', async () => {
    expect((await service.meta(a)).ownerId).toBe(aId);
    expect((await service.activeSeason(b)).ownerId).toBe(bId);
    await expect(
      service.save(b, 'goals', goal({ categoryId: otherCategory }), undefined, aId),
    ).rejects.toThrow(AuthenticationRequired);
    await expect(
      service.category(b, { id: randomUUID(), name: 'Earlier draft', spiritual: false }, aId),
    ).rejects.toThrow(AuthenticationRequired);
    expect((await service.list(b, 'goals')).items).toHaveLength(0);
    const origin = 'https://life.example.test',
      security = createHttpSecurity(origin, secret);
    const csrf = security.issueCsrf(new Request(origin)).token;
    const http = createDirectionHttp(service, security);
    const response = await http(
      new Request(origin, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
          'X-Life-OS-Account': aId,
          Cookie: `__Host-life_os_session=${b}; __Host-life_os_csrf=${csrf}`,
        },
        body: JSON.stringify(goal({ categoryId: otherCategory })),
      }),
      ['goals'],
    );
    expect(response.status).toBe(401);
  });
  it('enforces CSRF and versioned CRUD while keeping ownership private', async () => {
    const origin = 'https://life.example.test';
    const security = createHttpSecurity(origin, secret);
    const http = createDirectionHttp(service, security);
    const csrf = security.issueCsrf(new Request(origin)).token;
    const headers = {
      Origin: origin,
      Cookie: `__Host-life_os_session=${a}; __Host-life_os_csrf=${csrf}`,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
    };
    const input = goal();
    const create = await http(
      new Request(`${origin}/api/direction/goals`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      }),
      ['goals'],
    );
    expect(create.status).toBe(201);
    expect(create.headers.get('Cache-Control')).toContain('no-store');
    expect((await create.json()).item).not.toHaveProperty('userId');
    const update = await http(
      new Request(`${origin}/api/direction/goals/${input.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...input, version: 1, status: 'archived' }),
      }),
      ['goals', input.id],
    );
    expect(update.status).toBe(200);
    const stale = await http(
      new Request(origin, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...input, version: 1 }),
      }),
      ['goals', input.id],
    );
    expect(stale.status).toBe(409);
    const blocked = await http(
      new Request(origin, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://evil.test' },
        body: JSON.stringify(goal()),
      }),
      ['goals'],
    );
    expect(blocked.status).toBe(403);
    expect(
      (await http(new Request(`${origin}?userId=${bId}`, { headers }), ['goals'])).status,
    ).toBe(400);
    expect((await http(new Request(origin), ['goals'])).status).toBe(401);
    expect(
      (await http(new Request(origin, { method: 'DELETE', headers }), ['goals', input.id])).status,
    ).toBe(405);
    expect(
      (
        await http(
          new Request(origin, { headers: { ...headers, Cookie: `__Host-life_os_session=${b}` } }),
          ['goals', input.id],
        )
      ).status,
    ).toBe(404);
    expect(
      (await db.select().from(schema.goals).where(eq(schema.goals.id, input.id)))[0]!.status,
    ).toBe('archived');
  });
});
