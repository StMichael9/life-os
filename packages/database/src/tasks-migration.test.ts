import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
it('upgrades existing Tasks and captures without fabricating history or losing links', async () => {
  const folder = fileURLToPath(new URL('../migrations', import.meta.url)),
    previous = await mkdtemp(join(tmpdir(), 'life-os-tasks-migration-')),
    pg = new PGlite();
  try {
    const journal = JSON.parse(await readFile(join(folder, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entries = journal.entries.filter((entry) => entry.idx < 4);
    await mkdir(join(previous, 'meta'));
    await writeFile(join(previous, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      await copyFile(join(folder, `${entry.tag}.sql`), join(previous, `${entry.tag}.sql`));
    await migrate(drizzle(pg), { migrationsFolder: previous });
    const user = '00000000-0000-4000-8000-000000000001',
      project = '00000000-0000-4000-8000-000000000002';
    await pg.query(
      "insert into app_user(id,email,display_name) values($1,'fixture@example.test','Fixture')",
      [user],
    );
    await pg.query("insert into project(id,user_id,title) values($1,$2,'Existing Project')", [
      project,
      user,
    ]);
    await pg.query(
      "insert into task(user_id,project_id,title,notes,status,due_at,actual_minutes) values($1,$2,'Existing Task','Keep this reasoning','completed','2026-12-31T10:30:00Z',25)",
      [user, project],
    );
    await pg.query("insert into inbox_item(user_id,body) values($1,'Keep this capture')", [user]);
    await migrate(drizzle(pg), { migrationsFolder: folder });
    await migrate(drizzle(pg), { migrationsFolder: folder });
    const row = (
      await pg.query<{
        version: number;
        priority: number;
        project_id: string;
        notes: string;
        completed_at: null;
        source_inbox_id: null;
        conversion_hash: null;
        actual_minutes: number;
        due_at: Date;
      }>('select * from task')
    ).rows[0]!;
    expect(row).toMatchObject({
      version: 1,
      priority: 3,
      project_id: project,
      notes: 'Keep this reasoning',
      completed_at: null,
      source_inbox_id: null,
      conversion_hash: null,
      actual_minutes: 25,
    });
    expect(new Date(row.due_at).toISOString()).toBe('2026-12-31T10:30:00.000Z');
    expect(
      (
        await pg.query<{ body: string; processed_at: null }>(
          'select body,processed_at from inbox_item',
        )
      ).rows[0],
    ).toEqual({ body: 'Keep this capture', processed_at: null });
    await expect(
      pg.query(
        "insert into task(user_id,title,source_inbox_id) select user_id,'Missing provenance',id from inbox_item",
      ),
    ).rejects.toThrow();
  } finally {
    await pg.close();
    await rm(previous, { recursive: true, force: true });
  }
}, 30_000);
