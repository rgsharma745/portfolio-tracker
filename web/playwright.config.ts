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
  // Parallel (Playwright's default: half the CPU cores). Each worker has its own e2e users
  // (e2e/support/fixtures.ts); tests that rewrite shared rows take a lock (`exclusive`).
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
