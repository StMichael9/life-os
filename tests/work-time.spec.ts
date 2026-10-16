import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E_PASSWORD, clearE2ELimits } from '../packages/api/src/e2e-fixtures';
import type { ExecutionSnapshot, WorkSessionDetail } from '../packages/shared/src/execution';

test('actual work stopwatch switches, freezes pauses, reconciles refresh and keeps corrections persistent', async ({
  page,
}) => {
  test.setTimeout(90000);
  test.skip(!process.env.LIFE_OS_E2E_DATABASE_URL, 'Isolated PostgreSQL _e2e database required.');
  await clearE2ELimits(process.env.LIFE_OS_E2E_DATABASE_URL!);
  page.on('dialog', (d) => d.accept());
  await page.goto('/login?next=/');
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const tracker = page.locator('.work-tracker'),
    form = page.getByRole('dialog');
  await expect(tracker).toBeVisible();
  const suffix = test.info().project.name,
    algorithms = 'Algorithms work ' + suffix,
    book = 'Bookvane work ' + suffix;
  const snapshot = async () =>
    (await (await page.request.get('/api/execution/today')).json()) as ExecutionSnapshot;
  async function start(title: string) {
    await tracker.getByRole('button', { name: 'New work session', exact: true }).click();
    await expect(form.getByLabel('Timer mode')).toHaveValue('stopwatch');
    await form.getByLabel('Focus objective').fill(title);
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(tracker.locator('.work-current')).toContainText(title);
  }
  await start(algorithms);
  await tracker.getByRole('button', { name: 'Open timer', exact: true }).click();
  const timer = page.locator('#focus').getByRole('timer', { name: 'Actual work elapsed' });
  await expect(timer).toHaveText(/\d{2}:\d{2}:\d{2}/);
  await expect
    .poll(async () => Number((await timer.textContent())?.split(':').at(-1)))
    .toBeGreaterThanOrEqual(1);
  await tracker.getByRole('button', { name: 'Pause work', exact: true }).click();
  await expect(
    page.locator('#focus').getByRole('button', { name: 'Resume', exact: true }),
  ).toBeEnabled();
  const frozen = await timer.textContent();
  await page.waitForTimeout(1200);
  await expect(timer).toHaveText(frozen!);
  const first = (await snapshot()).focusSessions.find((s) => s.objective === algorithms)!;
  expect(first.activeSeconds).toBeGreaterThan(0);
  await start(book);
  await page.reload();
  await page.getByRole('button', { name: 'Review running time', exact: true }).click();
  await form.getByLabel('Reason for change').fill('I kept working across the refresh');
  await form.getByRole('button', { name: 'Confirm I kept working', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Review running time', exact: true })).toHaveCount(
    0,
  );
  await tracker.getByRole('button', { name: 'Open timer', exact: true }).click();
  await page
    .locator('#focus')
    .getByRole('button', { name: 'Resume ' + algorithms, exact: true })
    .click();
  await expect(page.locator('#focus .selected-focus-title')).toHaveText(algorithms);
  const switched = await snapshot();
  expect(switched.focusSessions.find((s) => s.objective === book)!.resumedAt).toBeNull();
  expect(switched.focusSessions.filter((s) => s.resumedAt)).toHaveLength(1);
  expect(
    switched.focusSessions.find((s) => s.id === first.id)!.activeSeconds,
  ).toBeGreaterThanOrEqual(first.activeSeconds);
  await page.locator('#focus').getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await expect(form.getByLabel('What did you accomplish?')).toBeVisible();
  const preparing = (await snapshot()).focusSessions.find((s) => s.id === first.id)!;
  expect(preparing.resumedAt).toBeNull();
  await form.getByLabel('What did you accomplish?').fill('An actual result');
  await form.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await expect(form).not.toBeVisible();
  const afterFinish = await snapshot();
  expect(afterFinish.focusSessions.find((s) => s.objective === book)!.endedAt).toBeNull();
  await tracker.getByText('Work history & trends', { exact: true }).click();
  const history = tracker.locator('.work-breakdown').last();
  await history
    .locator('li')
    .filter({ hasText: algorithms })
    .getByRole('button', { name: 'Review time', exact: true })
    .click();
  const detail = (await (
    await page.request.get('/api/execution/work-session/' + first.id)
  ).json()) as WorkSessionDetail;
  await form.getByLabel('Reason for change').fill('Remove an accidentally tracked interval');
  await form.getByText('Exact instants for daylight-saving ambiguity', { exact: true }).click();
  await form.getByLabel('Exact end (ISO with offset)').fill(detail.intervals[0]!.startsAt);
  await form.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(
    tracker.getByRole('button', { name: 'New work session', exact: true }),
  ).toBeEnabled();
  const corrected = (await (
    await page.request.get('/api/execution/work-session/' + first.id)
  ).json()) as WorkSessionDetail;
  expect(corrected.changes).toHaveLength(1);
  expect(corrected.changes[0]!.reason).toBe('Remove an accidentally tracked interval');
  await tracker.getByRole('button', { name: 'Edit daily target', exact: true }).click();
  await form.getByLabel('Daily target (minutes)').fill('480');
  await form.getByRole('button', { name: 'Save target', exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.reload();
  await expect(
    tracker.getByRole('progressbar', { name: 'Daily actual-work target' }),
  ).toHaveAttribute('max', '28800');
  await tracker.getByText('Work history & trends', { exact: true }).click();
  await tracker.getByRole('button', { name: 'Last 30 days', exact: true }).click();
  await expect(tracker.locator('.work-day-bars > div')).toHaveCount(30);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const day = suffix === 'mobile' ? '2034-03-05' : '2034-03-04';
  await page.getByLabel('Selected day').fill(day);
  await expect(page.locator('.day-toolbar time')).toHaveAttribute('datetime', day);
  await page.getByRole('button', { name: 'Add block', exact: true }).click();
  await form.getByLabel('Block title').fill('Scheduled stopwatch ' + suffix);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  await page
    .locator('.calendar-event')
    .filter({ hasText: 'Scheduled stopwatch ' + suffix })
    .click();
  await form.getByRole('button', { name: 'Start work stopwatch', exact: true }).click();
  await expect(form.getByRole('timer', { name: 'Actual work elapsed' })).toBeVisible();
  expect((await snapshot()).focus?.timerMode).toBe('stopwatch');
  await form.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await form.getByRole('button', { name: 'Close work block', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.day-toolbar time')).not.toHaveAttribute('datetime', day);
  await page.screenshot({ path: test.info().outputPath('actual-work.png') });
});
