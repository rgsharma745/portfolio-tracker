import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the local Supabase stack, never production: `npm run start:local`
 * serves the app on port 4300 (no clash with `npm start` on 4200) built with local keys.
 * Viewports from docs/UI_SPEC.md: every page is checked at mobile and desktop size, and in
 * WebKit as an iPhone.
 */
const PORT = 4300;

export default defineConfig({
  testDir: './e2e',
  // E2E code coverage, only with E2E_COVERAGE=1 (e2e/support/coverage.ts).
  globalSetup: './e2e/support/coverage-setup.ts',
  globalTeardown: './e2e/support/coverage-teardown.ts',
  // Parallel. Each worker has its own e2e users (e2e/support/fixtures.ts); tests that rewrite
  // shared rows take a lock (`exclusive`). Locally Playwright's default (half the cores).
  // GitHub's runner for this private repo has 2 cores, where that default is 1 worker; the
  // tests mostly wait on the browser, database and dev server, so 2 still run side by side.
  workers: process.env['CI'] ? 2 : undefined,
  // The long add/edit/delete journeys (FD, PPF, PF) take about 15 s locally; on the slower
  // 2-core runner, sharing it with a second worker, they passed the default 30 s.
  timeout: process.env['CI'] ? 60_000 : 30_000,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
    {
      // Safari's engine with an iPhone's screen, touch and user agent (docs/UI_SPEC.md: iOS).
      name: 'iphone',
      use: devices['iPhone 15'],
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    // Not `npm start`: that would rewrite the env.ts a dev server on 4200 is using.
    command: 'npm run start:local',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
