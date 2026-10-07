import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const pg = new PGlite();
const migrationFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';

beforeAll(async () => {
  await migrate(drizzle(pg), { migrationsFolder: migrationFolder });
}, 30_000);
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec('TRUNCATE app_user CASCADE');
  await pg.query(
    'INSERT INTO app_user(id, email, display_name) VALUES ($1, $2, $3), ($4, $5, $6)',
    [alice, 'alice@example.test', 'Alice', bob, 'bob@example.test', 'Bob'],
  );
});

describe('real SQL migration constraints', () => {
  it('migrates idempotently and maintains updated timestamps', async () => {
    await migrate(drizzle(pg), { migrationsFolder: migrationFolder });
    await pg.query("UPDATE app_user SET updated_at = '2000-01-01' WHERE id = $1", [alice]);
    const result = await pg.query<{ recent: boolean }>(
      "SELECT updated_at > '2026-01-01' as recent FROM app_user WHERE id = $1",
      [alice],
    );
    expect(result.rows[0]!.recent).toBe(true);
  });
  it('rejects cross-owner hierarchy links', async () => {
    const goal = await pg.query<{ id: string }>(
      'INSERT INTO goal(user_id,title) VALUES($1, $2) RETURNING id',
      [alice, 'A private goal'],
    );
    await expect(
      pg.query('INSERT INTO project(user_id,goal_id,title) VALUES($1,$2,$3)', [
        bob,
        goal.rows[0]!.id,
        'Not mine',
      ]),
    ).rejects.toThrow(/foreign key/);
    await pg.query('INSERT INTO project(user_id,goal_id,title) VALUES($1,$2,$3)', [
      alice,
      goal.rows[0]!.id,
      'Mine',
    ]);
  });
  it('rejects cross-owner categories and daily task links', async () => {
    const category = await pg.query<{ id: string }>(
      "INSERT INTO category(user_id,slug,name) VALUES($1,'study','Study') RETURNING id",
      [alice],
    );
    await expect(
      pg.query("INSERT INTO task(user_id,category_id,title) VALUES($1,$2,'Invalid')", [
        bob,
        category.rows[0]!.id,
      ]),
    ).rejects.toThrow(/foreign key/);
    const task = await pg.query<{ id: string }>(
      "INSERT INTO task(user_id,title) VALUES($1,'Private task') RETURNING id",
      [alice],
    );
    const plan = await pg.query<{ id: string }>(
      "INSERT INTO daily_plan(user_id,local_date,time_zone) VALUES($1,'2026-10-06','UTC') RETURNING id",
      [bob],
    );
    await expect(
      pg.query(
        "INSERT INTO daily_big_three(user_id,plan_id,position,outcome,task_id) VALUES($1,$2,1,'Invalid',$3)",
        [bob, plan.rows[0]!.id, task.rows[0]!.id],
      ),
    ).rejects.toThrow(/foreign key/);
  });
  it('allows one active Season per owner, not one globally', async () => {
    const insert = (owner: string) =>
      pg.query(
        "INSERT INTO season(user_id,name,objective,starts_on,ends_on,status) VALUES($1,'Season','Focus','2026-10-01','2026-12-31','active')",
        [owner],
      );
    await insert(alice);
    await insert(bob);
    await expect(insert(alice)).rejects.toThrow(/unique/);
  });
  it('enforces one plan per local date and at most three outcomes', async () => {
    const result = await pg.query<{ id: string }>(
      "INSERT INTO daily_plan(user_id,local_date,time_zone) VALUES($1,'2026-10-06','America/Los_Angeles') RETURNING id",
      [alice],
    );
    const plan = result.rows[0]!.id;
    for (const position of [1, 2, 3])
      await pg.query(
        'INSERT INTO daily_big_three(user_id,plan_id,position,outcome) VALUES($1,$2,$3,$4)',
        [alice, plan, position, `Outcome ${position}`],
      );
    await expect(
      pg.query(
        "INSERT INTO daily_big_three(user_id,plan_id,position,outcome) VALUES($1,$2,4,'Too much')",
        [alice, plan],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      pg.query(
        "INSERT INTO daily_plan(user_id,local_date,time_zone) VALUES($1,'2026-10-06','UTC')",
        [alice],
      ),
    ).rejects.toThrow(/unique/);
  });
  it('rejects invalid durations, scores, dates, and empty captures', async () => {
    await expect(
      pg.query("INSERT INTO task(user_id,title,impact) VALUES($1,'Bad score',6)", [alice]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      pg.query(
        "INSERT INTO schedule_block(user_id,title,kind,starts_at,ends_at) VALUES($1,'Bad block','focus','2026-10-06T10:00Z','2026-10-06T09:00Z')",
        [alice],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      pg.query(
        "INSERT INTO season(user_id,name,objective,starts_on,ends_on) VALUES($1,'Bad dates','Focus','2026-12-31','2026-10-01')",
        [alice],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      pg.query("INSERT INTO inbox_item(user_id,body) VALUES($1,'  ')", [alice]),
    ).rejects.toThrow(/check constraint/);
  });
  it('enforces one running focus session for each user', async () => {
    const start = (owner: string) =>
      pg.query(
        "INSERT INTO focus_session(user_id,objective,started_at,planned_minutes) VALUES($1,'Work',now(),50)",
        [owner],
      );
    await start(alice);
    await start(bob);
    await expect(start(alice)).rejects.toThrow(/unique/);
  });
});
