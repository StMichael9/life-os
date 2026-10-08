import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import { sql, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import {
  createDatabase,
  createAuthRepository,
  createInboxRepository,
  createDirectionRepository,
  createTaskRepository,
  schema,
  DirectionConflict,
  DirectionNotFound,
} from '@life-os/database';
import type { TaskCommand } from '@life-os/validation';
import { createAuthService } from './auth';
import { createTaskService } from './tasks';
import { createTaskHttp } from './tasks-http';
import { createHttpSecurity } from './http-security';
import { AuthenticationRequired } from './index';
const secret = 'isolated-tasks-test-secret-at-least-32-bytes';
const migrationsFolder = fileURLToPath(new URL('../../database/migrations', import.meta.url));
let db: PgDatabase<PgQueryResultHKT, typeof schema>,
  close: () => Promise<void>,
  service: ReturnType<typeof createTaskService>,
  auth: ReturnType<typeof createAuthService>;
let a: string,
  b: string,
  aId: string,
  bId: string,
  categoryId: string,
  otherCategory: string,
  goalId: string,
  otherGoal: string,
  projectId: string;
beforeAll(async () => {
  const url = process.env.LIFE_OS_TASKS_TEST_DATABASE_URL;
  if (url) {
    if (!new URL(url).pathname.endsWith('_tests'))
      throw new Error('Tasks require a disposable fixture database ending in _tests.');
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
  service = createTaskService(auth, createTaskRepository(db));
  const password = 'Tasks fixture password 123!';
  aId = (await auth.createAccount({ email: 'a@example.test', displayName: 'A', password })).id;
  bId = (await auth.createAccount({ email: 'b@example.test', displayName: 'B', password })).id;
  a = (await auth.login({ email: 'a@example.test', password })).token;
  b = (await auth.login({ email: 'b@example.test', password })).token;
  const direction = createDirectionRepository(db);
  categoryId = (
    await direction.category(aId, { id: randomUUID(), name: 'Practice', spiritual: false })
  ).id;
  otherCategory = (
    await direction.category(bId, { id: randomUUID(), name: 'Private B', spiritual: false })
  ).id;
  goalId = randomUUID();
  otherGoal = randomUUID();
  projectId = randomUUID();
  await db.insert(schema.goals).values([
    { id: goalId, userId: aId, title: 'Goal A' },
    { id: otherGoal, userId: bId, title: 'Goal B' },
  ]);
  await db
    .insert(schema.projects)
    .values({ id: projectId, userId: aId, title: 'Project A', goalId });
});
const task = (overrides: Partial<TaskCommand> = {}): TaskCommand => ({
  id: randomUUID(),
  version: 0,
  title: 'A deliberate next action',
  description: 'An outcome',
  notes: 'Keep the reason',
  projectId: null,
  goalId: null,
  categoryId,
  priority: 3,
  status: 'planned',
  dueAt: '2026-11-01T12:30:00Z',
  estimateMinutes: 45,
  actualMinutes: null,
  impact: 3,
  urgency: 2,
  opportunity: 1,
  goalAlignment: 4,
  energy: 'medium',
  ...overrides,
});
const capture = (userId = aId) =>
  createInboxRepository(db).capture(userId, 'A thought worth preserving', randomUUID());
describe('authenticated Tasks and atomic Inbox conversion', () => {
  it('requires real sessions and rejects caller-owned identity/provenance', async () => {
    await expect(service.list(undefined)).rejects.toThrow(AuthenticationRequired);
    for (const extra of [
      { userId: bId },
      { sourceInboxId: randomUUID() },
      { conversionHash: 'x' },
      { completedAt: new Date().toISOString() },
    ])
      await expect(service.save(a, { ...task(), ...extra })).rejects.toThrow();
    await auth.logout(a);
    await expect(service.save(a, task())).rejects.toThrow(AuthenticationRequired);
  });
  it('creates, reads and edits every supported field with stale-edit protection', async () => {
    const command = task({ projectId, priority: 1 });
    const saved = await service.save(a, command);
    expect(saved.version).toBe(1);
    expect(saved.dueAt).toBe('2026-11-01T12:30:00.000Z');
    expect(saved).not.toHaveProperty('userId');
    expect(saved).not.toHaveProperty('conversionHash');
    const edited = await service.save(
      a,
      {
        ...command,
        version: 1,
        notes: 'Preserve new reasoning',
        actualMinutes: 40,
        energy: 'high',
      },
      command.id,
    );
    expect(edited.version).toBe(2);
    expect(edited.actualMinutes).toBe(40);
    await expect(
      service.save(a, { ...command, version: 1, notes: 'Stale overwrite' }, command.id),
    ).rejects.toThrow(DirectionConflict);
    expect((await service.detail(a, command.id)).item.notes).toBe('Preserve new reasoning');
    expect((await service.detail(a, command.id)).ancestors.map((p) => p.title)).toEqual([
      'Goal A',
      'Project A',
    ]);
  });
  it('replays native creates exactly and rejects changed payloads or ID reuse', async () => {
    const command = task();
    const first = await service.save(a, command);
    expect((await service.save(a, { ...command, dueAt: '2026-11-01T07:30:00-05:00' })).id).toBe(
      first.id,
    );
    await expect(service.save(a, { ...command, title: 'Changed' })).rejects.toThrow(
      DirectionConflict,
    );
    await service.save(a, { ...command, version: 1, notes: 'Later' }, command.id);
    await expect(service.save(a, command)).rejects.toThrow(DirectionConflict);
    await expect(service.save(b, { ...command, categoryId: null })).rejects.toThrow(
      DirectionConflict,
    );
  });
  it('validates ratings, durations, date, priority, status and single-parent constraints', async () => {
    for (const override of [
      { impact: 6 },
      { urgency: -1 },
      { priority: 0 },
      { estimateMinutes: 0 },
      { actualMinutes: -1 },
      { goalId, projectId },
      { dueAt: 'not-a-date' },
      { status: 'active' },
      { title: ' ' },
      { version: 1 },
    ])
      await expect(service.save(a, { ...task(), ...override })).rejects.toThrow();
    await expect(
      db.insert(schema.tasks).values({ userId: aId, title: 'Invalid', projectId, goalId }),
    ).rejects.toThrow();
    expect((await service.list(a)).items).toHaveLength(0);
  });
  it('preserves completion time, supports reopening and all statuses without deleting', async () => {
    const command = task();
    await service.save(a, command);
    const completed = await service.save(
      a,
      { ...command, version: 1, status: 'completed' },
      command.id,
    );
    expect(completed.completedAt).not.toBeNull();
    const same = await service.save(
      a,
      { ...command, version: 2, status: 'completed', notes: 'Done' },
      command.id,
    );
    expect(same.completedAt).toBe(completed.completedAt);
    const reopened = await service.save(
      a,
      { ...command, version: 3, status: 'planned' },
      command.id,
    );
    expect(reopened.completedAt).toBeNull();
    const legacy = task({ status: 'completed' });
    await db
      .insert(schema.tasks)
      .values({ id: legacy.id, userId: aId, title: legacy.title, status: 'completed' });
    const legacyEdit = await service.save(
      a,
      { ...legacy, version: 1, notes: 'Preserve unknown history' },
      legacy.id,
    );
    expect(legacyEdit.completedAt).toBeNull();

    for (const [index, status] of ['inbox', 'in_progress', 'deferred', 'cancelled'].entries()) {
      await service.save(a, { ...command, version: 4 + index, status }, command.id);
      expect((await service.list(a, { status })).items).toHaveLength(1);
    }
  });
  it('rejects every cross-account read, write, parent, filter, capture and cursor', async () => {
    const command = task();
    await service.save(a, command);
    const source = await capture();
    await expect(service.detail(b, command.id)).rejects.toThrow(DirectionNotFound);
    await expect(
      service.save(b, { ...command, categoryId: null, version: 1 }, command.id),
    ).rejects.toThrow(DirectionNotFound);
    const foreignProject = randomUUID();
    await db
      .insert(schema.projects)
      .values({ id: foreignProject, userId: bId, title: 'Private project' });
    for (const links of [
      { categoryId: otherCategory },
      { goalId: otherGoal },
      { projectId: foreignProject },
    ])
      await expect(service.save(a, task(links))).rejects.toThrow(DirectionNotFound);
    await expect(service.list(b, { before: command.id })).rejects.toThrow(DirectionNotFound);
    await expect(service.list(b, { goalId })).rejects.toThrow(DirectionNotFound);
    await expect(service.list(b, { projectId })).rejects.toThrow(DirectionNotFound);
    await expect(service.capture(b, source.id)).rejects.toThrow(DirectionNotFound);
    await expect(service.convert(b, source.id, task({ categoryId: null }))).rejects.toThrow(
      DirectionNotFound,
    );
    expect((await service.list(b)).items).toHaveLength(0);
  });
  it('creates a Task and processes its capture atomically, with immutable retry provenance', async () => {
    const source = await capture();
    const command = task({ description: source.body, goalId });
    const first = await service.convert(a, source.id, command);
    expect(first.sourceInboxId).toBe(source.id);
    expect((await createInboxRepository(db).list(aId)).items).toHaveLength(0);
    expect((await service.convert(a, source.id, command)).id).toBe(first.id);
    await service.save(a, { ...command, version: 1, title: 'Edited after conversion' }, command.id);
    expect((await service.convert(a, source.id, command)).title).toBe('Edited after conversion');
    await expect(
      service.convert(a, source.id, { ...command, notes: 'Changed replay' }),
    ).rejects.toThrow(DirectionConflict);
    await expect(service.convert(a, source.id, task())).rejects.toThrow(DirectionConflict);
    const preserved = await service.capture(a, source.id);
    expect(preserved.capture.body).toBe(source.body);
    expect(preserved.convertedTaskId).toBe(first.id);
    const replayCapture = await createInboxRepository(db).capture(
      aId,
      source.body,
      (await db.select().from(schema.inboxItems).where(eq(schema.inboxItems.id, source.id)))[0]!
        .requestId,
    );
    expect(replayCapture.id).toBe(source.id);
    expect((await createInboxRepository(db).list(aId)).items).toHaveLength(0);
  });
  it('rolls back invalid conversions and ID conflicts without losing the capture', async () => {
    const source = await capture(),
      command = task();
    await service.save(a, command);
    await expect(service.convert(a, source.id, command)).rejects.toThrow(DirectionConflict);
    await expect(service.convert(a, source.id, task({ goalId: otherGoal }))).rejects.toThrow(
      DirectionNotFound,
    );
    expect((await createInboxRepository(db).list(aId)).items.map((i) => i.id)).toEqual([source.id]);
    expect((await service.capture(a, source.id)).processed).toBe(false);
  });
  it('serializes concurrent conversion attempts across instances', async () => {
    const source = await capture(),
      command = task();
    const replays = await Promise.all([
      service.convert(a, source.id, command),
      service.convert(a, source.id, command),
    ]);
    expect(replays[0]!.id).toBe(replays[1]!.id);
    expect((await service.list(a)).items).toHaveLength(1);
    const another = await capture();
    const results = await Promise.allSettled([
      service.convert(a, another.id, task()),
      service.convert(a, another.id, task()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await service.list(a)).items).toHaveLength(2);
  });
  it('paginates microsecond timestamp ties and filters in the database', async () => {
    const rows = Array.from({ length: 57 }, (_, index) => ({
      userId: aId,
      title: `Task ${index}`,
      status: 'planned' as const,
      goalId,
    }));
    const inserted = await db.insert(schema.tasks).values(rows).returning({ id: schema.tasks.id });
    for (const [index, row] of inserted.entries())
      await db.execute(
        sql`update task set created_at = '2026-10-07T00:00:00Z'::timestamptz + ${index} * interval '1 microsecond' where id = ${row.id}`,
      );
    const first = await service.list(a, { status: 'planned', goalId });
    expect(first.items).toHaveLength(50);
    const rest = await service.list(a, { status: 'planned', goalId, before: first.nextCursor });
    expect(rest.items).toHaveLength(7);
    expect(new Set([...first.items, ...rest.items].map((i) => i.id)).size).toBe(57);
    expect((await service.list(a, { status: 'completed' })).items).toHaveLength(0);
  });
  it('resolves Vision → Goal → Milestone → Project → Task using only owned relations', async () => {
    const visionId = randomUUID(),
      milestoneId = randomUUID();
    await db.insert(schema.visions).values({ id: visionId, userId: aId, title: 'A long view' });
    await db.update(schema.goals).set({ visionId }).where(eq(schema.goals.id, goalId));
    await db
      .insert(schema.milestones)
      .values({ id: milestoneId, userId: aId, goalId, title: 'A checkpoint' });
    await db
      .update(schema.projects)
      .set({ goalId: null, milestoneId })
      .where(eq(schema.projects.id, projectId));
    const saved = await service.save(a, task({ projectId }));
    expect((await service.detail(a, saved.id)).ancestors.map((p) => p.kind)).toEqual([
      'vision',
      'goal',
      'milestone',
      'project',
    ]);
  });
  it('preserves HTTP auth, CSRF, no-store, validation, account preconditions and owner isolation', async () => {
    const security = createHttpSecurity('http://localhost:3000', secret, true),
      handler = createTaskHttp(service, security);
    const issued = security.issueCsrf(new Request('http://localhost:3000/api/auth/csrf'));
    const cookie = `life_os_dev_session=${a}; ${issued.cookie!.split(';')[0]}`;
    const command = task();
    const headers = {
      Cookie: cookie,
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
      'X-CSRF-Token': issued.token,
      'X-Life-OS-Account': aId,
    };
    expect((await handler(new Request('http://localhost:3000/api/tasks'))).status).toBe(401);
    expect(
      (
        await handler(
          new Request('http://localhost:3000/api/tasks', {
            method: 'POST',
            headers: { Cookie: cookie },
            body: JSON.stringify(command),
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          new Request('http://localhost:3000/api/tasks', {
            method: 'POST',
            headers: { ...headers, 'X-Life-OS-Account': bId },
            body: JSON.stringify(command),
          }),
        )
      ).status,
    ).toBe(401);
    const response = await handler(
      new Request('http://localhost:3000/api/tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify(command),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const detail = await handler(
      new Request(`http://localhost:3000/api/tasks/${command.id}`, { headers: { Cookie: cookie } }),
      [command.id],
    );
    expect((await detail.json()).ownerId).toBe(aId);
    expect(
      (
        await handler(
          new Request(`http://localhost:3000/api/tasks/${command.id}`, {
            headers: { Cookie: `life_os_dev_session=${b}` },
          }),
          [command.id],
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handler(
          new Request('http://localhost:3000/api/tasks?userId=' + bId, {
            headers: { Cookie: cookie },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await handler(new Request('http://localhost:3000/api/tasks', { method: 'DELETE', headers })))
        .status,
    ).toBe(405);
    const source = await capture();
    expect(
      (
        await handler(
          new Request(`http://localhost:3000/api/tasks/from-inbox/${source.id}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(task()),
          }),
          ['from-inbox', source.id],
        )
      ).status,
    ).toBe(201);
    await auth.logout(a);
    expect(
      (
        await handler(
          new Request('http://localhost:3000/api/tasks', { headers: { Cookie: cookie } }),
        )
      ).status,
    ).toBe(401);
  });
});

it.runIf(!!process.env.LIFE_OS_TASKS_TEST_DATABASE_URL)(
  'works with restricted runtime grants and cannot erase captures or create accounts',
  async () => {
    const identifier = sql.identifier(
      `tasks_fixture_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
    );
    const source = await capture(),
      command = task({ projectId });
    await db.execute(sql`create role ${identifier} nologin`);
    try {
      await db.execute(sql`grant usage on schema public to ${identifier}`);
      await db.execute(
        sql`grant select on app_user, category, goal, project, milestone, vision, inbox_item to ${identifier}`,
      );
      await db.execute(sql`grant update(id) on app_user to ${identifier}`);
      await db.execute(sql`grant update(processed_at) on inbox_item to ${identifier}`);
      await db.execute(sql`grant select, update on auth_session to ${identifier}`);
      await db.execute(sql`grant select, insert, update on task to ${identifier}`);
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local role ${identifier}`);
        const restricted = createTaskService(
          createAuthService(createAuthRepository(tx), secret),
          createTaskRepository(tx),
        );
        expect((await restricted.convert(a, source.id, command)).sourceInboxId).toBe(source.id);
        expect((await restricted.detail(a, command.id)).ancestors.map((p) => p.kind)).toEqual([
          'goal',
          'project',
        ]);
        await restricted.save(a, { ...command, version: 1, status: 'completed' }, command.id);
        expect((await restricted.list(b)).items).toHaveLength(0);
      });
      for (const statement of [
        sql`delete from inbox_item where id = ${source.id}`,
        sql`insert into app_user(email,display_name) values('forbidden@example.test','Forbidden')`,
        sql`create table forbidden_tasks_fixture(id integer)`,
      ])
        await expect(
          db.transaction(async (tx) => {
            await tx.execute(sql`set local role ${identifier}`);
            await tx.execute(statement);
          }),
        ).rejects.toThrow();
    } finally {
      await db.execute(sql`drop owned by ${identifier}`);
      await db.execute(sql`drop role ${identifier}`);
    }
  },
);
