import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './tests',
  globalSetup: '../../tests/global-setup.ts',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: '../../test-results/desktop',
  webServer: {
    command: 'pnpm --filter @life-os/web start',
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
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
