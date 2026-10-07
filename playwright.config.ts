import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'pnpm --filter @life-os/web start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.LIFE_OS_E2E_DATABASE_URL ?? '',
      AUTH_SECRET: 'isolated-browser-fixture-secret-at-least-32-bytes',
      APP_ORIGIN: 'http://127.0.0.1:3000',
      AUTH_ALLOW_HTTP_LOOPBACK: 'true',
    },
  },
});
