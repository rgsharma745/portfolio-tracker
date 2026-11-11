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
  adminInsert,
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
/** A stock's row in the By stock tab (for the year picked there). */
const stockRow = (page: Page, mobile: boolean, market: string, symbol: string) =>
  mobile
    ? page.getByTestId(`dividend-stock-${market}:${symbol}`)
    : page.getByRole('table', { name: /^Dividends by stock/ }).locator('tr', { hasText: symbol });
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
  const ids = await seedPortfolios(ownerId, ['Me', 'Wife']); // cascades: no dividends

  await signInWithMagicLink(page, HOLDINGS_EMAIL);
  await page.goto('/dividends');
  await expect(page.getByRole('heading', { level: 1, name: 'Dividends' })).toBeVisible();

  // First dividend, from the empty state: an Indian stock last year
  await page.getByRole('button', { name: 'Add first dividend' }).click();
  const first = page.getByRole('dialog', { name: 'Add dividend' });
  await first.getByRole('button', { name: 'Save' }).click();
  await expect(first.getByText('Enter the symbol, e.g. ITC.')).toBeVisible();
  await expect(first.getByText('Enter the amount.')).toBeVisible();
  await first.getByRole('combobox', { name: 'Symbol' }).fill('e2ediva');
  await pickDate(page, first.getByLabel('Date received', { exact: true }), JUNE);
  await expect(first.getByText(`Counts for ${fyLabel(lastFy)}.`)).toBeVisible();
  await first.getByLabel('Amount (₹)').fill('1,500');
  await first.getByRole('button', { name: 'Save' }).click();
  await expect(first).toBeHidden();

  // A US dividend needs the dollar amount as well as the rupees credited
  await page.getByRole('button', { name: 'Add dividend' }).click();
  const us = page.getByRole('dialog', { name: 'Add dividend' });
  await us.getByRole('button', { name: 'US' }).click();
  await us.getByRole('combobox', { name: 'Symbol' }).fill('E2EDIVUS');
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
  // Symbols already used come up as suggestions
  await wife.getByRole('combobox', { name: 'Symbol' }).fill('e2edi');
  await page.getByRole('option', { name: 'E2EDIVA', exact: true }).click();
  await expect(wife.getByRole('combobox', { name: 'Symbol' })).toHaveValue('E2EDIVA');
  await wife.getByLabel('Amount (₹)').fill('500');
  await wife.getByRole('button', { name: 'Save' }).click();
  await expect(wife).toBeHidden();

  await expect(statCard(page, `Received in ${fyLabel(currentFy)}`)).toContainText('₹500');
  await expect(statCard(page, 'All time')).toContainText('3 dividends');
  const tab = (name: string) => page.getByRole('tab', { name });
  await expect(tab('By year')).toHaveAttribute('aria-selected', 'true');
  const last = yearRow(page, mobile, lastFy);
  await expect(last).toContainText('₹1,500');
  await expect(last).toContainText('₹1,700');
  await expect(last).toContainText('$20.00');
  await expect(last).toContainText('₹3,200');
  await expect(yearRow(page, mobile, currentFy)).toContainText('₹500');
  await expectNoHorizontalScroll(page);
  await screenshot(page, 'dividends', testInfo.project.name);

  // By stock covers all years at first: both years of E2EDIVA added up
  await tab('By stock').click();
  const year = page.getByRole('combobox', { name: 'Financial year' });
  await expect(year).toHaveText('All years');
  await expect(stockRow(page, mobile, 'IN', 'E2EDIVA')).toContainText('₹2,000');
  await expect(stockRow(page, mobile, 'US', 'E2EDIVUS')).toContainText('₹1,700');
  await expect(stockRow(page, mobile, 'US', 'E2EDIVUS')).toContainText('$20.00');
  await expectNoHorizontalScroll(page);

  // Picking a year in By year opens that year by stock
  await tab('By year').click();
  if (mobile) await last.click();
  else await last.getByRole('button', { name: `${fyLabel(lastFy)} by stock` }).click();
  await expect(tab('By stock')).toHaveAttribute('aria-selected', 'true');
  await expect(year).toHaveText(fyLabel(lastFy));
  await expect(stockRow(page, mobile, 'IN', 'E2EDIVA')).toContainText('₹1,500');

  // Entries keep the same year: the current year's Wife dividend is not listed
  await tab('Entries').click();
  await expect(editButton(page, mobile, 'E2EDIVUS', SEPTEMBER)).toBeVisible();
  await expect(editButton(page, mobile, 'E2EDIVA', JUNE)).toBeVisible();
  await expect(page.getByRole('button', { name: /E2EDIVA/ })).toHaveCount(1);
  await expectNoHorizontalScroll(page);

  // Edit the US dividend's rupees
  await editButton(page, mobile, 'E2EDIVUS', SEPTEMBER).click();
  const edit = page.getByRole('dialog', { name: 'Edit dividend' });
  await expect(edit.getByLabel('Amount ($)')).toHaveValue('20');
  await edit.getByLabel('Amount (₹)').fill('1800');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await tab('By year').click();
  await expect(last).toContainText('₹3,300');

  // Scoped to Me, the Wife dividend drops out of this year
  await choosePortfolio(page, testInfo, 'Me');
  await expect(statCard(page, `Received in ${fyLabel(currentFy)}`)).toContainText('₹0');
  await expect(statCard(page, 'All time')).toContainText('2 dividends');
  await choosePortfolio(page, testInfo, 'All');

  // Delete the Indian dividend from last year
  await tab('Entries').click();
  await editButton(page, mobile, 'E2EDIVA', JUNE).click();
  await edit.getByRole('button', { name: 'Delete' }).click();
  await edit
    .getByRole('group', { name: 'Confirm delete' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(edit).toBeHidden();
  await tab('By year').click();
  await expect(last).toContainText('₹1,800');
  await expect(statCard(page, 'All time')).toContainText('2 dividends');

  // A long table scrolls inside its own box with the header row pinned (desktop: phones list cards)
  if (mobile) return;
  await adminInsert(
    'dividends',
    Array.from({ length: 60 }, (_, i) => ({
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      market: 'IN',
      symbol: `E2ELONG${i}`,
      paid_on: `${lastFy}-07-01`,
      amount_inr: 100 + i,
    })),
  );
  await page.reload();
  await tab('Entries').click();
  const table = page.getByRole('table', { name: /^Dividend entries/ });
  await expect(table.getByText('E2ELONG59', { exact: true })).toBeAttached();
  const box = page.locator('.p-datatable-table-container').filter({ has: table });
  await box.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const header = table.locator('thead th').first();
  await expect(header).toBeInViewport();
  const [boxTop, headerTop] = await Promise.all([
    box.evaluate((el) => el.getBoundingClientRect().top),
    header.evaluate((el) => el.getBoundingClientRect().top),
  ]);
  expect(Math.abs(headerTop - boxTop)).toBeLessThan(4);
  // Nothing in the body draws over the pinned header (the first column and buttons are layered too)
  const onTop = (el: Element) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + 8, r.top + r.height / 2));
  };
  expect(await header.evaluate(onTop)).toBe(true);
  expect(await table.locator('thead th').last().evaluate(onTop)).toBe(true);
});
