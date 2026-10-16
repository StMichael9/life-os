import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, clearE2ELimits } from '../packages/api/src/e2e-fixtures';
import type { ExecutionSnapshot } from '../packages/shared/src/execution';

test('identical blocks have independent timers, restart retains work and reset is audited', async ({
  page,
}) => {
  test.setTimeout(90000);
  test.skip(!process.env.LIFE_OS_E2E_DATABASE_URL, 'Disposable PostgreSQL _e2e database required.');
  await clearE2ELimits(process.env.LIFE_OS_E2E_DATABASE_URL!);
  page.on('dialog', (d) => d.accept());
  await page.goto('/login?next=/');
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Selected day')).toBeVisible();
  const dates =
    test.info().project.name === 'mobile'
      ? ['2040-10-03', '2040-10-04']
      : ['2040-10-01', '2040-10-02'];
  const title = 'Independent Algorithms ' + test.info().project.name;
  const snapshot = async () =>
    (await (await page.request.get('/api/execution/today')).json()) as ExecutionSnapshot;
  // Fixture setup uses the same authenticated, CSRF-protected HTTP commands as the UI.
  await page.evaluate(
    async ({ dates, title }) => {
      const { profile } = await (await fetch('/api/auth/session')).json();
      for (const date of dates) {
        const { token } = await (await fetch('/api/auth/csrf')).json();
        const response = await fetch('/api/execution', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
            'X-Life-OS-Account': profile.id,
          },
          body: JSON.stringify({
            action: 'schedule',
            requestId: crypto.randomUUID(),
            id: crypto.randomUUID(),
            version: 0,
            title,
            kind: 'focus',
            taskId: null,
            startsAt: date + 'T16:00:00Z',
            endsAt: date + 'T17:30:00Z',
            remove: false,
          }),
        });
        if (!response.ok) throw new Error('Fixture block creation failed: ' + response.status);
      }
    },
    { dates, title },
  );
  const form = page.getByRole('dialog');
  async function open(date: string) {
    await page.getByLabel('Selected day').fill(date);
    await expect(page.locator('.day-toolbar time')).toHaveAttribute('datetime', date);
    await page.locator('.calendar-event').filter({ hasText: title }).click();
  }
  await open(dates[0]!);
  await form.getByRole('button', { name: 'Start Focus', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  const first = (await snapshot()).focus!;
  expect(first.scheduleBlockId).toBeTruthy();
  await expect(form.getByRole('timer')).toBeVisible();
  await form.getByRole('button', { name: 'Close work block', exact: true }).click();
  await open(dates[1]!);
  await expect(form).toContainText('No saved session for this occurrence.');
  await expect(form).toContainText('Running elsewhere:');
  await expect(form.getByRole('timer')).toHaveCount(0);
  await form.getByRole('button', { name: 'Start Focus', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  const second = (await snapshot()).focus!;
  expect(second.scheduleBlockId).not.toBe(first.scheduleBlockId);
  expect(second.id).not.toBe(first.id);
  await form.getByRole('button', { name: 'Close work block', exact: true }).click();
  await open(dates[0]!);
  await form.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(async () => (await snapshot()).focus?.id).toBe(first.id);
  await form.getByRole('button', { name: 'New Session / Restart', exact: true }).click();
  await expect.poll(async () => (await snapshot()).focus?.id).not.toBe(first.id);
  await expect(form.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  const restarted = (await snapshot()).focus!;
  expect(restarted.scheduleBlockId).toBe(first.scheduleBlockId);
  await form.getByRole('button', { name: 'Reset to Zero…', exact: true }).click();
  await form.getByLabel('Reason for change').fill('Reset explicit occurrence attempt');
  await form.getByRole('button', { name: 'Reset to Zero', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  const detail = await (
    await page.request.get('/api/execution/work-session/' + restarted.id)
  ).json();
  expect(detail.session.activeSeconds).toBe(0);
  expect(detail.session.resumedAt).toBeNull();
  expect(detail.changes[0].kind).toBe('reset');
  expect((await snapshot()).focusSessions.some((s) => s.id === first.id)).toBe(true);
  await form.getByRole('button', { name: 'Close work block', exact: true }).click();
  await page.reload();
  await open(dates[1]!);
  await expect(form.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await expect(form.getByRole('button', { name: 'Resume ' + title, exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(async () => (await snapshot()).focus?.id).toBe(second.id);
});
