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
  statCard,
  isMobile,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

test('mutual funds: totals, badges, add, edit and delete', async ({ page }, testInfo) => {
  const mobile = isMobile(testInfo);
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me', 'Wife']);
  await adminUpsert('mf_nav_latest', [
    { scheme_code: 'e2e-mf-1', nav: 50, nav_date: daysAgo(1), prev_nav: 49 },
    { scheme_code: 'e2e-mf-2', nav: 20, nav_date: daysAgo(10), prev_nav: 21 },
  ]);
  await adminInsert('mf_holdings', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      scheme_name: 'E2E Growth Fund',
      scheme_code: 'e2e-mf-1',
      folio: 'e2e-folio-1',
      units: 100,
      invested: 4000,
    },
    {
      owner_id: ownerId,
      portfolio_id: ids['Wife'],
      scheme_name: 'E2E Stale Fund',
      scheme_code: 'e2e-mf-2',
      units: 50,
      invested: 1200,
    },
  ]);
  await adminInsert('mf_transactions', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      source_key: 'a'.repeat(64),
      scheme_code: 'e2e-mf-1',
      scheme_name: 'E2E Growth Fund',
      folio: 'e2e-folio-1',
      transaction_date: daysAgo(365),
      transaction_type: 'PURCHASE',
      description: 'Purchase',
      amount: 4000,
      units: 100,
      nav: 40,
      balance: 100,
    },
  ]);

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/mutual-funds');

  // Totals over both portfolios: 5,000 + 1,000 = 6,000 value; 5,200 invested.
  const stat = (label: string) => statCard(page, label);
  await expect(stat('Current value')).toContainText('₹6,000');
  await expect(stat('Invested')).toContainText('₹5,200');
  await expect(stat('Total P&L')).toContainText('+₹800');
  await expect(stat('1 Day Change')).toContainText('+₹50');
  await expect(stat('XIRR')).not.toContainText('—');

  const list = mobile
    ? page.getByRole('list', { name: 'Mutual fund holdings' })
    : page.getByRole('table', { name: 'Mutual fund holdings' });
  await expect(list).toContainText('E2E Growth Fund');
  await expect(list).toContainText('Stale');
  await expect(list).toContainText('Wife');
  await expect(page.getByRole('heading', { name: 'XIRR by folio' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recent mutual fund transactions' })).toContainText(
    'E2E Growth Fund',
  );
  await expectNoHorizontalScroll(page);
  await screenshot(page, 'mutual-funds', testInfo.project.name);

  // Search and the losers filter
  await page.getByLabel('Search funds').fill('stale');
  await expect(list).not.toContainText('E2E Growth Fund');
  await page.getByLabel('Search funds').fill('');
  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Losers' }).click();
  await expect(list).not.toContainText('E2E Growth Fund');
  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'All' }).click();

  // Add: validation first, then a valid fund
  await page.getByRole('button', { name: 'Add fund' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add fund' });
  await dialog.getByLabel('Fund name').fill('E2E New Fund');
  await dialog.getByLabel('Units').fill('-5');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Must be zero or more.')).toBeVisible();
  await expect(dialog.getByText('Enter the amount invested.')).toBeVisible();
  if (mobile) await screenshot(page, 'mutual-funds-dialog', testInfo.project.name);
  await dialog.getByLabel('Units').fill('10');
  await dialog.getByLabel('Invested (₹)').fill('1,000');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(list).toContainText('E2E New Fund');
  await expect(list).toContainText('No NAV');
  await expect(page.getByText(/1 fund has no NAV yet/)).toBeVisible();

  // Edit, then delete with confirmation
  if (mobile) {
    await list.getByRole('button', { name: /E2E New Fund/ }).click();
  } else {
    await page.getByRole('button', { name: 'Edit E2E New Fund' }).click();
  }
  const edit = page.getByRole('dialog', { name: 'Edit fund' });
  await expect(edit.getByLabel('Units')).toHaveValue('10');
  await edit.getByRole('button', { name: 'Delete' }).click();
  await edit
    .getByRole('group', { name: 'Confirm delete' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(edit).toBeHidden();
  await expect(list).not.toContainText('E2E New Fund');
});
