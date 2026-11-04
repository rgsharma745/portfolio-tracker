import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the local Supabase stack, never production: `npm run start:local`
 * serves the app on port 4300 (no clash with `npm start` on 4200) built with local keys.
 * Viewports from docs/UI_SPEC.md: every page is checked at mobile and desktop size.
 */
const OWNER_STATE = 'playwright/.auth/owner.json';
const PORT = 4300;

export default defineConfig({
  testDir: './e2e',
  // One worker: specs share the seeded e2e user and its settings row.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        storageState: OWNER_STATE,
      },
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: OWNER_STATE,
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
