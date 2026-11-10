import type { CoverageReportOptions } from 'monocart-coverage-reports';

/**
 * E2E code coverage for SonarQube (docs/RUNBOOK.md › SonarQube), on only with E2E_COVERAGE=1
 * (CI sets it when the scan runs). Chromium records which app code each test runs
 * (`page.coverage`, V8); the dev server's source maps map it back to `src/app`. Workers add
 * their data to a shared cache (fixtures.ts), and one report is written after the run
 * (coverage-teardown.ts). WebKit has no coverage API, so the iPhone project adds nothing.
 */
export const E2E_COVERAGE = process.env['E2E_COVERAGE'] === '1';

export const coverageOptions: CoverageReportOptions = {
  name: 'E2E coverage',
  outputDir: 'coverage/e2e',
  reports: ['lcovonly', 'console-summary'],
  // App scripts from the dev server (start:local on 4300), not Playwright's or the browser's.
  entryFilter: (entry) =>
    entry.url.startsWith('http://localhost:4300/') && entry.url.endsWith('.js'),
  // Only our code from the source maps; the same files the unit-test lcov covers.
  sourceFilter: (sourcePath) =>
    sourcePath.includes('src/app/') &&
    !sourcePath.includes('node_modules') &&
    !sourcePath.endsWith('.spec.ts'),
  // Paths like the unit-test lcov (`src/app/…`), so CI rewrites both the same way.
  sourcePath: (filePath) => filePath.slice(filePath.indexOf('src/app/')),
};
