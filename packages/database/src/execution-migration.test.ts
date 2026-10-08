import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it, expect } from 'vitest';
it('upgrades pre-Phase-1 planning / schedule / Focus / Direction without inventing history', async () => {
  const source = fileURLToPath(new URL('../migrations', import.meta.url)),
    folder = await mkdtemp(join(tmpdir(), 'life-os-execution-upgrade-')),
    pg = new PGlite();
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(await readFile(join(source, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    journal.entries = journal.entries.filter((e) => e.idx < 5);
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    for (const e of journal.entries)
      await copyFile(join(source, e.tag + '.sql'), join(folder, e.tag + '.sql'));
    await migrate(drizzle(pg), { migrationsFolder: folder });
    const owner = '00000000-0000-4000-8000-000000000001',
      project = '00000000-0000-4000-8000-000000000002',
      plan = '00000000-0000-4000-8000-000000000003';
    await pg.query(
      "insert into app_user(id,email,display_name) values($1,'upgrade@example.test','Upgrade')",
      [owner],
    );
    await pg.query(
      "insert into project(id,user_id,title,notes) values($1,$2,'Preserve project','Original notes')",
      [project, owner],
    );
    await pg.query(
      "insert into daily_plan(id,user_id,local_date,time_zone,one_thing) values($1,$2,'2026-10-08','America/Los_Angeles','Original intention')",
      [plan, owner],
    );
    await pg.query(
      "insert into daily_big_three(user_id,plan_id,position,outcome) values($1,$2,1,'Original outcome')",
      [owner, plan],
    );
    await pg.query(
      "insert into schedule_block(user_id,title,kind,starts_at,ends_at) values($1,'Legacy block','custom','2026-10-08T16:00Z','2026-10-08T17:00Z')",
      [owner],
    );
    await pg.query(
      "insert into focus_session(user_id,objective,started_at,ended_at,planned_minutes,active_seconds,notes) values($1,'Legacy focus','2026-10-08T16:00Z','2026-10-08T17:00Z',50,1800,'Original outcome context')",
      [owner],
    );
    await migrate(drizzle(pg), { migrationsFolder: source });
    await migrate(drizzle(pg), { migrationsFolder: source });
    const plans = await pg.query<{ version: number; one_thing: string; morning: string }>(
      'select * from daily_plan',
    );
    expect(plans.rows[0]).toMatchObject({
      version: 1,
      one_thing: 'Original intention',
      morning: '{}',
    });
    const projects = await pg.query<{ priority: number; notes: string }>('select * from project');
    expect(projects.rows[0]).toMatchObject({ priority: 3, notes: 'Original notes' });
    const sessions = await pg.query<{ version: number; active_seconds: number; resumed_at: null }>(
      'select * from focus_session',
    );
    expect(sessions.rows[0]).toMatchObject({ version: 1, active_seconds: 1800, resumed_at: null });
    expect((await pg.query('select * from focus_interval')).rows).toEqual([]);
    expect((await pg.query('select * from daily_big_three')).rows).toHaveLength(1);
    expect((await pg.query('select * from schedule_block')).rows).toHaveLength(1);
  } finally {
    await pg.close();
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);
