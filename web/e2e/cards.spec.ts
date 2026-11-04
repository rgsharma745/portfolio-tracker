import { expect, test } from '@playwright/test';
import {
  HOLDINGS_EMAIL,
  adminInsert,
  ensureUser,
  expectNoHorizontalScroll,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
  statCard,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

/** Local calendar dates, as the app uses them. */
const local = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const daysFromNow = (n: number) =>
  local(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
const monthStart = (offset: number) =>
  local(new Date(now.getFullYear(), now.getMonth() + offset, 1));

test('cards: summary, earlier bills, create, enter amount, mark paid', async ({
  page,
}, testInfo) => {
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me']);
  const cards = await adminInsert('credit_cards', [
    { owner_id: ownerId, portfolio_id: ids['Me'], name: 'E2E Rewards', bill_day: 14, due_day: 3 },
    { owner_id: ownerId, portfolio_id: ids['Me'], name: 'E2E Travel', bill_day: 1, due_day: 20 },
    { owner_id: ownerId, portfolio_id: ids['Me'], name: 'E2E Dayless' },
  ]);
  const card = Object.fromEntries(cards.map((c) => [c['name'], c['id']]));
  await adminInsert('card_bills', [
    {
      owner_id: ownerId,
      card_id: card['E2E Rewards'],
      statement_month: monthStart(-1),
      due_date: daysFromNow(-2),
      amount: 5000,
    },
    {
      owner_id: ownerId,
      card_id: card['E2E Travel'],
      statement_month: monthStart(0),
      due_date: daysFromNow(10),
      amount: 3000,
    },
  ]);

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/cards');

  await expect(statCard(page, 'Total pending')).toContainText('₹8,000');
  const nextDue = statCard(page, 'Next due');
  await expect(nextDue).toContainText('E2E Rewards');
  await expect(nextDue).toContainText('2 days overdue');
  await expect(nextDue.locator('.stat-value')).toHaveClass(/app-down/);

  const earlier = page.getByRole('region', { name: 'Earlier unpaid bills' });
  await expect(earlier).toContainText('E2E Rewards');
  await expect(earlier).toContainText('Overdue');
  await expectNoHorizontalScroll(page);

  // Create this month's bills: Rewards gets one, Travel already has one, Dayless is skipped
  await page.getByRole('button', { name: "Create this month's bills" }).click();
  await expect(page.getByText(/Created 1 bill .* Skipped E2E Dayless/)).toBeVisible();
  await expect(page.getByRole('button', { name: "Create this month's bills" })).toBeHidden();
  const month = page.getByRole('region', { name: /^Bills for / });
  await expect(month).toContainText('Awaiting statement');
  await screenshot(page, 'cards', testInfo.project.name);

  // Enter this month's amount for Rewards (the card list is sorted, so pick by name)
  const editRewards = month.getByRole('button', { name: /E2E Rewards bill/ });
  await editRewards.click();
  const dialog = page.getByRole('dialog', { name: /E2E Rewards ·/ });
  await dialog.getByLabel('Statement amount (₹)').fill('2,500');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(statCard(page, 'Total pending')).toContainText('₹10,500');
  await expect(statCard(page, 'Awaiting statement')).toContainText('0');

  // Mark the overdue bill paid: next due moves on
  await earlier.getByRole('button', { name: 'Mark E2E Rewards paid' }).click();
  await expect(earlier).toBeHidden();
  await expect(statCard(page, 'Total pending')).toContainText('₹5,500');
  await expect(nextDue).toContainText('E2E Travel');

  // Last month shows the paid bill
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByRole('region', { name: /^Bills for / })).toContainText('Paid');
  await page.getByRole('button', { name: 'This month' }).click();

  // Give Dayless its days, then its bill can be created
  await page.getByRole('button', { name: 'Edit card E2E Dayless' }).click();
  const cardDialog = page.getByRole('dialog', { name: 'Edit card' });
  await cardDialog.getByLabel('Statement day').fill('5');
  await cardDialog.getByLabel('Due day').fill('25');
  await cardDialog.getByRole('button', { name: 'Save' }).click();
  await expect(cardDialog).toBeHidden();
  await page.getByRole('button', { name: "Create this month's bills" }).click();
  await expect(page.getByText(/Created 1 bill/)).toBeVisible();
});
