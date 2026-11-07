import { type Page, expect, test } from '@playwright/test';
import {
  HOLDINGS_EMAIL,
  ensureUser,
  expectNoHorizontalScroll,
  isMobile,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
  statCard,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (offset: number) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
/** The financial year that ended most recently, e.g. "FY 2025–26" in November 2026. */
const lastFy = () => {
  const now = new Date();
  const start = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - 1;
  return `FY ${start}–${String((start + 1) % 100).padStart(2, '0')}`;
};

const company = (page: Page) => page.getByTestId('pf-company-E2E Tech');
/** The row's edit button: the pencil on desktop, the whole card on mobile. */
const editButton = (page: Page, mobile: boolean, month: string) =>
  mobile
    ? page.getByRole('button', { name: new RegExp(`^${month} · E2E Tech`) })
    : page.getByRole('button', { name: `Edit E2E Tech ${month}` });

test('PF: first month, next month prefilled, interest, filters, edit and delete', async ({
  page,
}, testInfo) => {
  const mobile = isMobile(testInfo);
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  await seedPortfolios(ownerId, ['Me', 'Wife']); // cascades: no PF rows

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/pf');
  await expect(page.getByRole('heading', { level: 1, name: 'Provident fund' })).toBeVisible();

  // First month, from the empty state
  await page.getByRole('button', { name: 'Add first month' }).click();
  const first = page.getByRole('dialog', { name: 'Add PF month' });
  await first.getByRole('button', { name: 'Save' }).click();
  await expect(first.getByText('Enter the company name.')).toBeVisible();
  await expect(first.getByText('Enter the employee amount.')).toBeVisible();
  await first.getByLabel('Company').fill('E2E Tech');
  await first.getByLabel('Employee (₹)').fill('1,800');
  await first.getByLabel('Employer (₹)').fill('550');
  await first.getByLabel('Pension, EPS (₹)').fill('1250');
  await first.getByRole('button', { name: 'Save' }).click();
  await expect(first).toBeHidden();
  await expect(company(page)).toContainText('₹2,350');
  await expect(company(page)).toContainText(`Last month ${monthLabel(0)}`);

  // Add next month: the following month with the same amounts, ready to save
  await page.getByRole('button', { name: 'Add next month for E2E Tech' }).click();
  const next = page.getByRole('dialog', { name: 'Add PF month' });
  await expect(next.getByLabel('Company')).toHaveValue('E2E Tech');
  await expect(next.getByLabel('Employee (₹)')).toHaveValue('1800');
  await expect(next.getByLabel('Pension, EPS (₹)')).toHaveValue('1250');
  // Switching to Interest does not carry the month's amounts over (the title follows the type)
  const typeGroup = (d: typeof next) => d.getByRole('group', { name: 'Type' });
  await typeGroup(next).getByRole('button', { name: 'Interest' }).click();
  const switched = page.getByRole('dialog', { name: 'Add interest' });
  await expect(switched.getByLabel('Employee interest (₹)')).toHaveValue('');
  await expect(switched.getByLabel('Employer interest (₹)')).toHaveValue('');
  await typeGroup(switched).getByRole('button', { name: 'Monthly' }).click();
  await expect(next.getByLabel('Employee (₹)')).toHaveValue('1800');
  await next.getByRole('button', { name: 'Save' }).click();
  await expect(next).toBeHidden();
  await expect(company(page)).toContainText('₹4,700');
  await expect(company(page)).toContainText(`Last month ${monthLabel(1)}`);
  await expect(company(page)).toContainText('Pension ₹2,500');

  // Interest for the last financial year; pension is not asked for
  await page.getByRole('button', { name: 'Add interest' }).click();
  const interest = page.getByRole('dialog', { name: 'Add interest' });
  await expect(interest.getByLabel('Pension, EPS (₹)')).toHaveCount(0);
  await expect(interest.getByText(/Recorded as Mar \d{4}/)).toBeVisible();
  await interest.getByLabel('Employee interest (₹)').fill('1000');
  await interest.getByLabel('Employer interest (₹)').fill('500');
  await interest.getByRole('button', { name: 'Save' }).click();
  await expect(interest).toBeHidden();
  await expect(company(page)).toContainText('₹6,200');
  await expect(statCard(page, 'Pension (EPS)')).toContainText('Not in the PF balance');
  await expect(page.getByText(`Interest ${lastFy()}`).first()).toBeVisible();

  // The same interest twice is refused with a clear message
  await page.getByRole('button', { name: 'Add interest' }).click();
  const again = page.getByRole('dialog', { name: 'Add interest' });
  await again.getByLabel('Employee interest (₹)').fill('1');
  await again.getByLabel('Employer interest (₹)').fill('1');
  await again.getByRole('button', { name: 'Save' }).click();
  await expect(
    again.getByText('Interest for this company and year is already entered.'),
  ).toBeVisible();
  await again.getByRole('button', { name: 'Cancel' }).click();
  await expect(again).toBeHidden();

  // Filter by financial year: only the interest row is in last year
  await page.getByRole('combobox', { name: 'Financial year' }).click();
  await page.getByRole('option', { name: lastFy() }).click();
  if (!mobile) await expect(page.locator('tfoot')).toContainText('1 entry');
  await expect(editButton(page, mobile, monthLabel(0))).toHaveCount(0);
  // Reopening after a choice must not scroll the page (the selected option is brought into
  // view inside the list only)
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
  const before = await scrollY();
  await page.getByRole('combobox', { name: 'Financial year' }).click();
  await expect(page.getByRole('option', { name: 'All years' })).toBeVisible();
  await page.waitForTimeout(300);
  expect(await scrollY()).toBe(before);
  await page.getByRole('option', { name: 'All years' }).click();
  if (!mobile) await expect(page.locator('tfoot')).toContainText('3 entries');
  await expectNoHorizontalScroll(page);
  await screenshot(page, 'pf', testInfo.project.name);

  // Edit a month, then delete it
  await editButton(page, mobile, monthLabel(1)).click();
  const edit = page.getByRole('dialog', { name: 'Edit PF entry' });
  await edit.getByLabel('Employee (₹)').fill('2000');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(company(page)).toContainText('₹6,400');

  await editButton(page, mobile, monthLabel(1)).click();
  await edit.getByRole('button', { name: 'Delete' }).click();
  await edit
    .getByRole('group', { name: 'Confirm delete' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(edit).toBeHidden();
  await expect(company(page)).toContainText('₹3,850');
  await expect(company(page)).toContainText(`Last month ${monthLabel(0)}`);
});
