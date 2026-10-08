import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, clearE2ELimits } from '../packages/api/src/e2e-fixtures';
import type { Task } from '../packages/shared/src/tasks';
function taskEditCommand(task: Task) {
  const {
    createdAt: _created,
    updatedAt: _updated,
    completedAt: _completed,
    sourceInboxId: _source,
    ...command
  } = task;
  void _created;
  void _updated;
  void _completed;
  void _source;
  return command;
}
test.describe('persisted Tasks and Inbox conversion', () => {
  test.skip(!process.env.LIFE_OS_E2E_DATABASE_URL, 'Disposable PostgreSQL _e2e database required.');
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    if (process.env.LIFE_OS_E2E_DATABASE_URL)
      await clearE2ELimits(process.env.LIFE_OS_E2E_DATABASE_URL);
  });
  async function login(page: Page, email = 'alice@example.test') {
    await page.goto('/login?next=/tasks');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByRole('button', { name: 'New Task', exact: true })).toBeVisible();
  }
  async function create(page: Page, title: string) {
    await page.getByRole('button', { name: 'New Task', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Title', { exact: true }).fill(title);
    await form.getByRole('button', { name: 'Save Task', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    return new URL(page.url()).searchParams.get('id')!;
  }
  async function headers(page: Page) {
    const response = await page.request.get('/api/auth/csrf');
    return { Origin: 'http://127.0.0.1:3000', 'X-CSRF-Token': (await response.json()).token };
  }
  test('persists edits, account-timezone due times, completion and database filters', async ({
    page,
  }) => {
    await login(page);
    const name = `Deliberate Task ${test.info().project.name}`;
    await page.getByRole('button', { name: 'New Task', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Title', { exact: true }).fill(name);
    await form.getByLabel('Description', { exact: true }).fill('A clear outcome');
    await form.getByLabel('Notes', { exact: true }).fill('Preserve the context');
    await form
      .getByLabel('Due date and time (America/Los_Angeles)', { exact: true })
      .fill('2026-10-15T08:30');
    await form.getByLabel('Estimate (minutes)', { exact: true }).fill('45');
    await form.getByLabel('Priority', { exact: true }).selectOption('1');
    await form.getByRole('button', { name: 'Save Task', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page).toHaveURL(/id=/);
    const id = new URL(page.url()).searchParams.get('id')!;
    const saved = (await (await page.request.get(`/api/tasks/${id}`)).json()).item;
    expect(saved.dueAt).toBe('2026-10-15T15:30:00.000Z');
    await page.reload();
    await expect(page.getByText('Preserve the context', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Task', exact: true }).click();
    await expect(
      form.getByLabel('Due date and time (America/Los_Angeles)', { exact: true }),
    ).toHaveValue('2026-10-15T08:30');
    await form.getByLabel('Notes', { exact: true }).fill('An edited reason');
    await form.getByLabel('Actual duration (minutes)', { exact: true }).fill('40');
    await form.getByRole('button', { name: 'Save Task', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.getByText('An edited reason', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Complete Task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen Task', exact: true })).toBeVisible();
    await page.getByLabel('Status', { exact: true }).selectOption('completed');
    await expect(page.locator('.direction-records').getByText(name, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reopen Task', exact: true }).click();
    await expect(page.locator('.direction-records').getByText(name, { exact: true })).toHaveCount(
      0,
    );
    await page.getByLabel('Status', { exact: true }).selectOption('planned');
    await expect(page.locator('.direction-records').getByText(name, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole('button', { name: 'Edit Task', exact: true }).click();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  });
  test('converts a capture once after a lost response and preserves the original text', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/inbox');
    const body = `A captured next action ${test.info().project.name}\nKeep all of the original context.`;
    await page.getByLabel('What’s on your mind?').fill(body);
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    const row = page.locator('.capture-list li').filter({ hasText: body.split('\n')[0]! });
    await expect(row).toBeVisible();
    await row.getByRole('link', { name: 'Turn into Task', exact: true }).click();
    const form = page.getByRole('dialog');
    await expect(form).toBeVisible();
    await expect(form.getByLabel('Description', { exact: true })).toHaveValue(body);
    const source = new URL(page.url()).searchParams.get('fromInbox')!;
    await page.route(
      `**/api/tasks/from-inbox/${source}`,
      async (route) => {
        if (route.request().method() === 'POST') {
          await route.fetch();
          await route.abort('failed');
        } else await route.continue();
      },
      { times: 1 },
    );
    await form.getByRole('button', { name: 'Create Task', exact: true }).click();
    await expect(form.getByRole('alert')).toBeVisible();
    await expect(form.getByLabel('Description', { exact: true })).toHaveValue(body);
    await form.getByRole('button', { name: 'Create Task', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: body.split('\n')[0]!, exact: true }),
    ).toBeVisible();
    const data = await (await page.request.get('/api/tasks')).json();
    expect(data.items.filter((item: Task) => item.sourceInboxId === source)).toHaveLength(1);
    const preserved = await (await page.request.get(`/api/tasks/from-inbox/${source}`)).json();
    expect(preserved.capture.body).toBe(body);
    expect(preserved.convertedTaskId).toBe(new URL(page.url()).searchParams.get('id'));
    await page.goto('/inbox');
    await expect(
      page.locator('.capture-list li').filter({ hasText: body.split('\n')[0]! }),
    ).toHaveCount(0);
  });
  test('shows owned Goal/Project hierarchy and retains conflicting notes for review', async ({
    page,
  }) => {
    await login(page);
    const suffix = test.info().project.name,
      goalId = crypto.randomUUID(),
      projectId = crypto.randomUUID();
    const h = await headers(page);
    expect(
      (
        await page.request.post('/api/direction/goals', {
          headers: h,
          data: {
            id: goalId,
            version: 0,
            title: `Task goal ${suffix}`,
            description: null,
            notes: null,
            categoryId: null,
            visionId: null,
            targetDate: null,
            status: 'planned',
            priority: 3,
            targetValue: null,
            currentValue: null,
            unit: null,
          },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await page.request.post('/api/direction/projects', {
          headers: h,
          data: {
            id: projectId,
            version: 0,
            title: `Task project ${suffix}`,
            description: null,
            notes: null,
            categoryId: null,
            goalId,
            milestoneId: null,
            status: 'planned',
            startsOn: null,
            targetDate: null,
          },
        })
      ).status(),
    ).toBe(201);
    await page.reload();
    await page.getByRole('button', { name: 'New Task', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Title', { exact: true }).fill(`Linked action ${suffix}`);
    await form.getByLabel('Connected to', { exact: true }).selectOption(`project:${projectId}`);
    await form.getByRole('button', { name: 'Save Task', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page).toHaveURL(/id=/);
    const id = new URL(page.url()).searchParams.get('id')!;
    const hierarchy = page.getByRole('navigation', { name: 'Task hierarchy' });
    await expect(hierarchy).toContainText(`Task goal ${suffix}`);
    await expect(hierarchy).toContainText(`Task project ${suffix}`);
    await page.getByRole('button', { name: 'Edit Task', exact: true }).click();
    await form.getByLabel('Notes', { exact: true }).fill('Keep my unsaved reasoning');
    const current = (await (await page.request.get(`/api/tasks/${id}`)).json()).item as Task;
    expect(
      (
        await page.request.patch(`/api/tasks/${id}`, {
          headers: await headers(page),
          data: { ...taskEditCommand(current), notes: 'A newer saved reason' },
        })
      ).status(),
    ).toBe(200);
    await form.getByRole('button', { name: 'Save Task', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('record changed');
    await expect(form.getByLabel('Notes', { exact: true })).toHaveValue(
      'Keep my unsaved reasoning',
    );
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('A newer saved reason', { exact: true })).toBeVisible();
    await page.getByLabel('Connection', { exact: true }).selectOption(`project:${projectId}`);
    await expect(
      page.locator('.direction-records').getByText(`Linked action ${suffix}`, { exact: true }),
    ).toBeVisible();
    await page.getByLabel('Connection', { exact: true }).selectOption(`goal:${goalId}`);
    await expect(
      page.locator('.direction-records').getByText(`Linked action ${suffix}`, { exact: true }),
    ).toHaveCount(0);
  });
  test('blocks foreign records and account-switched drafts without adopting private data', async ({
    page,
    browser,
    context,
  }) => {
    await login(page);
    const title = `Isolated Task ${test.info().project.name}`,
      id = await create(page, title);
    const current = (await (await page.request.get(`/api/tasks/${id}`)).json()).item as Task;
    const other = await browser.newContext({ baseURL: 'http://127.0.0.1:3000' }),
      bob = await other.newPage();
    await login(bob, 'bob@example.test');
    await expect(bob.getByText(title, { exact: true })).toHaveCount(0);
    expect((await bob.request.get(`/api/tasks/${id}`)).status()).toBe(404);
    expect(
      (
        await bob.request.patch(`/api/tasks/${id}`, {
          headers: await headers(bob),
          data: { ...taskEditCommand(current), notes: 'Foreign overwrite' },
        })
      ).status(),
    ).toBe(404);
    await other.close();
    await page.getByRole('button', { name: 'Edit Task', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Notes', { exact: true }).fill('Earlier account draft');
    const second = await context.newPage();
    await login(second, 'bob@example.test');
    await form.locator('form').evaluate((element: HTMLFormElement) => element.requestSubmit());
    await expect(form).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in again', exact: true })).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    const records = await (await second.request.get('/api/tasks')).json();
    expect(records.items.some((item: Task) => item.notes === 'Earlier account draft')).toBe(false);
    await second.close();
  });
});
