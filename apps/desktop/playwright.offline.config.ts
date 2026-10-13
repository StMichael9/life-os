import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './offline-tests',
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  outputDir: '../../test-results/offline',
});
