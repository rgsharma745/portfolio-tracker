import { type Page, expect, test } from '@playwright/test';
import {
  SETTINGS_EMAIL,
  adminDelete,
  adminInsert,
  ensureUser,
  expectNoHorizontalScroll,
  seedPortfolios,
  signInWithMagicLink,
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
  if (testInfo.project.name === 'mobile') {
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
  if (testInfo.project.name === 'mobile') {
    // Polls because the dialog scales in when it opens.
    await expect
      .poll(async () => (await dialog.boundingBox())?.width, {
        message: 'dialog is a full-screen sheet on mobile',
      })
      .toBe(390);
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
  await adminInsert('mf_nav_latest', [{ scheme_code: 'e2e-100', nav: 10, nav_date: '2026-11-03' }]);
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
