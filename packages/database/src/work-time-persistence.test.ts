import { it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createEmbeddedDatabase } from './embedded';
import { createExecutionRepository } from './execution';

it('upgrades the installed pre-stopwatch database and persists work, target and audit through engine reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'life-os-work-upgrade-'));
  const source = fileURLToPath(new URL('../migrations', import.meta.url)),
    old = join(root, 'old');
  let opened: Awaited<ReturnType<typeof createEmbeddedDatabase>> | undefined;
  const user = randomUUID(),
    legacy = randomUUID(),
    sid = randomUUID();
  try {
    await mkdir(join(old, 'meta'), { recursive: true });
    const journal = JSON.parse(await readFile(join(source, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    journal.entries = journal.entries.filter((e) => e.idx < 9);
    await writeFile(join(old, 'meta/_journal.json'), JSON.stringify(journal));
    for (const e of journal.entries)
      await copyFile(join(source, e.tag + '.sql'), join(old, e.tag + '.sql'));
    opened = await createEmbeddedDatabase(join(root, 'data'), { migrationsFolder: old });
    await opened.db.execute(
      sql`insert into app_user(id,email,display_name) values(${user},'upgrade@work.test','Upgrade')`,
    );
    await opened.db.execute(
      sql`insert into focus_session(id,user_id,objective,started_at,ended_at,planned_minutes,active_seconds,notes) values(${legacy},${user},'Preserve recorded work',now()-interval '1 hour',now(),90,3600,'Original notes')`,
    );
    await opened.close();
    opened = undefined;
    opened = await createEmbeddedDatabase(join(root, 'data'), { migrationsFolder: source });
    let repo = createExecutionRepository(opened.db);
    expect((await repo.workSession(user, legacy)).session).toMatchObject({
      activeMilliseconds: 3600000,
      activeSeconds: 3600,
      timerMode: 'countdown',
      notes: 'Original notes',
    });
    await repo.mutate(user, {
      action: 'focus-start',
      requestId: randomUUID(),
      id: sid,
      objective: 'Persistent stopwatch',
      taskId: null,
      projectId: null,
      categoryId: null,
      plannedMinutes: 90,
      timerMode: 'stopwatch',
      notes: 'Independent context',
    });
    await repo.mutate(user, {
      action: 'work-target',
      requestId: randomUUID(),
      version: 0,
      minutes: 480,
    });
    await opened.close();
    opened = undefined;
    opened = await createEmbeddedDatabase(join(root, 'data'), { migrationsFolder: source });
    repo = createExecutionRepository(opened.db);
    expect((await repo.workSession(user, sid)).session).toMatchObject({
      timerMode: 'stopwatch',
      notes: 'Independent context',
      endedAt: null,
      version: 1,
    });
    await repo.mutate(user, {
      action: 'work-adjust',
      requestId: randomUUID(),
      id: sid,
      version: 1,
      operation: 'reset',
      intervalId: null,
      startsAt: null,
      endsAt: null,
      reason: 'Reset after reopening',
    });
    await opened.close();
    opened = undefined;
    opened = await createEmbeddedDatabase(join(root, 'data'), { migrationsFolder: source });
    repo = createExecutionRepository(opened.db);
    const d = await repo.workSession(user, sid);
    expect(d.session).toMatchObject({
      resumedAt: null,
      activeMilliseconds: 0,
      activeSeconds: 0,
      notes: 'Independent context',
    });
    expect(d.changes[0]).toMatchObject({ kind: 'reset', reason: 'Reset after reopening' });
    expect(d.intervals[0]!.excluded).toBe(true);
    expect((await repo.today(user)).workTime).toMatchObject({
      targetMinutes: 480,
      targetVersion: 1,
    });
  } finally {
    await opened?.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
