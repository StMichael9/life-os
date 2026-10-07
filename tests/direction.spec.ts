import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, clearE2ELimits } from '../packages/api/src/e2e-fixtures';
test.describe('persisted Direction', () => {
  test.skip(!process.env.LIFE_OS_E2E_DATABASE_URL, 'Disposable PostgreSQL _e2e database required.');
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    if (process.env.LIFE_OS_E2E_DATABASE_URL)
      await clearE2ELimits(process.env.LIFE_OS_E2E_DATABASE_URL);
  });
  async function login(page: Page, email: string) {
    await page.goto('/login?next=/direction');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/direction$/);
    await expect(page.getByRole('button', { name: 'New Season', exact: true })).toBeVisible();
  }
  async function createSeason(page: Page, name: string) {
    await page.getByRole('button', { name: 'New Season', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Season name').fill(name);
    await form.getByLabel('Primary objective').fill('Build meaningful evidence');
    await form.getByLabel('Start date', { exact: true }).fill('2026-10-01');
    await form.getByLabel('End date').fill('2026-12-31');
    await form.getByLabel('Success criteria').fill('Finish a useful body of work');
    await form.getByText('Add a category', { exact: true }).click();
    await form.getByLabel('Category name').fill(`${name} practice`);
    await form.getByRole('button', { name: 'Add category', exact: true }).click();
    await expect(form.getByLabel(`${name} practice`, { exact: true })).toBeVisible();
    await form.getByRole('button', { name: 'Save Season', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('100%');
    await form.getByLabel(`${name} practice`, { exact: true }).fill('100');
    await form.getByLabel('Status', { exact: true }).selectOption('active');
    await form.getByRole('button', { name: 'Save Season', exact: true }).click();
    await expect(form).not.toBeVisible();
  }
  test('creates, activates, edits and archives a Season with real Today data', async ({ page }) => {
    await login(page, 'alice@example.test');
    const name = `Intentional season ${test.info().project.name}`;
    await createSeason(page, name);
    await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText('Build meaningful evidence', { exact: true })).toBeVisible();
    await expect(page.getByText('YOUR WORKSPACE', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'View your Season' }).click();
    await expect(page.getByRole('button', { name: 'Edit Season', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Season', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Primary objective').fill('Refine the intention');
    await form.getByRole('button', { name: 'Save Season', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.getByText('Refine the intention', { exact: true }).last()).toBeVisible();
    await page.reload();
    await expect(page.getByText('Refine the intention', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Edit Season', exact: true }).click();
    await form.getByLabel('Status', { exact: true }).selectOption('archived');
    await form.getByRole('button', { name: 'Save Season', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'A little clarity changes everything.' }),
    ).toBeVisible();
    await page.getByLabel('Show records').selectOption('all');
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  });
  test('persists Goal → Milestone → Project and supports edits/completion', async ({ page }) => {
    await login(page, 'alice@example.test');
    await page.getByRole('button', { name: 'Goals', exact: true }).click();
    await page.getByRole('button', { name: 'New Goal', exact: true }).click();
    const suffix = test.info().project.name;
    const goal = `A useful outcome ${suffix}`,
      milestone = `A meaningful checkpoint ${suffix}`,
      project = `A focused project ${suffix}`;
    const form = page.getByRole('dialog');
    await form.getByLabel('Title', { exact: true }).fill(goal);
    await form.getByLabel('Description', { exact: true }).fill('Make the why clear');
    await form.getByLabel('Notes', { exact: true }).fill('Preserve this reasoning');
    await form.getByLabel('Target value', { exact: true }).fill('10');
    await form.getByLabel('Current value', { exact: true }).fill('2');
    await form.getByLabel('Unit', { exact: true }).fill('pieces');
    await form.getByRole('button', { name: 'Save Goal', exact: true }).click();
    await expect(form).not.toBeVisible();
    await page.getByRole('button', { name: 'Add Milestone', exact: true }).click();
    await form.getByLabel('Title', { exact: true }).fill(milestone);
    await form.getByLabel('Target date', { exact: true }).fill('2026-11-30');
    await form.getByRole('button', { name: 'Save Milestone', exact: true }).click();
    await expect(form).not.toBeVisible();
    await page
      .getByRole('navigation', { name: 'Goal hierarchy' })
      .getByRole('link', { name: goal, exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Complete', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await form.getByLabel('Title', { exact: true }).fill(project);
    const option = await form
      .getByRole('option', { name: milestone, exact: true })
      .getAttribute('value');
    await form.getByLabel('Connected to', { exact: true }).selectOption(option!);
    await form.getByLabel('Start date', { exact: true }).fill('2026-10-01');
    await form.getByLabel('Target date', { exact: true }).fill('2026-12-01');
    await form.getByRole('button', { name: 'Save Project', exact: true }).click();
    await expect(form).not.toBeVisible();
    const hierarchy = page.getByRole('navigation', { name: 'Goal hierarchy' });
    await expect(hierarchy).toContainText(goal);
    await expect(hierarchy).toContainText(milestone);
    await expect(hierarchy).toContainText(project);
    await page.reload();
    await expect(hierarchy).toContainText(milestone);
    await page.getByRole('button', { name: 'Edit Project', exact: true }).click();
    await form.getByLabel('Notes', { exact: true }).fill('Keep the scope small');
    await form.getByRole('button', { name: 'Save Project', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.getByText('Keep the scope small', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole('button', { name: 'Edit Project', exact: true }).click();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  test('rejects another account’s detail/update and preserves stale edits for review', async ({
    page,
    browser,
  }) => {
    await login(page, 'alice@example.test');
    await page.getByRole('button', { name: 'Goals', exact: true }).click();
    await page.getByRole('button', { name: 'New Goal', exact: true }).click();
    const name = `Isolation goal ${test.info().project.name}`;
    const form = page.getByRole('dialog');
    await form.getByLabel('Title', { exact: true }).fill(name);
    await form.getByRole('button', { name: 'Save Goal', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page).toHaveURL(/id=/);
    const id = new URL(page.url()).searchParams.get('id')!;
    await page.getByRole('button', { name: 'Edit Goal', exact: true }).click();
    await form.getByLabel('Notes', { exact: true }).fill('My unsaved reasoning');
    const response = await page.request.get(`/api/direction/goals/${id}`);
    const data = await response.json();
    const { createdAt: _created, updatedAt: _updated, ...command } = data.item;
    void _created;
    void _updated;
    const csrf = await page.request.get('/api/auth/csrf');
    const { token } = await csrf.json();
    await page.request.patch(`/api/direction/goals/${id}`, {
      headers: { Origin: 'http://127.0.0.1:3000', 'X-CSRF-Token': token },
      data: { ...command, notes: 'A newer saved reason' },
    });
    await form.getByRole('button', { name: 'Save Goal', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('record changed');
    await expect(form.getByLabel('Notes', { exact: true })).toHaveValue('My unsaved reasoning');
    const other = await browser.newContext({ baseURL: 'http://127.0.0.1:3000' });
    const bob = await other.newPage();
    await login(bob, 'bob@example.test');
    await bob.getByRole('button', { name: 'Goals', exact: true }).click();
    await expect(bob.getByText(name, { exact: true })).toHaveCount(0);
    expect((await bob.request.get(`/api/direction/goals/${id}`)).status()).toBe(404);
    const bobCsrf = await bob.request.get('/api/auth/csrf');
    const bobToken = (await bobCsrf.json()).token;
    expect(
      (
        await bob.request.patch(`/api/direction/goals/${id}`, {
          headers: { Origin: 'http://127.0.0.1:3000', 'X-CSRF-Token': bobToken },
          data: { ...command, notes: 'Must not persist' },
        })
      ).status(),
    ).toBe(404);
    expect((await page.request.get(`/api/direction/goals/${id}`)).status()).toBe(200);
    await other.close();
  });
});
