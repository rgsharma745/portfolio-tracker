import { expect, test } from '@playwright/test';
import {
  HOLDINGS_EMAIL,
  adminInsert,
  adminUpsert,
  ensureUser,
  expectNoHorizontalScroll,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
  statCard,
  isMobile,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

test('overview: totals, allocation, history and summary by portfolio', async ({
  page,
}, testInfo) => {
  const mobile = isMobile(testInfo);
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me', 'Wife']);
  await adminUpsert('mf_nav_latest', [
    { scheme_code: 'e2e-ov-1', nav: 50, nav_date: daysAgo(1), prev_nav: 49 },
  ]);
  await adminInsert('mf_holdings', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      scheme_name: 'E2E Overview Fund',
      scheme_code: 'e2e-ov-1',
      units: 100,
      invested: 4000,
    },
    {
      owner_id: ownerId,
      portfolio_id: ids['Wife'],
      scheme_name: 'E2E Overview Fund',
      scheme_code: 'e2e-ov-1',
      units: 20,
      invested: 1200,
    },
  ]);
  await adminInsert('savings_accounts', [
    { owner_id: ownerId, portfolio_id: ids['Wife'], bank: 'E2E Bank', balance: 4000 },
  ]);
  const [card] = await adminInsert('credit_cards', [
    { owner_id: ownerId, portfolio_id: ids['Me'], name: 'E2E Card', bill_day: 1, due_day: 20 },
  ]);
  await adminInsert('card_bills', [
    {
      owner_id: ownerId,
      card_id: card['id'],
      statement_month: daysAgo(0).slice(0, 8) + '01',
      due_date: daysAgo(-10),
      amount: 2500,
    },
  ]);
  await adminInsert('pf_entries', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      company: 'E2E Tech',
      wage_month: daysAgo(0).slice(0, 8) + '01',
      contribution_type: 'monthly',
      employee_amount: 1800,
      employer_amount: 550,
      pension_amount: 1250,
    },
  ]);
  // PF history starts on the first day above 0 (days before PF existed hold 0).
  const pfOn = (n: number) => (n === 3 ? 0 : 2400 - n * 50);
  await adminInsert(
    'portfolio_snapshots',
    [3, 2, 1].flatMap((n) => [
      {
        owner_id: ownerId,
        portfolio_id: ids['Me'],
        snap_date: daysAgo(n),
        mf_value: 4800 + n,
        pf_balance: pfOn(n),
      },
      {
        owner_id: ownerId,
        portfolio_id: ids['Wife'],
        snap_date: daysAgo(n),
        mf_value: 950,
        pf_balance: 0,
      },
    ]),
  );

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/overview');

  // All portfolios: 100 x 50 + 20 x 50 = 6,000; today +100 +20
  const combined = statCard(page, 'Combined (MF + stocks)');
  await expect(combined).toContainText('₹6,000');
  await expect(combined).toContainText('+₹120');
  await expect(combined).toBeInViewport();
  await expect(statCard(page, 'Savings')).toContainText('₹4,000');
  await expect(statCard(page, 'Card dues')).toContainText('₹2,500');
  await expect(statCard(page, 'Card dues').locator('.stat-value')).toHaveClass(/app-down/);
  await expect(statCard(page, 'PF')).toContainText('₹2,350');

  const allocation = page.getByRole('region', { name: 'Allocation' });
  await expect(allocation.getByRole('img')).toHaveAttribute(
    'aria-label',
    /Mutual funds ₹6,000 \(49%\).*PF ₹2,350 \(19%\)/,
  );
  await expect(allocation).toContainText('Savings');
  const history = page.getByRole('region', { name: 'Combined value over time' });
  await expect(history.getByRole('img', { name: /Combined value from/ })).toBeVisible();
  // Switch the chart to the PF balance and back
  const show = page.getByRole('group', { name: 'Show' });
  await show.getByRole('button', { name: 'PF', exact: true }).click();
  const pfHistory = page.getByRole('region', { name: 'PF balance over time' });
  await expect(pfHistory.getByRole('img', { name: /PF balance from/ })).toBeVisible();
  await show.getByRole('button', { name: 'MF + stocks' }).click();
  await expect(history).toBeVisible();

  const summary = mobile
    ? page.getByRole('region', { name: 'By portfolio' })
    : page.getByRole('table', { name: 'Summary by portfolio' });
  await expect(summary).toContainText('Wife');
  await expect(summary).toContainText('Family total');
  await expectNoHorizontalScroll(page);
  await screenshot(page, 'overview', testInfo.project.name);

  // One portfolio: totals follow the switcher
  if (mobile) {
    await page
      .getByRole('group', { name: 'Portfolio' })
      .getByRole('button', { name: 'Wife' })
      .click();
  } else {
    await page.getByRole('combobox', { name: 'Portfolio' }).click();
    await page.getByRole('option', { name: 'Wife' }).click();
  }
  await expect(combined).toContainText('₹1,000');
  await expect(statCard(page, 'Card dues')).toContainText('₹0');
  await expect(statCard(page, 'PF')).toContainText('₹0');
  await expect(summary).not.toContainText('Family total');
});
