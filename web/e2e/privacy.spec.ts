import { expect, test } from '@playwright/test';
import {
  HOLDINGS_EMAIL,
  adminInsert,
  adminUpsert,
  ensureUser,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

/** Any formatted amount: ₹6,000, $12.50, +₹120, ₹1.2L. */
const AMOUNT = /[₹$]\s?\d/;

test('privacy: hide amounts masks money on every page and is remembered', async ({
  page,
}, testInfo) => {
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me']);
  const today = new Date().toISOString().slice(0, 10);
  await adminUpsert('mf_nav_latest', [
    { scheme_code: 'e2e-pv-1', nav: 50, nav_date: today, prev_nav: 49 },
  ]);
  await adminInsert('mf_holdings', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      scheme_name: 'E2E Privacy Fund',
      scheme_code: 'e2e-pv-1',
      units: 100,
      invested: 4000,
    },
  ]);
  await adminInsert('savings_accounts', [
    { owner_id: ownerId, portfolio_id: ids['Me'], bank: 'E2E Privacy Bank', balance: 4000 },
  ]);

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/overview');
  const main = page.getByRole('main');
  await expect(main).toContainText('₹5,000');

  const toggle = page.getByRole('button', { name: 'Hide amounts' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(main).toContainText('••••');
  await expect(main).not.toContainText(AMOUNT);
  await screenshot(page, 'privacy-overview', testInfo.project.name);

  for (const path of ['/mutual-funds', '/savings']) {
    await page.goto(path);
    await expect(main).toContainText('••••');
    await expect(main).not.toContainText(AMOUNT);
  }
  // Names and percentages stay readable.
  await expect(main).toContainText('E2E Privacy Bank');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Hide amounts' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(main).not.toContainText(AMOUNT);

  await page.getByRole('button', { name: 'Hide amounts' }).click();
  await expect(main).toContainText('₹4,000');
});
