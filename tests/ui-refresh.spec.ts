import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E_PASSWORD, clearE2ELimits, seedPausedFocusE2E } from '../packages/api/src/e2e-fixtures';

test('refreshed workspace keeps keyboard navigation, processing and responsive forms usable', async ({
  page,
}) => {
  test.setTimeout(60000);
  test.skip(!process.env.LIFE_OS_E2E_DATABASE_URL, 'Disposable PostgreSQL _e2e database required.');
  await clearE2ELimits(process.env.LIFE_OS_E2E_DATABASE_URL!);
  await seedPausedFocusE2E(
    process.env.LIFE_OS_E2E_DATABASE_URL!,
    'A saved intention ' + test.info().project.name,
  );
  const faults: string[] = [];
  page.on('pageerror', (error) => faults.push(error.message));
  await page.goto('/login?next=/');
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.screenshot({ path: test.info().outputPath('login.png') });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

  const compactFocus = page.locator('.focus-disclosure');
  await expect(compactFocus).not.toHaveAttribute('open');
  await compactFocus.locator(':scope > summary').click();
  await expect(compactFocus.getByRole('timer')).toHaveText('45:00');
  await compactFocus.locator(':scope > summary').click();
  await expect(compactFocus.getByRole('timer')).not.toBeVisible();
  const more = page.getByRole('button', { name: 'More', exact: true });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'More', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole('menuitem', { name: 'Inbox', exact: true }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  const name = 'A saved possibility ' + test.info().project.name;
  await page.getByLabel('What’s on your mind?').fill(name);
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  const row = page.locator('.capture-list > li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Capture actions' }).click();
  await page.getByRole('menuitem', { name: 'Keep in Vault / Not Now' }).click();
  const form = page.getByRole('dialog');
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.reload();
  const saved = page.locator('.vault-list > li').filter({ hasText: name });
  await expect(saved).toBeVisible();
  await saved.getByText('Context & notes', { exact: true }).click();
  await expect(saved.locator('.preserve-lines')).toContainText(name);
  await saved.getByRole('button', { name: 'Actions for ' + name }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Vault title', { exact: true })).toHaveValue(name);
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();

  for (const path of [
    '/',
    '/schedule',
    '/direction',
    '/tasks',
    '/focus',
    '/routines',
    '/inbox',
    '/vault',
  ]) {
    await page.goto(path);
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('.loading-state')).toHaveCount(0);
    await expect(page.locator('.form-error')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      path,
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations, path).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath((path === '/' ? 'today' : path.slice(1)) + '.png'),
    });
  }
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Search your workspace')).toBeFocused();
  await page.getByLabel('Search your workspace').fill(name);
  await expect(page.locator('.command-results')).toContainText(name);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.command-results a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(faults).toEqual([]);
});
