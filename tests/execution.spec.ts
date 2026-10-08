import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, clearE2ELimits } from '../packages/api/src/e2e-fixtures';
test.describe('integrated Phase 1 execution', () => {
  test.skip(!process.env.LIFE_OS_E2E_DATABASE_URL, 'Disposable PostgreSQL _e2e database required.');
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    if (process.env.LIFE_OS_E2E_DATABASE_URL)
      await clearE2ELimits(process.env.LIFE_OS_E2E_DATABASE_URL);
  });
  async function login(page: Page, email = 'alice@example.test') {
    await page.goto('/login?next=/');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Edit priorities' })).toBeVisible();
  }
  const day = () => (test.info().project.name === 'mobile' ? '2030-10-09' : '2030-10-08');
  test('blocks date-sensitive actions until the selected day loads, including returning to Today', async ({
    page,
  }) => {
    await login(page);
    const initialDate = await page.locator('.day-toolbar time').getAttribute('datetime');
    const selected = test.info().project.name === 'mobile' ? '2031-10-09' : '2031-10-08';
    let release!: () => void;
    let requested!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await page.route('**/api/execution/today?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('date') === selected) {
        requested();
        await held;
      }
      await route.continue();
    });
    await page.getByLabel('Selected day').fill(selected);
    try {
      await started;
      expect(await page.locator('.day-toolbar time').getAttribute('datetime')).toBe(initialDate);
      for (const name of [
        'Start Day',
        'Edit priorities',
        'Add block',
        'Save Scripture',
        'Save thought',
      ])
        await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
      await page
        .getByRole('button', { name: 'Start Day', exact: true })
        .evaluate((element: HTMLButtonElement) => element.click());
      await expect(page.getByRole('dialog')).not.toBeVisible();
    } finally {
      release();
    }
    await expect(page.locator('.day-toolbar time')).toHaveAttribute('datetime', selected);
    await page.getByRole('button', { name: 'Start Day', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('The One Thing', { exact: true }).fill('Use the selected day');
    await form.getByRole('button', { name: 'Start Day', exact: true }).click();
    await expect(form).not.toBeVisible();
    const persisted = await page.request.get('/api/execution/today?date=' + selected);
    expect((await persisted.json()).plan.oneThing).toBe('Use the selected day');

    await page.unroute('**/api/execution/today?*');
    let releaseToday!: () => void;
    const heldToday = new Promise<void>((resolve) => {
      releaseToday = resolve;
    });
    await page.route('**/api/execution/today?*', async (route) => {
      if (!new URL(route.request().url()).searchParams.has('date')) await heldToday;
      await route.continue();
    });
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    try {
      await expect(page.getByRole('button', { name: 'Close Day', exact: true })).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Edit priorities', exact: true }),
      ).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Add block', exact: true })).toBeDisabled();
    } finally {
      releaseToday();
    }
    await expect(page.locator('.day-toolbar time')).toHaveAttribute('datetime', initialDate!);
    await expect(page.getByRole('button', { name: 'Edit priorities', exact: true })).toBeEnabled();
  });
  test('plans, starts, completes and closes a local day with saved reflection and accessible forms', async ({
    page,
  }) => {
    await login(page);
    await page.getByLabel('Selected day').fill(day());
    await expect(page.locator('.day-toolbar')).toContainText(day());
    await page.getByRole('button', { name: 'Start Day', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('The One Thing', { exact: true }).fill('Deliver one useful result');
    await form.getByLabel('Outcome 1', { exact: true }).fill('A clear result');
    await form.getByLabel('Outcome 2', { exact: true }).fill('Protect attention');
    await form.getByLabel('What am I grateful for?').fill('The chance to build');
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await form.getByRole('button', { name: 'Start Day', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.locator('.one-thing')).toHaveText('Deliver one useful result');
    await page.locator('.big-three-list').getByLabel('A clear result').check();
    await expect(page.locator('.day-state')).toHaveText('Day started');
    await page.reload();
    await page.getByLabel('Selected day').fill(day());
    await expect(page.locator('.big-three-list').getByLabel('A clear result')).toBeChecked();
    await page.getByRole('button', { name: 'Close Day', exact: true }).click();
    await form.getByLabel('What did I learn?').fill('Make a deliberate choice');
    await form.getByRole('button', { name: 'Close Day', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.locator('.day-state')).toHaveText('Day closed');
    await expect(page.getByText('Make a deliberate choice', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit priorities' })).toBeDisabled();
    await page.getByRole('button', { name: 'Reopen Day', exact: true }).click();
    await expect(page.locator('.day-state')).toHaveText('Day started');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  });
  test('creates and edits a real timeline, rejects overlap and checks a recurring practice', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/schedule');
    await page.getByLabel('Selected day').fill(day());
    await expect(page.locator('.day-toolbar')).toContainText(day());
    await page.getByRole('button', { name: 'Add block' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Block title').fill('Protected execution');
    await form.getByLabel('Starts', { exact: true }).fill(day() + 'T09:00');
    await form.getByLabel('Ends', { exact: true }).fill(day() + 'T10:00');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.locator('.timeline')).toContainText('Protected execution');
    await page.getByRole('button', { name: 'Add block' }).click();
    await form.getByLabel('Block title').fill('Conflicting block');
    await form.getByLabel('Starts', { exact: true }).fill(day() + 'T09:30');
    await form.getByLabel('Ends', { exact: true }).fill(day() + 'T10:30');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('overlaps');
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('.timeline').getByRole('button', { name: 'Edit', exact: true }).click();
    await form.getByLabel('Block title').fill('A deliberate block');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).not.toBeVisible();
    await page.reload();
    await page.getByLabel('Selected day').fill(day());
    await expect(page.locator('.timeline')).toContainText('A deliberate block');
    await page.goto('/routines');
    await page.getByRole('button', { name: 'Add routine' }).click();
    await form.getByLabel('Routine name').fill('A small promise ' + test.info().project.name);
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).not.toBeVisible();
    const check = page
      .locator('.routine-list')
      .getByLabel('A small promise ' + test.info().project.name, { exact: true });
    await check.check();
    await page.reload();
    await expect(check).toBeChecked();
    const routineRow = page
      .locator('.routine-list li')
      .filter({ hasText: 'A small promise ' + test.info().project.name });
    await routineRow.getByRole('button', { name: 'Day note' }).click();
    await form.getByLabel('Notes for this day').fill('Kept a deliberate practice');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).not.toBeVisible();
    await page.reload();
    await expect(routineRow).toContainText('Kept a deliberate practice');
  });
  test('restores Focus timer and pause across reload, captures Later and records outcome', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/focus');
    await page.getByRole('button', { name: 'Start Focus', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Focus objective').fill('Focused evidence ' + test.info().project.name);
    await form.getByLabel('Duration preset').selectOption('25');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.locator('.focus-clock')).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    await page
      .getByLabel('What’s on your mind?')
      .fill('A distraction parked ' + test.info().project.name);
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    await expect(page.getByLabel('What’s on your mind?')).toHaveValue('');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Finish Focus', exact: true }).click();
    await form.getByLabel('What did you accomplish?').fill('Built meaningful evidence');
    await form.getByRole('button', { name: 'Finish Focus', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Focus', exact: true })).toBeVisible();
    await page.getByText('Recorded sessions on', { exact: false }).click();
    await expect(
      page
        .locator('#focus li')
        .filter({ hasText: 'Focused evidence ' + test.info().project.name })
        .getByText('Built meaningful evidence', { exact: true }),
    ).toBeVisible();
  });
  test('moves Inbox captures to Not Now and promotes once, searches through command palette', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/inbox');
    const title = 'Future possibility ' + test.info().project.name;
    await page.getByLabel('What’s on your mind?').fill(title + '\nOriginal context stays safe.');
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    const row = page.locator('.capture-list li').filter({ hasText: title });
    await row.getByRole('link', { name: 'Keep in Vault / Not Now' }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByLabel('Vault title')).toHaveValue(title);
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(page.locator('.vault-list')).toContainText('Original context stays safe.');
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog');
    await palette.getByLabel('Search your workspace').fill(title);
    await expect(
      palette.locator('.command-results a[href^="/vault?id="]').filter({ hasText: title }),
    ).toBeVisible();
    await palette.getByRole('button', { name: 'Close', exact: true }).click();
    await page
      .locator('.vault-list li')
      .filter({ hasText: title })
      .getByRole('button', { name: 'Turn into Task', exact: true })
      .click();
    await expect(page.locator('.vault-list li').filter({ hasText: title })).toHaveCount(0);
    await page.getByLabel('Show archived').check();
    const archived = page.locator('.vault-list li').filter({ hasText: title });
    await expect(archived.getByRole('link', { name: 'Converted Task' })).toBeVisible();
    await archived.getByRole('link', { name: 'Converted Task' }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  });
  test('rejects cross-account private links and clears an earlier account planning draft', async ({
    page,
  }) => {
    await login(page);
    const privateId = await page.evaluate(async () => {
      const id = crypto.randomUUID(),
        csrf = await (await fetch('/api/auth/csrf')).json();
      const result = await fetch('/api/execution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
        body: JSON.stringify({
          action: 'vault',
          requestId: crypto.randomUUID(),
          id,
          version: 0,
          title: 'Private Alice idea',
          body: 'A private thought',
          kind: 'not_now',
          archived: false,
          sourceInboxId: null,
        }),
      });
      if (!result.ok) throw new Error('Fixture creation failed.');
      return id;
    });
    await page.getByRole('button', { name: 'Edit priorities' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('The One Thing', { exact: true }).fill('Private unsaved Alice intention');
    const other = await page.context().newPage();
    await login(other, 'bob@example.test');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(form).not.toBeVisible();
    await expect(page.getByText('Private unsaved Alice intention')).toHaveCount(0);
    expect((await other.request.get('/api/execution/vault/' + privateId)).status()).toBe(404);
    await other.close();
  });
  test('rejects a command capture if the account changes between verification and submission', async ({
    page,
  }) => {
    await login(page);
    const { profile } = await (await page.request.get('/api/auth/session')).json();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    const text = 'Private command draft ' + test.info().project.name;
    await dialog.getByLabel('Quick Inbox capture').fill(text);
    // Switch the shared cookie after the UI verified Alice, during CSRF renewal.
    await page.route(
      '**/api/auth/csrf',
      async (route) => {
        const response = await route.fetch();
        const { token } = await response.json();
        const switched = await page.request.post('/api/auth/login', {
          headers: { Origin: 'http://127.0.0.1:3000', 'X-CSRF-Token': token },
          data: { email: 'bob@example.test', password: E2E_PASSWORD },
        });
        expect(switched.ok()).toBe(true);
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    const result = page.waitForResponse(
      (r) => r.url().endsWith('/api/inbox') && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Capture to Inbox', exact: true }).click();
    const rejected = await result;
    expect(rejected.request().headers()['x-life-os-account']).toBe(profile.id);
    expect(rejected.status()).toBe(401);
    await expect(dialog).not.toBeVisible();
    const inbox = await (await page.request.get('/api/inbox')).json();
    expect(inbox.items.some((item: { body: string }) => item.body === text)).toBe(false);
  });
  test('uses keyboard commands for capture / creation and saves stable daily content', async ({
    page,
  }) => {
    await login(page);
    const scripture = await page
      .locator('.execution-grid')
      .filter({ hasText: 'Daily Scripture' })
      .getByRole('heading')
      .first()
      .textContent();
    await page.getByRole('button', { name: 'Save Scripture', exact: true }).click();
    await page.getByRole('button', { name: 'Save thought', exact: true }).click();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('Quick Inbox capture')
      .fill('A keyboard capture ' + test.info().project.name);
    await dialog.getByRole('button', { name: 'Capture to Inbox', exact: true }).click();
    await expect(dialog.getByLabel('Quick Inbox capture')).toHaveValue('');
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await dialog.getByRole('link', { name: 'Create Task', exact: true }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByRole('heading', { name: 'New Task', exact: true })).toBeVisible();
    const title = 'A recommended next step ' + test.info().project.name;
    await form.getByLabel('Title', { exact: true }).fill(title);
    await form.getByLabel('Estimate (minutes)', { exact: true }).fill('25');
    await form.getByRole('button', { name: 'Save Task', exact: true }).click();
    await expect(form).not.toBeVisible();
    await page.goto('/');
    const recommendation = page.locator('.recommendation-list>li').filter({ hasText: title });
    await recommendation.getByRole('button', { name: 'Focus on Task', exact: true }).click();
    await expect(form.getByLabel('Focus objective')).toHaveValue(title);
    await expect(form.getByLabel('Planned minutes')).toHaveValue('25');
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.goto('/vault?kind=scripture');
    await expect(
      page
        .locator('.vault-list')
        .getByRole('heading', { name: scripture! + ' (KJV)', exact: true }),
    ).toBeVisible();
  });
});
