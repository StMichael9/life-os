import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, clearE2ELimits } from '../packages/api/src/e2e-fixtures';

test.describe('authenticated Inbox on isolated PostgreSQL', () => {
  test.skip(
    !process.env.LIFE_OS_E2E_DATABASE_URL,
    'Set LIFE_OS_E2E_DATABASE_URL to an isolated PostgreSQL database ending in _e2e.',
  );
  test.beforeEach(async () => {
    if (process.env.LIFE_OS_E2E_DATABASE_URL)
      await clearE2ELimits(process.env.LIFE_OS_E2E_DATABASE_URL);
  });
  async function signIn(page: import('@playwright/test').Page, email: string) {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  }
  test('signs in, persists owner captures across reload, and revokes logout', async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await signIn(page, 'alice@example.test');
    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name === 'life_os_dev_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    const body = `Alice private browser capture ${test.info().project.name}`;
    await page.getByLabel('What’s on your mind?').fill(body);
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    await expect(page.getByText(body, { exact: true })).toBeVisible();
    await expect(page.getByLabel('What’s on your mind?')).toHaveValue('');
    await page.reload();
    await expect(page.getByText(body, { exact: true })).toBeVisible();
    const oldCookie = session!.value;
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    const revoked = await page.request.get('/api/inbox', {
      headers: { Cookie: `life_os_dev_session=${oldCookie}` },
    });
    expect(revoked.status()).toBe(401);
    expect(errors).toEqual([]);
  });
  test('retains text after a lost response and retries without duplicate persistence', async ({
    page,
  }) => {
    await signIn(page, 'alice@example.test');
    let lost = true;
    await page.route('**/api/inbox', async (route) => {
      if (route.request().method() === 'POST' && lost) {
        lost = false;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    const body = `Retry capture ${test.info().project.name}`;
    await page.getByLabel('What’s on your mind?').fill(body);
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry capture', exact: true })).toBeVisible();
    await expect(page.getByLabel('What’s on your mind?')).toHaveValue(body);
    await page.getByRole('button', { name: 'Retry capture', exact: true }).click();
    await expect(page.getByLabel('What’s on your mind?')).toHaveValue('');
    await page.reload();
    await expect(page.getByText(body, { exact: true })).toHaveCount(1);
  });
  test('isolates two browser accounts and blocks CSRF/session spoofing', async ({
    browser,
    page,
  }) => {
    await signIn(page, 'alice@example.test');
    const secret = `Isolation secret ${test.info().project.name}`;
    await page.getByLabel('What’s on your mind?').fill(secret);
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    await expect(page.getByText(secret, { exact: true })).toBeVisible();
    const other = await browser.newContext({ baseURL: 'http://127.0.0.1:3000' });
    const bob = await other.newPage();
    await signIn(bob, 'bob@example.test');
    await expect(bob.getByText(secret, { exact: true })).toHaveCount(0);
    const spoof = await bob.request.get('/api/inbox?userId=00000000-0000-4000-8000-000000000001');
    expect(spoof.status()).toBe(400);
    const blocked = await bob.request.post('/api/inbox', {
      data: { body: 'forged', requestId: crypto.randomUUID() },
      headers: { Origin: 'https://evil.test' },
    });
    expect(blocked.status()).toBe(403);
    await other.close();
  });
  test('keeps login errors generic and the authenticated page accessible', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('bob@example.test');
    await page.getByLabel('Password', { exact: true }).fill('wrong password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Welcome back.' }).getByRole('alert')).toHaveText(
      'Email or password is incorrect.',
    );
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await signIn(page, 'bob@example.test');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  });
  test('clears private records after session revocation while retaining unsent text', async ({
    page,
  }) => {
    await signIn(page, 'alice@example.test');
    const saved = `Revoked session capture ${test.info().project.name}`;
    await page.getByLabel('What’s on your mind?').fill(saved);
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    await expect(page.getByText(saved, { exact: true })).toBeVisible();
    await page.getByLabel('What’s on your mind?').fill('Keep this unsent thought');
    // Revoke from another client action without navigating this view away.
    const csrf = await page.request.get('/api/auth/csrf');
    const { token } = await csrf.json();
    const logout = await page.request.post('/api/auth/logout', {
      headers: { Origin: 'http://127.0.0.1:3000', 'X-CSRF-Token': token },
      data: {},
    });
    expect(logout.status()).toBe(200);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sign in again' })).toBeVisible();
    await expect(page.getByText(saved, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('What’s on your mind?')).toHaveValue('Keep this unsent thought');
    await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeDisabled();
  });
  test('blocks an earlier account draft after another tab changes the login', async ({
    page,
    context,
  }) => {
    await signIn(page, 'alice@example.test');
    const draft = `Earlier account draft ${test.info().project.name}`;
    await page.getByLabel('What’s on your mind?').fill(draft);
    const other = await context.newPage();
    await signIn(other, 'bob@example.test');
    // Submit without foreground revalidation masking the capture identity guard.
    await page
      .locator('.capture-panel form')
      .evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.getByRole('link', { name: 'Sign in again' })).toBeVisible();
    await expect(page.getByLabel('What’s on your mind?')).toHaveValue(draft);
    await expect(page.locator('.capture-list li')).toHaveCount(0);
    const data = await other.request.get('/api/inbox');
    expect((await data.json()).items.some((item: { body: string }) => item.body === draft)).toBe(
      false,
    );
    await other.close();
  });
});
