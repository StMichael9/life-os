import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
it('upgrades existing Direction records without losing notes, dates or parent links', async () => {
  const folder = fileURLToPath(new URL('../migrations', import.meta.url));
  const previous = await mkdtemp(join(tmpdir(), 'life-os-direction-migration-'));
  const pg = new PGlite();
  try {
    const journal = JSON.parse(await readFile(join(folder, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entries = journal.entries.filter((entry) => entry.idx < 3);
    await mkdir(join(previous, 'meta'));
    await writeFile(join(previous, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      await copyFile(join(folder, `${entry.tag}.sql`), join(previous, `${entry.tag}.sql`));
    await migrate(drizzle(pg), { migrationsFolder: previous });
    const user = '00000000-0000-4000-8000-000000000001',
      goal = '00000000-0000-4000-8000-000000000002',
      milestone = '00000000-0000-4000-8000-000000000003';
    await pg.query(
      "insert into app_user(id,email,display_name) values($1,'fixture@example.test','Fixture')",
      [user],
    );
    await pg.query(
      "insert into goal(id,user_id,title,notes,target_date) values($1,$2,'Existing intention','Keep this reasoning','2026-12-31')",
      [goal, user],
    );
    await pg.query(
      "insert into milestone(id,user_id,goal_id,title) values($1,$2,$3,'Existing checkpoint')",
      [milestone, user, goal],
    );
    await pg.query(
      "insert into project(user_id,milestone_id,title,notes) values($1,$2,'Existing work','Keep the scope')",
      [user, milestone],
    );
    await pg.query(
      "insert into season(user_id,name,objective,starts_on,ends_on) values($1,'Existing season','Preserve direction','2026-10-01','2026-12-31')",
      [user],
    );
    await migrate(drizzle(pg), { migrationsFolder: folder });
    await migrate(drizzle(pg), { migrationsFolder: folder });
    for (const table of ['season', 'goal', 'milestone', 'project']) {
      const row = await pg.query<{ version: number }>(`select version from ${table}`);
      expect(row.rows[0]!.version).toBe(1);
    }
    expect((await pg.query<{ notes: string }>('select notes from goal')).rows[0]!.notes).toBe(
      'Keep this reasoning',
    );
    expect(
      (await pg.query<{ milestone_id: string }>('select milestone_id from project')).rows[0]!
        .milestone_id,
    ).toBe(milestone);
    expect(
      (await pg.query<{ date: string }>('select target_date::text as date from goal')).rows[0]!
        .date,
    ).toBe('2026-12-31');
  } finally {
    await pg.close();
    await rm(previous, { recursive: true, force: true });
  }
}, 30_000);
