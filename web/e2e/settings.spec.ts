import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import {
  SETTINGS_EMAIL,
  adminDelete,
  adminInsert,
  adminUpsert,
  ensureUser,
  expectNoHorizontalScroll,
  seedPortfolios,
  signInWithMagicLink,
  isMobile,
} from './support/fixtures';

// A dedicated user: these tests add, rename and delete portfolios.
test.use({ storageState: { cookies: [], origins: [] } });

const portfolioNames = (page: Page) =>
  page.locator('app-portfolios-section li.row .name > span:first-child');

test('manage portfolios: add, rename, reorder, deactivate, delete', async ({ page }, testInfo) => {
  await seedPortfolios(await ensureUser(SETTINGS_EMAIL), ['Me', 'Wife']);
  await signInWithMagicLink(page, SETTINGS_EMAIL);
  await page.goto('/settings');
  await expect(portfolioNames(page)).toHaveText(['Me', 'Wife']);
  await expectNoHorizontalScroll(page);

  // Add
  await page.getByLabel('New portfolio name').fill('Kids');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(portfolioNames(page)).toHaveText(['Me', 'Wife', 'Kids']);

  // Duplicate names are explained, not silently rejected
  await page.getByLabel('New portfolio name').fill('Me');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('A portfolio with this name already exists.')).toBeVisible();

  // Rename
  await page.getByRole('button', { name: 'Rename Kids' }).click();
  await page.getByLabel('New name for Kids').fill('Children');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(portfolioNames(page)).toHaveText(['Me', 'Wife', 'Children']);

  // Reorder
  await page.getByRole('button', { name: 'Move Children up' }).click();
  await expect(portfolioNames(page)).toHaveText(['Me', 'Children', 'Wife']);
  await expect(page.getByRole('button', { name: 'Move Me up' })).toBeDisabled();

  // Deactivate: tagged, and gone from the switcher
  await page.getByRole('switch', { name: 'Wife active' }).click();
  await expect(page.getByTestId('portfolio-Wife').getByText('Inactive')).toBeVisible();
  if (isMobile(testInfo)) {
    await expect(page.getByRole('group', { name: 'Portfolio' }).getByRole('button')).toHaveText([
      'All',
      'Me',
      'Children',
    ]);
  }

  // Delete needs the name typed exactly
  await page.getByRole('button', { name: 'Delete Children' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Children?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('0 mutual fund holdings')).toBeVisible();
  if (isMobile(testInfo)) {
    // Polls because the dialog scales in when it opens.
    await expect
      .poll(async () => (await dialog.boundingBox())?.width, {
        message: 'dialog is a full-screen sheet on mobile',
      })
      .toBe(page.viewportSize()?.width);
  }
  const confirm = dialog.getByRole('button', { name: 'Delete permanently' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type Children to confirm/).fill('children');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type Children to confirm/).fill('Children');
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(portfolioNames(page)).toHaveText(['Me', 'Wife']);
});

test('data check lists what cannot be valued', async ({ page }) => {
  const ownerId = await ensureUser(SETTINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me', 'Old'], ['Old']);
  const me = ids['Me'];
  await adminDelete('job_runs', { job: 'eq.fetch_nav' });
  await adminUpsert('mf_nav_latest', [{ scheme_code: 'e2e-100', nav: 10, nav_date: '2026-11-03' }]);
  await adminInsert('job_runs', [
    { job: 'fetch_nav', status: 'success', message: '{"unmatched":["e2e-404"]}' },
  ]);
  await adminInsert('mf_holdings', [
    { owner_id: ownerId, portfolio_id: me, scheme_name: 'Priced Fund', scheme_code: 'e2e-100' },
    { owner_id: ownerId, portfolio_id: me, scheme_name: 'Codeless Fund', scheme_code: null },
    { owner_id: ownerId, portfolio_id: me, scheme_name: 'Typo Fund', scheme_code: 'e2e-404' },
    { owner_id: ownerId, portfolio_id: me, scheme_name: 'New Fund', scheme_code: 'e2e-200' },
    { owner_id: ownerId, portfolio_id: ids['Old'], scheme_name: 'Ignored', scheme_code: null },
  ]);
  await adminInsert('stock_holdings', [
    { owner_id: ownerId, portfolio_id: me, symbol: 'E2EUNPRICED', market: 'IN' },
  ]);
  await adminInsert('credit_cards', [
    { owner_id: ownerId, portfolio_id: me, name: 'Dayless Card', bill_day: 14 },
  ]);

  await signInWithMagicLink(page, SETTINGS_EMAIL);
  await page.goto('/settings');

  const group = (kind: string) => page.getByTestId(`check-${kind}`);
  await expect(group('mf_no_code')).toContainText('Codeless Fund');
  await expect(group('mf_no_code')).not.toContainText('Ignored');
  await expect(group('mf_code_not_found')).toContainText('Typo Fund');
  await expect(group('mf_no_nav')).toContainText('New Fund');
  await expect(group('stock_no_price')).toContainText('E2EUNPRICED');
  await expect(group('card_missing_days')).toContainText('No due day');
  await expect(page.getByText('Priced Fund')).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // Clear the problems and re-run: all good
  await seedPortfolios(ownerId, ['Me']);
  await page.getByRole('button', { name: 'Run data check again' }).click();
  await expect(page.getByText('All good: everything can be valued.')).toBeVisible();

  await adminDelete('job_runs', { job: 'eq.fetch_nav' });
  await adminDelete('mf_nav_latest', { scheme_code: 'eq.e2e-100' });
});

test('manual prices, job runs and data export', async ({ page }) => {
  const ownerId = await ensureUser(SETTINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me']);
  await adminDelete('stock_price_latest', { symbol: 'eq.E2EMANUAL' });
  await adminDelete('job_runs', { job: 'eq.fetch_nav' });
  await adminInsert('job_runs', [
    {
      job: 'fetch_nav',
      status: 'success',
      message: '{"updated":7,"unmatched":["1"]}',
      finished_at: new Date().toISOString(),
    },
  ]);
  await adminInsert('stock_holdings', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      market: 'US',
      symbol: 'E2EMANUAL',
      currency: 'USD',
      quantity: 1,
      invested: 10,
    },
  ]);

  await signInWithMagicLink(page, SETTINGS_EMAIL);
  await page.goto('/settings');

  // Job runs: the NAV job's JSON message is summarised; jobs that never ran say so
  await expect(page.getByTestId('job-fetch_nav')).toContainText('7 updated, 1 not found');
  await expect(page.getByTestId('job-backup')).toContainText('Not run yet');

  // Manual price: validation, then a USD price for a US stock
  const prices = page.getByRole('region', { name: 'Manual prices' });
  await prices.getByLabel('Symbol').fill('E2EMANUAL');
  await prices.getByRole('button', { name: 'Set manual price' }).click();
  await expect(prices.getByText('Enter the price.')).toBeVisible();
  await prices.getByLabel('Price ($)').fill('12.5');
  await prices.getByRole('button', { name: 'Set manual price' }).click();
  const list = prices.getByRole('list', { name: 'Manual prices' });
  await expect(list).toContainText('E2EMANUAL');
  await expect(list).toContainText('$12.50');
  await expectNoHorizontalScroll(page);

  // Export downloads a JSON file with the owner's tables
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all data (JSON)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^portfolio-export-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(readFileSync(await file.path(), 'utf8'));
  expect(data.tables.stock_holdings[0].symbol).toBe('E2EMANUAL');
  expect(Object.keys(data.tables)).toContain('card_bills');

  // Remove the manual price: the row goes, so the jobs take the symbol back
  await prices.getByRole('button', { name: 'Remove manual price for E2EMANUAL' }).click();
  await expect(prices.getByRole('list', { name: 'Manual prices' })).toBeHidden();
  await adminDelete('job_runs', { job: 'eq.fetch_nav' });
});

