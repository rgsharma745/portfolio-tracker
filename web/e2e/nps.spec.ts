import type { Page } from '@playwright/test';
import {
  expect,
  test,
  HOLDINGS_EMAIL,
  adminUpsert,
  ensureUser,
  expectNoHorizontalScroll,
  isMobile,
  pickDate,
  screenshot,
  seedPortfolios,
  signInWithMagicLink,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

const now = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(now.getTime() - n * 86_400_000));
/** Start year of the current financial year (April to March). */
const currentFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
const lastFy = currentFy - 1;
const fyLabel = (start: number) => `FY ${start}–${String((start + 1) % 100).padStart(2, '0')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "15 Jun 2025" as a pattern: en-IN prints "Sept" in Chrome and "Sep" in WebKit. */
const datePattern = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${m === 9 ? 't?' : ''} ${y}`;
};

/** A made-up scheme code with a NAV of ₹50 (₹49 the day before). */
const CODE = 'SM990001';
const JUNE = `${lastFy}-06-15`;

const account = (page: Page) => page.getByTestId('nps-account-E2E PRAN');
const lastYear = (page: Page, mobile: boolean) =>
  mobile
    ? page.getByTestId(`nps-year-${lastFy}`)
    : page.locator('tr', { hasText: fyLabel(lastFy) }).first();
/** A contribution's edit button: the pencil on desktop, the whole card on mobile. */
const editContribution = (page: Page, mobile: boolean, by: string, date: string) =>
  mobile
    ? page.getByRole('button', { name: new RegExp(`^E2E PRAN .*${datePattern(date)}.*${by}`) })
    : page.getByRole('button', {
        name: new RegExp(`^Edit E2E PRAN ${by} ${datePattern(date)}$`),
      });

test('NPS: schemes, contributions per financial year, XIRR, units update', async ({
  page,
}, testInfo) => {
  const mobile = isMobile(testInfo);
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  await seedPortfolios(ownerId, ['Me', 'Wife']); // cascades: no NPS rows
  await adminUpsert('nps_nav_latest', [
    {
      scheme_code: CODE,
      nav: 50,
      nav_date: daysAgo(1),
      prev_nav: 49,
      prev_nav_date: daysAgo(2),
      is_manual: false,
    },
  ]);

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/nps');
  await expect(page.getByRole('heading', { level: 1, name: 'NPS' })).toBeVisible();

  // First scheme, from the empty state
  await page.getByRole('button', { name: 'Add first scheme' }).click();
  const scheme = page.getByRole('dialog', { name: 'Add scheme' });
  await scheme.getByLabel('Scheme code').fill('HDFC');
  await scheme.getByRole('button', { name: 'Save' }).click();
  await expect(scheme.getByText('Enter the account name, e.g. Rahul PRAN.')).toBeVisible();
  await expect(scheme.getByText('Scheme codes look like SM008001.')).toBeVisible();
  await scheme.getByLabel('Account').fill('E2E PRAN');
  await scheme.getByLabel('Scheme name').fill('E2E Scheme E Tier I');
  await scheme.getByLabel('Scheme code').fill(CODE.toLowerCase());
  await scheme.getByLabel('Units', { exact: true }).fill('1,000');
  await scheme.getByRole('button', { name: 'Save' }).click();
  await expect(scheme).toBeHidden();
  await expect(account(page)).toContainText('₹50,000');

  // A self and an employer contribution last year
  await page.getByRole('button', { name: 'Add contribution to E2E PRAN' }).click();
  const self = page.getByRole('dialog', { name: 'Add contribution' });
  await expect(self.getByLabel('Account')).toHaveValue('E2E PRAN');
  await pickDate(page, self.getByLabel('Date', { exact: true }), JUNE);
  await expect(self.getByText(`Counts for ${fyLabel(lastFy)}.`)).toBeVisible();
  await self.getByLabel('Amount (₹)').fill('20,000');
  await self.getByRole('button', { name: 'Save' }).click();
  await expect(self).toBeHidden();

  await page.getByRole('button', { name: 'Add contribution to E2E PRAN' }).click();
  await page
    .getByRole('dialog', { name: 'Add contribution' })
    .getByRole('group', { name: 'By' })
    .getByRole('button', { name: 'Employer' })
    .click();
  const employer = page.getByRole('dialog', { name: 'Add employer contribution' });
  await pickDate(page, employer.getByLabel('Date', { exact: true }), JUNE);
  await employer.getByLabel('Amount (₹)').fill('15000');
  await employer.getByRole('button', { name: 'Save' }).click();
  await expect(employer).toBeHidden();

  // Invested ₹35,000, value ₹50,000: a gain and a positive XIRR
  await expect(account(page)).toContainText('₹35,000');
  await expect(account(page)).toContainText('+₹15,000');
  await expect(page.getByTestId('nps-xirr-E2E PRAN')).toHaveText(/^\+[\d.]+%$/);
  const year = lastYear(page, mobile);
  await expect(year).toContainText('₹20,000');
  await expect(year).toContainText('₹15,000');
  await expect(year).toContainText('₹35,000');

  await expectNoHorizontalScroll(page);
  await screenshot(page, 'nps', testInfo.project.name);

  // Update units from a new statement
  await page.getByRole('button', { name: 'Update units of E2E PRAN' }).click();
  const units = page.getByRole('dialog', { name: 'Update units · E2E PRAN' });
  const line = units.getByLabel('Scheme E · E2E Scheme E Tier I');
  await expect(line).toHaveValue('1000');
  await line.fill('-1');
  await units.getByRole('button', { name: 'Save' }).click();
  await expect(units.getByText('Must be zero or more.')).toBeVisible();
  await line.fill('1200');
  await units.getByRole('button', { name: 'Save' }).click();
  await expect(units).toBeHidden();
  await expect(account(page)).toContainText('₹60,000');

  // Edit the employer contribution, then delete it
  await editContribution(page, mobile, 'Employer', JUNE).click();
  const edit = page.getByRole('dialog', { name: 'Edit contribution' });
  await expect(edit.getByLabel('Amount (₹)')).toHaveValue('15000');
  await edit.getByLabel('Amount (₹)').fill('10000');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(year).toContainText('₹30,000');

  await editContribution(page, mobile, 'Employer', JUNE).click();
  await edit.getByRole('button', { name: 'Delete' }).click();
  await edit
    .getByRole('group', { name: 'Confirm delete' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(edit).toBeHidden();
  await expect(account(page)).toContainText('₹20,000');
});
