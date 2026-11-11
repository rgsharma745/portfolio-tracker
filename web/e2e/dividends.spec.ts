import type { Page, TestInfo } from '@playwright/test';
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

/** A year's row in the per-year table (a card on mobile). */
const yearRow = (page: Page, mobile: boolean, fy: number) =>
  mobile
    ? page.getByTestId(`dividend-year-${fy}`)
    : page
        .getByRole('table', { name: 'Dividends by financial year' })
        .locator('tr', { hasText: fyLabel(fy) });
/** A stock's row in the per-stock table for the selected year. */
const stockRow = (page: Page, mobile: boolean, market: string, symbol: string) =>
  mobile
    ? page.getByTestId(`dividend-symbol-${market}:${symbol}`)
    : page
        .locator('app-data-table', { has: page.getByRole('table', { name: /by stock/ }) })
        .locator('tr', { hasText: symbol });
/** An entry's edit button: the pencil on desktop, the whole card on mobile. */
const editButton = (page: Page, mobile: boolean, symbol: string, iso: string) =>
  mobile
    ? page.getByRole('button', { name: new RegExp(`^${symbol} .*${datePattern(iso)}`) })
    : page.getByRole('button', {
        name: new RegExp(`^Edit ${symbol} dividend ${datePattern(iso)}$`),
      });

async function choosePortfolio(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (isMobile(testInfo)) {
    const chip = page.getByRole('group', { name: 'Portfolio' }).getByRole('button', { name });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  } else {
    const select = page.getByRole('combobox', { name: 'Portfolio' });
    await select.click();
    await page.getByRole('option', { name }).click();
    await expect(select).toHaveText(name);
  }
}

test('Dividends: India and US per financial year, by stock, edit, delete and portfolio scope', async ({
  page,
}, testInfo) => {
  const mobile = isMobile(testInfo);
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  await seedPortfolios(ownerId, ['Me', 'Wife']); // cascades: no dividends

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/dividends');
  await expect(page.getByRole('heading', { level: 1, name: 'Dividends' })).toBeVisible();

  // First dividend, from the empty state: an Indian stock last year
  await page.getByRole('button', { name: 'Add first dividend' }).click();
  const first = page.getByRole('dialog', { name: 'Add dividend' });
  await first.getByRole('button', { name: 'Save' }).click();
  await expect(first.getByText('Enter the symbol, e.g. ITC.')).toBeVisible();
  await expect(first.getByText('Enter the amount.')).toBeVisible();
  await first.getByLabel('Symbol').fill('e2ediva');
  await pickDate(page, first.getByLabel('Date received', { exact: true }), JUNE);
  await expect(first.getByText(`Counts for ${fyLabel(lastFy)}.`)).toBeVisible();
  await first.getByLabel('Amount (₹)').fill('1,500');
  await first.getByRole('button', { name: 'Save' }).click();
  await expect(first).toBeHidden();

  // A US dividend needs the dollar amount as well as the rupees credited
  await page.getByRole('button', { name: 'Add dividend' }).click();
  const us = page.getByRole('dialog', { name: 'Add dividend' });
  await us.getByRole('button', { name: 'US' }).click();
  await us.getByLabel('Symbol').fill('E2EDIVUS');
  await pickDate(page, us.getByLabel('Date received', { exact: true }), SEPTEMBER);
  await us.getByLabel('Amount (₹)').fill('1700');
  await us.getByRole('button', { name: 'Save' }).click();
  await expect(us.getByText('Enter the amount.')).toBeVisible();
  await us.getByLabel('Amount ($)').fill('20');
  await us.getByRole('button', { name: 'Save' }).click();
  await expect(us).toBeHidden();

  // This year, in the Wife portfolio (dated today)
  await page.getByRole('button', { name: 'Add dividend' }).click();
  const wife = page.getByRole('dialog', { name: 'Add dividend' });
  await wife.getByRole('combobox', { name: 'Me' }).click(); // named by its value
  await page.getByRole('option', { name: 'Wife' }).click();
  await wife.getByLabel('Symbol').fill('E2EDIVA');
  await wife.getByLabel('Amount (₹)').fill('500');
  await wife.getByRole('button', { name: 'Save' }).click();
  await expect(wife).toBeHidden();

  await expect(statCard(page, `Received in ${fyLabel(currentFy)}`)).toContainText('₹500');
  await expect(statCard(page, 'All time')).toContainText('3 dividends');
  const last = yearRow(page, mobile, lastFy);
  await expect(last).toContainText('₹1,500');
  await expect(last).toContainText('₹1,700');
  await expect(last).toContainText('$20.00');
  await expect(last).toContainText('₹3,200');
  await expect(yearRow(page, mobile, currentFy)).toContainText('₹500');

  // The newest year is shown by stock first; picking last year shows its stocks, largest first
  await expect(page.getByRole('heading', { name: `${fyLabel(currentFy)} by stock` })).toBeVisible();
  await expect(stockRow(page, mobile, 'IN', 'E2EDIVA')).toContainText('₹500');
  if (mobile) await last.click();
  else await last.getByRole('button', { name: fyLabel(lastFy) }).click();
  await expect(page.getByRole('heading', { name: `${fyLabel(lastFy)} by stock` })).toBeVisible();
  await expect(stockRow(page, mobile, 'US', 'E2EDIVUS')).toContainText('₹1,700');
  await expect(stockRow(page, mobile, 'US', 'E2EDIVUS')).toContainText('$20.00');
  await expect(stockRow(page, mobile, 'IN', 'E2EDIVA')).toContainText('₹1,500');

  await expectNoHorizontalScroll(page);
  await screenshot(page, 'dividends', testInfo.project.name);

  // Edit the US dividend's rupees
  await editButton(page, mobile, 'E2EDIVUS', SEPTEMBER).click();
  const edit = page.getByRole('dialog', { name: 'Edit dividend' });
  await expect(edit.getByLabel('Amount ($)')).toHaveValue('20');
  await edit.getByLabel('Amount (₹)').fill('1800');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(last).toContainText('₹3,300');

  // Scoped to Me, the Wife dividend drops out of this year
  await choosePortfolio(page, testInfo, 'Me');
  await expect(statCard(page, `Received in ${fyLabel(currentFy)}`)).toContainText('₹0');
  await expect(statCard(page, 'All time')).toContainText('2 dividends');
  await choosePortfolio(page, testInfo, 'All');

  // Delete the Indian dividend from last year
  await editButton(page, mobile, 'E2EDIVA', JUNE).click();
  await edit.getByRole('button', { name: 'Delete' }).click();
  await edit
    .getByRole('group', { name: 'Confirm delete' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(edit).toBeHidden();
  await expect(last).toContainText('₹1,800');
  await expect(statCard(page, 'All time')).toContainText('2 dividends');
});
