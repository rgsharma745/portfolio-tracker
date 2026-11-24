import {
  expect,
  test,
  HOLDINGS_EMAIL,
  adminInsert,
  adminUpsert,
  ensureUser,
  expectNoHorizontalScroll,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
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
      contribution_type: 'monthly',
      wage_month: 'Oct',
      wage_year: 2026,
      transaction_date: daysAgo(0),
      employee_amount: 1800,
      employer_amount: 550,
      pension_amount: 1250,
    },
  ]);
  await adminInsert('ppf_entries', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Wife'],
      account: 'E2E PPF',
      entry_type: 'investment',
      entry_date: daysAgo(0),
      amount: 2000,
    },
  ]);
  // NPS: 40 units at ₹50 (₹49 the day before) in Wife: ₹2,000, +₹40 today.
  await adminUpsert('nps_nav_latest', [
    {
      scheme_code: 'SM990003',
      nav: 50,
      nav_date: daysAgo(1),
      prev_nav: 49,
      prev_nav_date: daysAgo(2),
      is_manual: false,
    },
  ]);
  await adminInsert('nps_holdings', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Wife'],
      account: 'E2E PRAN',
      scheme_class: 'E',
      scheme_code: 'SM990003',
      scheme_name: 'E2E Scheme E',
      units: 40,
    },
  ]);
  // FD paying interest out in Wife: worth its principal, ₹2,000.
  await adminInsert('fixed_deposits', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Wife'],
      bank: 'E2E Bank',
      start_date: daysAgo(30),
      maturity_date: daysAgo(-335),
      principal: 2000,
      rate: 7,
      compounding: 'payout',
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
        ppf_balance: 0,
        nps_value: 0,
        fd_value: 0,
      },
      {
        owner_id: ownerId,
        portfolio_id: ids['Wife'],
        snap_date: daysAgo(n),
        mf_value: 950,
        pf_balance: 0,
        ppf_balance: 2000 - n * 10,
        nps_value: 2000 - n * 5,
        fd_value: 2000,
      },
    ]),
  );

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/overview');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await skipLink.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  // Mutual funds across both portfolios: 120 units × ₹50, with ₹120 day change.
  const balances = page.getByRole('region', { name: 'Balances' });
  const balanceRow = (name: string) =>
    balances.locator('.balance-row').filter({ has: page.getByText(name, { exact: true }) });
  const mutualFunds = balanceRow('Mutual funds');
  await expect(balanceRow('MF + stocks')).toHaveCount(0);
  await expect(mutualFunds).toContainText('₹6,000');
  await expect(mutualFunds).toContainText('+₹120');
  await expect(mutualFunds).toBeInViewport();
  await expect(balanceRow('Savings')).toContainText('₹4,000');
  await expect(balanceRow('Card dues')).toContainText('₹2,500');
  await expect(balanceRow('Card dues').locator('.balance-amount')).toHaveClass(/app-down/);
  await expect(balanceRow('PF')).toContainText('₹2,350');
  await expect(balanceRow('PPF')).toContainText('₹2,000');
  await expect(balanceRow('NPS')).toContainText('₹2,000');
  await expect(balanceRow('NPS')).toContainText('+₹40');
  await expect(balanceRow('Fixed deposits')).toContainText('₹2,000');

  for (const name of ['Stocks', 'Vested RSUs']) {
    await expect(balanceRow(name)).toBeVisible();
  }
  const summaryToggle = page.getByText('By portfolio', { exact: true });
  const allocationToggle = page.getByText('Allocation', { exact: true });
  const historyToggle = page.getByText('History', { exact: true });
  for (const toggle of [historyToggle, allocationToggle, summaryToggle]) {
    await expect(page.locator('details').filter({ has: toggle })).not.toHaveAttribute('open');
  }

  if (mobile) {
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 360, height: viewport.height });
    await expectNoHorizontalScroll(page);
    await page.setViewportSize(viewport);
  }
  await screenshot(page, 'overview', testInfo.project.name);

  const privacy = page.getByRole('button', { name: 'Hide amounts' });
  await privacy.click();
  await expect(mutualFunds).toContainText('••••');
  await expect(balances).not.toContainText('₹');
  await privacy.click();
  await expect(mutualFunds).toContainText('₹6,000');

  await allocationToggle.press('Enter');
  const allocation = page.getByRole('region', { name: 'Allocation' });
  await expect(allocation.getByRole('img')).toHaveAttribute(
    'aria-label',
    /Mutual funds ₹6,000 \(33%\).*PF ₹2,350 \(13%\).*PPF ₹2,000 \(11%\).*NPS ₹2,000 \(11%\), Fixed deposits ₹2,000 \(11%\)/,
  );
  await expect(allocation).toContainText('Savings');
  await historyToggle.press('Enter');
  const history = page.getByRole('region', { name: 'Combined value over time' });
  await expect(history.getByRole('img', { name: /Combined value from/ })).toBeVisible();
  const chartData = history.getByText('View chart data', { exact: true });
  await chartData.press('Enter');
  const dataTable = history.getByRole('table', { name: 'Combined value by date' });
  await expect(dataTable.getByRole('row')).toHaveCount(4);
  await chartData.press('Enter');
  await expect(dataTable).toBeHidden();
  // Switch the chart to the PF balance and back
  const show = page.getByRole('group', { name: 'Show' });
  await show.getByRole('button', { name: 'PF', exact: true }).click();
  const pfHistory = page.getByRole('region', { name: 'PF balance over time' });
  await expect(pfHistory.getByRole('img', { name: /PF balance from/ })).toBeVisible();
  await show.getByRole('button', { name: 'PPF', exact: true }).click();
  const ppfHistory = page.getByRole('region', { name: 'PPF balance over time' });
  await expect(ppfHistory.getByRole('img', { name: /PPF balance from/ })).toBeVisible();
  await show.getByRole('button', { name: 'NPS', exact: true }).click();
  const npsHistory = page.getByRole('region', { name: 'NPS value over time' });
  await expect(npsHistory.getByRole('img', { name: /NPS value from/ })).toBeVisible();
  await show.getByRole('button', { name: 'FD', exact: true }).click();
  const fdHistory = page.getByRole('region', { name: 'FD value over time' });
  await expect(fdHistory.getByRole('img', { name: /FD value from/ })).toBeVisible();
  await show.getByRole('button', { name: 'MF + stocks' }).click();
  await expect(history).toBeVisible();

  await summaryToggle.press('Enter');
  const summary = mobile
    ? page.getByRole('region', { name: 'By portfolio' })
    : page.getByRole('table', { name: 'Summary by portfolio' });
  await expect(summary).toContainText('Wife');
  await expect(summary).toContainText('Family total');
  await expectNoHorizontalScroll(page);

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
  await expect(mutualFunds).toContainText('₹1,000');
  await expect(balanceRow('Card dues')).toContainText('₹0');
  await expect(balanceRow('PF')).toContainText('₹0');
  await expect(balanceRow('PPF')).toContainText('₹2,000');
  await expect(balanceRow('NPS')).toContainText('₹2,000');
  await expect(balanceRow('Fixed deposits')).toContainText('₹2,000');
  await expect(summary).not.toContainText('Family total');
});
