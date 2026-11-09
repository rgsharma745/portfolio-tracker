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

test('stocks: India and US tabs, INR toggle, add and edit', async ({ page }, testInfo) => {
  const mobile = isMobile(testInfo);
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me']);
  await adminUpsert('stock_price_latest', [
    { symbol: 'E2EIN', close: 150, price_date: daysAgo(0), prev_close: 140 },
    { symbol: 'E2EUS', close: 60, price_date: daysAgo(1), prev_close: 62 },
  ]);
  await adminUpsert('fx_latest', [{ pair: 'USDINR', rate: 85, rate_date: daysAgo(0) }]);
  await adminInsert('stock_holdings', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      market: 'IN',
      symbol: 'E2EIN',
      currency: 'INR',
      quantity: 10,
      invested: 1000,
    },
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      market: 'US',
      symbol: 'E2EUS',
      name: 'E2E Corp',
      currency: 'USD',
      quantity: 10,
      invested: 700,
    },
  ]);

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/stocks');
  const stat = (label: string) => statCard(page, label);

  // India tab: 10 x 150
  await expect(stat('Current value')).toContainText('₹1,500');
  await expect(stat('1 Day Change')).toContainText('+₹100');
  await expectNoHorizontalScroll(page);

  // US tab in USD, then INR (rates may differ if another test changed USDINR, so the INR check
  // only looks for the rupee sign).
  const usTab = page.getByRole('group', { name: 'Market' }).getByRole('button', { name: /US/ });
  await usTab.click();
  await expect(usTab).toHaveAttribute('aria-pressed', 'true');
  await expect(stat('Current value')).toContainText('$600.00');
  await expect(stat('Total P&L')).toContainText('-$100.00');
  const list = mobile
    ? page.getByRole('list', { name: 'US stocks' })
    : page.getByRole('table', { name: 'US stocks' });
  if (mobile) {
    // Broker-style card: Qty and P&L %; symbol and value; invested and LTP with today's %
    // (10 x $60, $700 invested, previous close $62)
    const card = list.getByRole('button', { name: /E2EUS/ });
    await expect(card).toContainText(/Qty\.\s10/);
    await expect(card).toContainText('-14.29%');
    await expect(card).toContainText('$600.00');
    await expect(card).toContainText('Invested $700.00');
    await expect(card).toContainText(/LTP \$60\.00\s?\(-3\.23%\)/);
  } else {
    await expect(list).toContainText('E2E Corp');
    await expect(list).toContainText('≈ ₹');
    await expect(list).toContainText(/Qty:\s10/);
    await expect(list).toContainText(/price\s\$60\.00/);
  }
  await screenshot(page, 'stocks-us', testInfo.project.name);
  await page.getByRole('switch', { name: 'Show in INR' }).click();
  await expect(stat('Current value')).toContainText('₹');
  await expect(stat('Current value')).not.toContainText('$');
  await expectNoHorizontalScroll(page);

  // Add a US stock from its average price
  await page.getByRole('button', { name: 'Add stock' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add stock' });
  await dialog.getByLabel('Symbol').fill('e2enew');
  await dialog.getByLabel('Quantity').fill('4');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Enter the amount invested or the average price.')).toBeVisible();
  await dialog.getByLabel('Average price ($)').fill('25');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(list).toContainText('E2ENEW');
  await expect(list).toContainText('No price');

  // Edit shows the derived amount invested: 4 x 25
  if (mobile) await list.getByRole('button', { name: /E2ENEW/ }).click();
  else await page.getByRole('button', { name: 'Edit E2ENEW' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Edit stock' }).getByLabel('Invested ($)'),
  ).toHaveValue('100');
});
