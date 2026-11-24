import type { Page } from '@playwright/test';
import { expect, test, expectNoHorizontalScroll, isMobile } from './support/fixtures';

const PAGES = [
  { label: 'Overview', heading: 'Overview' },
  { label: 'Mutual funds', heading: 'Mutual funds' },
  { label: 'Stocks', heading: 'Stocks' },
  { label: 'Employee equity', heading: 'Employee equity' },
  { label: 'Savings', heading: 'Savings' },
  { label: 'Provident fund', heading: 'Provident fund' },
  { label: 'Credit cards', heading: 'Credit cards' },
  { label: 'Settings', heading: 'Settings' },
];

const sidebar = (page: Page) => page.locator('nav.sidebar');
const bottomNav = (page: Page) => page.locator('nav.bottom-nav');

test.describe('app shell', () => {
  test('opens on Overview with no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page).toHaveTitle('Overview · Portfolio Tracker');
    await expectNoHorizontalScroll(page);
  });

  test('every page is reachable from the navigation', async ({ page }, testInfo) => {
    await page.goto('/overview');
    const mobile = isMobile(testInfo);
    for (const target of PAGES) {
      if (!mobile) {
        await sidebar(page).getByRole('link', { name: target.label }).click();
      } else if (['Overview', 'Mutual funds', 'Stocks'].includes(target.label)) {
        const short = target.label === 'Mutual funds' ? 'MF' : target.label;
        await bottomNav(page).getByRole('link', { name: short }).click();
      } else {
        await bottomNav(page).getByRole('button', { name: 'More' }).click();
        await page.getByRole('dialog').getByRole('link', { name: target.label }).click();
        await expect(page.getByRole('dialog')).toBeHidden();
      }
      await expect(page.getByRole('heading', { level: 1, name: target.heading })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test('layout switches at 768px and 1024px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'viewport sweep runs once');
    await page.goto('/overview');
    const overviewLabel = sidebar(page).locator('.nav-label', { hasText: 'Overview' });
    const sizes = [
      { width: 360, layout: 'bottom' },
      { width: 767, layout: 'bottom' },
      { width: 768, layout: 'rail' },
      { width: 1023, layout: 'rail' },
      { width: 1024, layout: 'sidebar' },
      { width: 1440, layout: 'sidebar' },
    ];
    for (const { width, layout } of sizes) {
      await page.setViewportSize({ width, height: 900 });
      if (layout === 'bottom') {
        await expect(bottomNav(page), `${width}px`).toBeVisible();
        await expect(sidebar(page), `${width}px`).toBeHidden();
      } else {
        await expect(bottomNav(page), `${width}px`).toBeHidden();
        await expect(sidebar(page), `${width}px`).toBeVisible();
        const box = await overviewLabel.boundingBox();
        const labelShown = !!box && box.width > 1;
        expect(labelShown, `${width}px sidebar labels`).toBe(layout === 'sidebar');
      }
      await expectNoHorizontalScroll(page);
    }
  });

  test('touch targets in the bottom bar are at least 44px', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'mobile only');
    await page.goto('/overview');
    for (const tab of await bottomNav(page).locator('.tab').all()) {
      const box = await tab.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('theme toggle switches dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/overview');
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveClass(/app-dark/);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).not.toHaveClass(/app-dark/);
  });

  test('refresh button re-queries and shows the update time', async ({ page }, testInfo) => {
    await page.goto('/overview');
    const refresh = page.getByRole('button', { name: 'Refresh data' });
    await expect(refresh).toHaveAttribute('aria-busy', 'false');
    await refresh.click();
    // Shows it is working (the icon spins), then settles once the data is back
    await expect(refresh).toHaveAttribute('aria-busy', 'true');
    await expect(refresh.locator('.pi-refresh')).toHaveClass(/pi-spin/);
    await expect(refresh).toHaveAttribute('aria-busy', 'false');
    await expect(refresh.locator('.pi-refresh')).not.toHaveClass(/pi-spin/);
    // On phones the time is for screen readers only; on desktop it is shown
    const updated = page.getByText(/^Updated \d{1,2}:\d{2}/);
    await expect(updated).toBeAttached();
    if (testInfo.project.name === 'desktop') await expect(updated).toBeVisible();
  });
});
