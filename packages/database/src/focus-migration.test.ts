import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it, expect } from 'vitest';
it('upgrades Focus without finishing, deleting or resetting legacy paused/running/history records', async () => {
  const source = fileURLToPath(new URL('../migrations', import.meta.url)),
    folder = await mkdtemp(join(tmpdir(), 'life-os-focus-upgrade-')),
    pg = new PGlite();
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(await readFile(join(source, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    journal.entries = journal.entries.filter((e) => e.idx < 8);
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    for (const e of journal.entries)
      await copyFile(join(source, e.tag + '.sql'), join(folder, e.tag + '.sql'));
    await migrate(drizzle(pg), { migrationsFolder: folder });
    const a = '00000000-0000-4000-8000-000000000001',
      b = '00000000-0000-4000-8000-000000000002',
      paused = '00000000-0000-4000-8000-000000000003',
      running = '00000000-0000-4000-8000-000000000004';
    await pg.query(
      "insert into app_user(id,email,display_name) values($1,'a@upgrade.test','A'),($2,'b@upgrade.test','B')",
      [a, b],
    );
    await pg.query(
      "insert into focus_session(id,user_id,objective,started_at,planned_minutes,active_seconds,notes) values($1,$2,'Algorithms','2026-10-13T15:00Z',90,2700,'Keep this note')",
      [paused, a],
    );
    await pg.query(
      "insert into focus_session(user_id,objective,started_at,ended_at,planned_minutes,active_seconds,notes) values($1,'History','2026-10-12T15:00Z','2026-10-12T16:00Z',60,3600,'Old history')",
      [a],
    );
    await pg.query(
      "insert into focus_session(id,user_id,objective,started_at,resumed_at,planned_minutes,active_seconds,notes) values($1,$2,'Running','2026-10-13T15:00Z','2026-10-13T16:00Z',90,600,'Running note')",
      [running, b],
    );
    await pg.query(
      "insert into focus_interval(user_id,session_id,starts_at) values($1,$2,'2026-10-13T16:00Z')",
      [b, running],
    );
    await migrate(drizzle(pg), { migrationsFolder: source });
    await migrate(drizzle(pg), { migrationsFolder: source });
    expect(
      (await pg.query('select * from focus_session where id=$1', [paused])).rows[0],
    ).toMatchObject({
      active_seconds: 2700,
      planned_minutes: 90,
      resumed_at: null,
      ended_at: null,
      notes: 'Keep this note',
      version: 1,
    });
    expect(
      (await pg.query('select * from focus_session where id=$1', [running])).rows[0],
    ).toMatchObject({ active_seconds: 600, notes: 'Running note', ended_at: null, version: 1 });
    expect(
      (await pg.query('select * from focus_interval where ends_at is null')).rows,
    ).toHaveLength(1);
    expect(
      (await pg.query('select * from focus_session where ended_at is not null')).rows[0],
    ).toMatchObject({ active_seconds: 3600, notes: 'Old history' });
    await pg.query(
      "insert into focus_session(user_id,objective,started_at,planned_minutes) values($1,'Another paused','2026-10-13T16:00Z',60)",
      [a],
    );
    expect(
      (await pg.query('select * from focus_session where user_id=$1 and ended_at is null', [a]))
        .rows,
    ).toHaveLength(2);
  } finally {
    await pg.close();
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);
