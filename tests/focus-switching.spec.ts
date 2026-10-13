import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, clearE2ELimits, seedPausedFocusE2E } from '../packages/api/src/e2e-fixtures';
test('one-click switching preserves independent circular timers and saved notes through reload', async ({
  page,
}) => {
  test.skip(!process.env.LIFE_OS_E2E_DATABASE_URL, 'Disposable _e2e database required.');
  const database = process.env.LIFE_OS_E2E_DATABASE_URL!,
    suffix = test.info().project.name;
  const algorithms = 'Algorithms ' + suffix,
    book = 'Bookvane ' + suffix;
  await clearE2ELimits(database);
  await seedPausedFocusE2E(database, algorithms);
  await page.goto('/login?next=/focus');
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const stage = page.locator('#focus'),
    form = page.getByRole('dialog');
  await expect(stage.locator('.selected-focus-title')).toHaveText(algorithms);
  await expect(stage.getByRole('timer')).toHaveText('45:00');
  await stage.getByRole('button', { name: 'New Session', exact: true }).click();
  await form.getByLabel('Focus objective').fill(book);
  await form.getByLabel('Planned minutes').fill('60');
  await form.getByText('Session notes (optional)', { exact: true }).click();
  await form
    .getByRole('textbox', { name: 'Focus notes', exact: true })
    .fill('Independent book notes');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(stage.locator('.selected-focus-title')).toHaveText(book);
  await expect(
    stage.getByRole('button', { name: 'Resume ' + algorithms, exact: true }),
  ).toContainText('45:00');
  await stage.getByRole('button', { name: 'Resume ' + algorithms, exact: true }).click();
  await expect(stage.locator('.selected-focus-title')).toHaveText(algorithms);
  await expect(stage.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  const other = stage.getByRole('button', { name: 'Resume ' + book, exact: true });
  await expect(other).toContainText('Paused');
  const bookRemaining = await other.locator('.session-remaining').textContent();
  await stage.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(stage.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  const frozen = await stage.getByRole('timer').textContent();
  await page.reload();
  await expect(stage.locator('.selected-focus-title')).toHaveText(algorithms);
  await expect(stage.getByRole('timer')).toHaveText(frozen!);
  await expect(other.locator('.session-remaining')).toHaveText(bookRemaining!);
  const resumedSnapshot = await (await page.request.get('/api/execution/today')).json();
  expect(
    resumedSnapshot.focusSessions.find((s: { objective: string }) => s.objective === book).notes,
  ).toBe('Independent book notes');
  await stage.getByText('Session notes', { exact: true }).click();
  await expect(stage).toContainText('Return to binary search');
  await stage.getByRole('button', { name: 'Edit notes', exact: true }).click();
  await form
    .getByRole('textbox', { name: 'Focus notes', exact: true })
    .fill('Resume with the saved invariant');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(stage.getByRole('timer')).toHaveText(frozen!);
  await other.click();
  await expect(stage.locator('.selected-focus-title')).toHaveText(book);
  await expect(stage.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await stage.getByRole('button', { name: 'Resume ' + algorithms, exact: true }).click();
  await expect(stage.locator('.selected-focus-title')).toHaveText(algorithms);
  await expect(stage.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('focus-switching.png') });
  await stage.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await form.getByText('Session notes', { exact: true }).click();
  await expect(form.getByRole('textbox', { name: 'Focus notes', exact: true })).toHaveValue(
    'Resume with the saved invariant',
  );
  await form.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(stage.locator('.selected-focus-title')).toHaveText(book);
  await expect(stage.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await stage.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await form.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await expect(form).not.toBeVisible();
  const snapshot = await (await page.request.get('/api/execution/today')).json();
  expect(
    snapshot.focusSessions.some(
      (s: { objective: string }) => s.objective === algorithms || s.objective === book,
    ),
  ).toBe(false);
});