test('run NAVs and prices now from Job runs', async ({ page }) => {
  // The Worker (/api/jobs/:job) is stubbed: it would dispatch real GitHub workflows.
  await seedPortfolios(await ensureUser(SETTINGS_EMAIL), ['Me']);
  await adminDelete('job_triggers', { job: 'in.(fetch_nav,fetch_prices)' });
  const inHalfAnHour = new Date(Date.now() + 30 * 60_000).toISOString();
  const calls: string[] = [];
  await page.route('**/api/jobs/*', async (route) => {
    const url = route.request().url();
    // allHeaders(): WebKit leaves Authorization out of headers().
    const auth = (await route.request().allHeaders())['authorization'] ?? '';
    calls.push(`${route.request().method()} ${new URL(url).pathname} ${/^Bearer \S+$/.test(auth)}`);
    if (url.endsWith('/fetch_nav')) {
      await route.fulfill({
        status: 202,
        json: {
          status: 'triggered',
          nextAllowedAt: inHalfAnHour,
          runUrl: 'https://github.com/owner/repo/actions/runs/1',
        },
      });
    } else if (calls.filter((c) => c.includes('/fetch_prices')).length === 1) {
      await route.fulfill({
        status: 502,
        json: { status: 'error', message: 'GitHub did not start the job. Try again.' },
      });
    } else {
      await route.fulfill({
        status: 429,
        json: { status: 'cooldown', nextAllowedAt: inHalfAnHour },
      });
    }
  });

  await signInWithMagicLink(page, SETTINGS_EMAIL);
  await page.goto('/settings');

  const runNav = page.getByRole('button', { name: 'Run now: Mutual fund NAVs' });
  const runPrices = page.getByRole('button', { name: 'Run now: Stock prices and USD/INR' });
  await expect(runNav).toBeEnabled();
  await expect(page.getByTestId('job-snapshot').getByRole('button')).toHaveCount(0);

  // Started: locked for 30 minutes, with a link to the run
  await runNav.click();
  await expect(page.getByTestId('notice-fetch_nav')).toContainText('Started.');
  await expect(page.getByTestId('notice-fetch_nav').getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/owner/repo/actions/runs/1',
  );
  await expect(page.getByTestId('next-fetch_nav')).toContainText('Available again at');
  await expect(runNav).toBeDisabled();

  // GitHub refused: explained, and the button stays usable
  await runPrices.click();
  await expect(page.getByTestId('notice-fetch_prices')).toContainText('GitHub did not start');
  await expect(runPrices).toBeEnabled();

  // Locked elsewhere (another device): shows when it frees up
  await runPrices.click();
  await expect(page.getByTestId('notice-fetch_prices')).toContainText('Already run');
  await expect(runPrices).toBeDisabled();
  await expectNoHorizontalScroll(page);

  // Each call is a POST carrying the session token
  expect(calls).toEqual([
    'POST /api/jobs/fetch_nav true',
    'POST /api/jobs/fetch_prices true',
    'POST /api/jobs/fetch_prices true',
  ]);
});
