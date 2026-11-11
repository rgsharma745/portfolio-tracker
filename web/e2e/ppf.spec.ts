import type { Page } from '@playwright/test';
import {
  expect,
  test,
  HOLDINGS_EMAIL,
  ensureUser,
  expectNoHorizontalScroll,
  isMobile,
  pickDate,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
  statCard,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

const now = new Date();
/** Start year of the current financial year (April to March). */
const currentFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
/** Last financial year: every date the test enters falls in it. */
const lastFy = currentFy - 1;
const fyLabel = (start: number) => `FY ${start}–${String((start + 1) % 100).padStart(2, '0')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "1 Sep 2025" as a pattern: en-IN prints "Sept" in Chrome and "Sep" in WebKit. */
const datePattern = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${m === 9 ? 't?' : ''} ${y}`;
};

const JUNE = `${lastFy}-06-15`;
const SEPTEMBER = `${lastFy}-09-01`;
const MARCH = `${lastFy + 1}-03-31`;

const account = (page: Page) => page.getByTestId('ppf-account-E2E PPF');
/** Last year's row in the per-year table (a card on mobile). */
const lastYear = (page: Page, mobile: boolean) =>
  mobile
    ? page.getByTestId(`ppf-year-${lastFy}`)
    : page.locator('tr', { hasText: fyLabel(lastFy) }).first();
/** An entry's edit button: the pencil on desktop, the whole card on mobile. */
const editButton = (page: Page, mobile: boolean, type: string, iso: string) =>
  mobile
    ? page.getByRole('button', { name: new RegExp(`^E2E PPF .*${datePattern(iso)}`) })
    : page.getByRole('button', { name: new RegExp(`^Edit E2E PPF ${type} ${datePattern(iso)}$`) });

test('PPF: investments and interest per financial year, limit flag, edit and delete', async ({
  page,
}, testInfo) => {
  const mobile = isMobile(testInfo);
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  await seedPortfolios(ownerId, ['Me', 'Wife']); // cascades: no PPF rows

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/ppf');
  await expect(page.getByRole('heading', { level: 1, name: 'PPF' })).toBeVisible();

  // First investment, from the empty state
  await page.getByRole('button', { name: 'Add first investment' }).click();
  const first = page.getByRole('dialog', { name: 'Add PPF investment' });
  await first.getByRole('button', { name: 'Save' }).click();
  await expect(first.getByText('Enter the account name, e.g. SBI PPF.')).toBeVisible();
  await expect(first.getByText('Enter the amount.')).toBeVisible();
  await first.getByRole('combobox', { name: 'Account' }).fill('E2E PPF');
  await pickDate(page, first.getByLabel('Date', { exact: true }), JUNE);
  await expect(first.getByText(`Counts for ${fyLabel(lastFy)}.`)).toBeVisible();
  await first.getByLabel('Amount (₹)').fill('1,00,000');
  await first.getByRole('button', { name: 'Save' }).click();
  await expect(first).toBeHidden();
  await expect(account(page)).toContainText('₹1,00,000');

  // A second deposit in the same year takes it over ₹1.5 lakh: flagged, not refused
  await page.getByRole('button', { name: 'Add investment to E2E PPF' }).click();
  const second = page.getByRole('dialog', { name: 'Add PPF investment' });
  await expect(second.getByRole('combobox', { name: 'Account' })).toHaveValue('E2E PPF');
  await pickDate(page, second.getByLabel('Date', { exact: true }), SEPTEMBER);
  await second.getByLabel('Amount (₹)').fill('60000');
  await second.getByRole('button', { name: 'Save' }).click();
  await expect(second).toBeHidden();

  // Interest at the end of the year
  await page.getByRole('button', { name: 'Add interest' }).click();
  const interest = page.getByRole('dialog', { name: 'Add PPF interest' });
  await pickDate(page, interest.getByLabel('Date', { exact: true }), MARCH);
  await interest.getByLabel('Amount (₹)').fill('7100');
  await interest.getByRole('button', { name: 'Save' }).click();
  await expect(interest).toBeHidden();

  // Stat cards are compact on phones (₹1.67L)
  await expect(statCard(page, 'PPF balance')).toContainText(mobile ? '₹1.67L' : '₹1,67,100');
  await expect(statCard(page, `Invested in ${fyLabel(currentFy)}`)).toContainText(
    '₹1,50,000 left of ₹1,50,000',
  );
  const year = lastYear(page, mobile);
  await expect(year).toContainText('₹1,60,000');
  await expect(year).toContainText('₹7,100');
  await expect(year).toContainText('₹1,67,100');
  await expect(year).toContainText('Over ₹1.5 lakh');

  // One interest credit per account and financial year
  await page.getByRole('button', { name: 'Add interest' }).click();
  const again = page.getByRole('dialog', { name: 'Add PPF interest' });
  await pickDate(page, again.getByLabel('Date', { exact: true }), `${lastFy + 1}-01-10`);
  await again.getByLabel('Amount (₹)').fill('1');
  await again.getByRole('button', { name: 'Save' }).click();
  await expect(
    again.getByText('Interest for this account and financial year is already entered.'),
  ).toBeVisible();
  await again.getByRole('button', { name: 'Cancel' }).click();
  await expect(again).toBeHidden();

  await expectNoHorizontalScroll(page);
  await screenshot(page, 'ppf', testInfo.project.name);

  // Edit the second deposit below the limit: the flag goes away
  await editButton(page, mobile, 'investment', SEPTEMBER).click();
  const edit = page.getByRole('dialog', { name: 'Edit PPF entry' });
  await expect(edit.getByLabel('Amount (₹)')).toHaveValue('60000');
  await edit.getByLabel('Amount (₹)').fill('40000');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(year).toContainText('₹1,40,000');
  await expect(year).not.toContainText('Over ₹1.5 lakh');

  // Delete the interest
  await editButton(page, mobile, 'interest', MARCH).click();
  await edit.getByRole('button', { name: 'Delete' }).click();
  await edit
    .getByRole('group', { name: 'Confirm delete' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(edit).toBeHidden();
  await expect(statCard(page, 'PPF balance')).toContainText(mobile ? '₹1.4L' : '₹1,40,000');
});
