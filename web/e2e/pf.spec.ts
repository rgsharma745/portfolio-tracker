import { type Page, expect, test } from '@playwright/test';
import {
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A wage month relative to this one, e.g. "Oct 2026" for -1 in November 2026. */
const wageLabel = (offset: number) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
/** 20 August two years ago: always in an earlier financial year than any date this year. */
const oldAugust = () => `${new Date().getFullYear() - 2}-08-20`;
const fyOf = (date: string) => {
  const [year, month] = date.split('-').map(Number);
  const start = month >= 4 ? year : year - 1;
  return `FY ${start}–${String((start + 1) % 100).padStart(2, '0')}`;
};

const company = (page: Page) => page.getByTestId('pf-company-E2E Tech');
/** A monthly row's edit button: the pencil on desktop, the whole card on mobile. */
const editButton = (page: Page, mobile: boolean, wage: string) =>
  mobile
    ? page.getByRole('button', { name: new RegExp(`^${wage} · E2E Tech`) })
    : page.getByRole('button', { name: new RegExp(`^Edit E2E Tech ${wage}`) });

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
  // A new company starts at last month's wages
  await expect(company(page)).toContainText(`Last wage month ${wageLabel(-1)}`);

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
  await expect(company(page)).toContainText(`Last wage month ${wageLabel(0)}`);
  await expect(company(page)).toContainText('Pension ₹2,500');

  // Interest: no wage month or pension; it counts for the financial year of its date
  await page.getByRole('button', { name: 'Add interest' }).click();
  const interest = page.getByRole('dialog', { name: 'Add interest' });
  await expect(interest.getByLabel('Pension, EPS (₹)')).toHaveCount(0);
  await expect(interest.getByLabel('Wage month')).toHaveCount(0);
  await pickDate(page, interest.getByLabel('Transaction date'), oldAugust());
  await expect(interest.getByText(`Counts for ${fyOf(oldAugust())}`)).toBeVisible();
  await interest.getByLabel('Employee interest (₹)').fill('1000');
  await interest.getByLabel('Employer interest (₹)').fill('500');
  await interest.getByRole('button', { name: 'Save' }).click();
  await expect(interest).toBeHidden();
  await expect(company(page)).toContainText('₹6,200');
  await expect(statCard(page, 'Pension (EPS)')).toContainText('Not in the PF balance');
  await expect(page.getByText(`Interest ${fyOf(oldAugust())}`).first()).toBeVisible();

  // A second interest credit in the same financial year is refused with a clear message
  await page.getByRole('button', { name: 'Add interest' }).click();
  const again = page.getByRole('dialog', { name: 'Add interest' });
  await pickDate(
    page,
    again.getByLabel('Transaction date'),
    `${new Date().getFullYear() - 2}-09-01`,
  );
  await again.getByLabel('Employee interest (₹)').fill('1');
  await again.getByLabel('Employer interest (₹)').fill('1');
  await again.getByRole('button', { name: 'Save' }).click();
  await expect(
    again.getByText('Interest for this company and financial year is already entered.'),
  ).toBeVisible();
  await again.getByRole('button', { name: 'Cancel' }).click();
  await expect(again).toBeHidden();

  // Filter by financial year (of the transaction date): only the interest row is that far back
  await page.getByRole('combobox', { name: 'Financial year' }).click();
  await page.getByRole('option', { name: fyOf(oldAugust()) }).click();
  if (!mobile) await expect(page.locator('tfoot')).toContainText('1 entry');
  await expect(editButton(page, mobile, wageLabel(-1))).toHaveCount(0);
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
  await editButton(page, mobile, wageLabel(0)).click();
  const edit = page.getByRole('dialog', { name: 'Edit PF entry' });
  await edit.getByLabel('Employee (₹)').fill('2000');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(company(page)).toContainText('₹6,400');

  await editButton(page, mobile, wageLabel(0)).click();
  await edit.getByRole('button', { name: 'Delete' }).click();
  await edit
    .getByRole('group', { name: 'Confirm delete' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(edit).toBeHidden();
  await expect(company(page)).toContainText('₹3,850');
  await expect(company(page)).toContainText(`Last wage month ${wageLabel(-1)}`);
});
