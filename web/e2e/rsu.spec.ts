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
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

test('RSU: value and unit cards, add and edit grants', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me']);
  await adminUpsert('stock_price_latest', [
    { symbol: 'E2ERSU', close: 50, price_date: daysAgo(1), prev_close: 49 },
  ]);
  await adminInsert('rsu_grants', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      symbol: 'E2ERSU',
      grant_label: 'E2E 2024',
      grant_date: '2024-03-15',
      units_granted: 100,
      units_vested: 40,
      units_sold_for_tax: 12,
      tax_rate: 0.3,
    },
  ]);

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/rsu');
  const stat = (label: string) => statCard(page, label);
  await expect(stat('Total value (USD)')).toContainText('$5,000.00');
  await expect(stat('After tax (USD)')).toContainText('$3,500.00');
  await expect(stat('Current price')).toContainText('$50.00');
  await expect(stat('Sellable')).toContainText('28');
  await expect(stat('Pending vesting')).toContainText('60');
  await expectNoHorizontalScroll(page);
  await screenshot(page, 'rsu', testInfo.project.name);

  // Add a grant: vested cannot exceed granted
  await page.getByRole('button', { name: 'Add grant' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add grant' });
  await expect(dialog.getByLabel('Symbol')).toHaveValue('E2ERSU');
  await dialog.getByLabel('Grant name').fill('E2E 2025');
  await dialog.getByLabel('Units granted').fill('50');
  await dialog.getByLabel('Units vested').fill('60');
  await dialog.getByLabel('Tax rate (%)').fill('30');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Cannot be more than the units granted.')).toBeVisible();
  await dialog.getByLabel('Units vested').fill('10');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(stat('Total')).toContainText('150');
  await expect(stat('Vested')).toContainText('50');

  // Edit shows the tax rate as a percentage
  const list = mobile
    ? page.getByRole('list', { name: 'RSU grants' })
    : page.getByRole('table', { name: 'RSU grants' });
  if (mobile) await list.getByRole('button', { name: /E2E 2025/ }).click();
  else await page.getByRole('button', { name: 'Edit E2ERSU E2E 2025' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Edit grant' }).getByLabel('Tax rate (%)'),
  ).toHaveValue('30');
});
