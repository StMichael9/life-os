import { expect, test } from '@playwright/test';

test('Today works with production CSP, keyboard settings, and no horizontal overflow', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response?.headers()['content-security-policy']).not.toContain("'unsafe-eval'");
  await expect(page.getByRole('heading', { name: 'Make today count.' })).toBeVisible();
  await expect(page.getByText('FOUNDATION PREVIEW', { exact: true })).toBeVisible();
  await expect(page.getByTestId('scripture')).not.toBeEmpty();
  const scripture = await page.getByTestId('scripture').textContent();
  await page.reload();
  await expect(page.getByTestId('scripture')).toHaveText(scripture!);
  await page.getByRole('button', { name: 'Date and timezone settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Timezone', { exact: true }).selectOption('America/Los_Angeles');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Date and timezone settings' }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('daily content follows local midnight instead of server UTC', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T06:59:30Z') });
  await page.goto('/');
  await page.getByRole('button', { name: 'Date and timezone settings' }).click();
  await page.getByLabel('Timezone', { exact: true }).selectOption('America/Los_Angeles');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('local-date')).toHaveText('Tuesday, October 6');
  const before = await page.getByTestId('scripture').textContent();
  await page.clock.fastForward(60_000);
  await expect(page.getByTestId('local-date')).toHaveText('Wednesday, October 7');
  await expect(page.getByTestId('scripture')).not.toHaveText(before!);
});

test('has no automated WCAG A/AA accessibility violations', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await page.goto('/');
  await expect(page.getByTestId('scripture')).not.toBeEmpty();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'Date and timezone settings' }).click();
  const dialogResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(dialogResults.violations).toEqual([]);
});
