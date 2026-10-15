import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, clearE2ELimits } from '../packages/api/src/e2e-fixtures';
test('calendar block opens an inline countdown, persists pause/reload and recurring exceptions', async ({
  page,
}) => {
  test.skip(!process.env.LIFE_OS_E2E_DATABASE_URL, 'Disposable PostgreSQL _e2e database required.');
  await clearE2ELimits(process.env.LIFE_OS_E2E_DATABASE_URL!);
  page.on('dialog', (d) => d.accept());
  await page.goto('/login?next=/');
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toContainText('Calendar');
  const date = test.info().project.name === 'mobile' ? '2032-10-05' : '2032-10-04';
  await page.getByLabel('Selected day').fill(date);
  await expect(page.locator('.day-toolbar time')).toHaveAttribute('datetime', date);
  await page.getByRole('button', { name: 'Add block', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Block title').fill('Algorithms ' + test.info().project.name);
  await form.getByLabel('Objective (optional)').fill('Learn one algorithm');
  await form.getByLabel('Starts', { exact: true }).fill(date + 'T09:00');
  await form.getByLabel('Ends', { exact: true }).fill(date + 'T10:30');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  const event = page
    .locator('.calendar-event')
    .filter({ hasText: 'Algorithms ' + test.info().project.name });
  await expect(event).toBeVisible();
  expect(await event.evaluate((e) => Math.round(e.getBoundingClientRect().height))).toBe(96);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('calendar.png') });
  await event.click();
  await form.getByRole('button', { name: 'Start Focus', exact: true }).click();
  await expect(form.getByRole('timer')).toBeVisible();
  await expect(form).toContainText('90-minute intention');
  const running = await (await page.request.get('/api/execution/today?date=' + date)).json();
  const sessionId = running.focus.id as string;
  await form.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await form.getByRole('button', { name: 'Close work block', exact: true }).click();
  await page.reload();
  await page.getByLabel('Selected day').fill(date);
  await expect(page.locator('.day-toolbar time')).toHaveAttribute('datetime', date);
  await event.click();
  await expect(form.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await form.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await form.getByLabel('What did you accomplish?').fill('A useful result');
  await form.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Start Focus', exact: true })).toBeVisible();
  const snapshot = await (await page.request.get('/api/execution/today?date=' + date)).json();
  expect(snapshot.focusSessions.some((s: { id: string }) => s.id === sessionId)).toBe(false);
  expect(snapshot.focus?.id).not.toBe(sessionId);
  await form.getByRole('button', { name: 'Close work block', exact: true }).click();
  await page.getByRole('button', { name: 'Add block', exact: true }).click();
  await form.getByLabel('Block title').fill('Repeat practice ' + test.info().project.name);
  await form.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('daily');
  await form.getByLabel('Repeat from').fill(date);
  await form.getByLabel('Repeat through').fill(date);
  await form.getByLabel('Start time', { exact: true }).fill('12:00');
  await form.getByLabel('End time', { exact: true }).fill('13:00');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  const recurring = page
    .locator('.calendar-event')
    .filter({ hasText: 'Repeat practice ' + test.info().project.name });
  await recurring.click();
  await form.getByText('Block details', { exact: true }).click();
  await form.getByRole('button', { name: 'Edit recurring series', exact: true }).click();
  await form.getByLabel('Block title').fill('Updated repeat ' + test.info().project.name);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toContainText('Updated repeat');
  await form.getByText('Block details', { exact: true }).click();
  await form.getByRole('button', { name: 'Skip this occurrence', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.locator('.calendar-event').filter({ hasText: 'Updated repeat' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.locator('.work-calendar')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.calendar-day')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
