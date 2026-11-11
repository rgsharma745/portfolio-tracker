import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import {
  animationsDone,
  expect,
  test,
  HOLDINGS_EMAIL,
  adminInsert,
  adminUpsert,
  ensureUser,
  seedPortfolios,
  signInWithMagicLink,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = [
  '/overview',
  '/mutual-funds',
  '/stocks',
  '/dividends',
  '/rsu',
  '/savings',
  '/pf',
  '/ppf',
  '/nps',
  '/fd',
  '/cards',
  '/settings',
];
/** WCAG 2.1 A and AA, the level docs/UI_SPEC.md asks for. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date().toISOString().slice(0, 8) + '01';

async function audit(page: Page, where: string) {
  await animationsDone(page); // fading dialogs and overlays would fail the contrast check
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.map(
    (v) =>
      `${where} ${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target).join('\n  ')}`,
  );
  expect(report, report.join('\n')).toEqual([]);
}

type Theme = 'light' | 'dark';

/**
 * The data the audited pages and dialogs show, so populated states (and their warning tags)
 * are audited rather than empty ones. Resets the user's portfolios first.
 */
async function seedAuditData(): Promise<void> {
  const ownerId = await ensureUser(HOLDINGS_EMAIL);
  const ids = await seedPortfolios(ownerId, ['Me', 'Wife']);
  await adminUpsert('mf_nav_latest', [
    { scheme_code: 'e2e-a11y-1', nav: 50, nav_date: today, prev_nav: 49 },
  ]);
  await adminUpsert('stock_price_latest', [
    { symbol: 'E2EA11Y', close: 120, price_date: today, prev_close: 125, source: 'nse' },
  ]);
  await adminUpsert('fx_latest', [{ pair: 'USDINR', rate: 85, rate_date: today }]);
  await adminInsert('mf_holdings', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      scheme_name: 'E2E Accessible Fund',
      scheme_code: 'e2e-a11y-1',
      units: 100,
      invested: 4000,
    },
  ]);
  await adminInsert('stock_holdings', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      market: 'IN',
      symbol: 'E2EA11Y',
      currency: 'INR',
      quantity: 10,
      invested: 1300,
    },
  ]);
  await adminInsert('rsu_grants', [
    {
      owner_id: ownerId,
      portfolio_id: ids['Me'],
      symbol: 'E2EA11Y',
      grant_label: 'E2E 2025',
      grant_date: '2025-03-15',
      units_granted: 100,
      units_vested: 40,
      units_sold_for_tax: 12,
      tax_rate: 0.3,
    },
  ]);
  await adminInsert('savings_accounts', [
    { owner_id: ownerId, portfolio_id: ids['Wife'], bank: 'E2E Bank', balance: 4000 },
  ]);
  const pf = { owner_id: ownerId, portfolio_id: ids['Me'], company: 'E2E Tech' };
  await adminInsert('pf_entries', [
    {
      ...pf,
      contribution_type: 'monthly',
      wage_month: 'Oct',
      wage_year: 2026,
      transaction_date: today,
      employee_amount: 1800,
      employer_amount: 550,
      pension_amount: 1250,
    },
    {
      ...pf,
      contribution_type: 'interest',
      wage_month: null,
      wage_year: null,
      transaction_date: '2026-08-20',
      employee_amount: 1000,
      employer_amount: 500,
      pension_amount: 0,
    },
  ]);
  // PPF, with one year over the ₹1.5 lakh limit so the warning tag is audited too.
  const ppf = { owner_id: ownerId, portfolio_id: ids['Me'], account: 'E2E PPF' };
  await adminInsert('ppf_entries', [
    { ...ppf, entry_type: 'investment', entry_date: today, amount: 100000 },
    { ...ppf, entry_type: 'investment', entry_date: today, amount: 60000 },
    { ...ppf, entry_type: 'interest', entry_date: '2026-03-31', amount: 7100 },
  ]);
  // Dividends: an Indian and a US one (rupees and dollars), so both tags and the $ line show.
  const dividend = { owner_id: ownerId, portfolio_id: ids['Me'] };
  await adminInsert('dividends', [
    { ...dividend, market: 'IN', symbol: 'E2EDIVA', paid_on: today, amount_inr: 1500 },
    {
      ...dividend,
      market: 'US',
      symbol: 'E2EDIVUS',
      paid_on: today,
      amount_inr: 1700,
      amount_usd: 20,
    },
  ]);
  // NPS: two schemes, one without a NAV so the warning tag is audited too.
  await adminUpsert('nps_nav_latest', [
    { scheme_code: 'SM990002', nav: 50, nav_date: today, prev_nav: 49, is_manual: false },
  ]);
  const nps = { owner_id: ownerId, portfolio_id: ids['Me'], account: 'E2E PRAN' };
  await adminInsert('nps_holdings', [
    {
      ...nps,
      scheme_class: 'E',
      scheme_code: 'SM990002',
      scheme_name: 'E2E Scheme E',
      units: 100,
      units_as_of: today,
    },
    {
      ...nps,
      scheme_class: 'G',
      scheme_code: 'SM990404',
      scheme_name: 'E2E Scheme G',
      units: 10,
      units_as_of: today,
    },
  ]);
  await adminInsert('nps_contributions', [
    { ...nps, contributor: 'self', contribution_date: '2025-06-15', amount: 3000 },
    { ...nps, contributor: 'employer', contribution_date: '2025-06-15', amount: 1500 },
  ]);
  // FDs: one active, one maturing within 30 days and one matured, so every tag is audited.
  const fd = {
    owner_id: ownerId,
    portfolio_id: ids['Me'],
    principal: 100000,
    rate: 7.1,
    compounding: 'quarterly',
  };
  const shift = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  await adminInsert('fixed_deposits', [
    { ...fd, bank: 'E2E Bank', start_date: shift(-100), maturity_date: shift(265) },
    { ...fd, bank: 'E2E Soon', start_date: shift(-340), maturity_date: shift(25) },
    {
      ...fd,
      bank: 'E2E Old',
      start_date: shift(-400),
      maturity_date: shift(-35),
      compounding: 'payout',
    },
  ]);
  const [card] = await adminInsert('credit_cards', [
    { owner_id: ownerId, portfolio_id: ids['Me'], name: 'E2E Card', bill_day: 1, due_day: 20 },
  ]);
  await adminInsert('card_bills', [
    {
      owner_id: ownerId,
      card_id: card['id'],
      statement_month: monthStart,
      due_date: today,
      amount: 2500,
    },
  ]);
}

/** Seeds the audit data and opens every page in the given theme. */
async function prepare(page: Page, theme: Theme): Promise<void> {
  await seedAuditData();
  await page.addInitScript((mode) => localStorage.setItem('pt.theme', mode), theme);
}

// Pages and dialogs are separate tests so each stays well inside the time limit on CI (a
// 2-core runner recording coverage), and one more page or dialog does not push a single long
// test over it, as it did when Dividends was added.
for (const theme of ['light', 'dark'] as const) {
  test(`accessibility: every page passes WCAG 2.1 AA checks (${theme})`, async ({ page }) => {
    test.setTimeout(90_000);
    await prepare(page, theme);
    await page.goto('/login');
    await audit(page, `${theme} /login`);

    await signInWithMagicLink(page, HOLDINGS_EMAIL);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await audit(page, `${theme} ${path}`);
    }
  });

  test(`accessibility: dialogs pass WCAG 2.1 AA checks (${theme})`, async ({ page }) => {
    test.setTimeout(90_000);
    await prepare(page, theme);
    await signInWithMagicLink(page, HOLDINGS_EMAIL);

    // The PF dialog, with its type switch and month pickers.
    await page.goto('/pf');
    await page.getByRole('button', { name: 'Add next month for E2E Tech' }).click();
    const pfDialog = page.getByRole('dialog', { name: 'Add PF month' });
    await expect(pfDialog).toBeVisible();
    await expect(pfDialog.locator(':focus')).toHaveCount(1);
    await audit(page, `${theme} /pf dialog`);
    // The shared date picker (app-date-input), open
    await pfDialog.getByLabel('Transaction date').click();
    await expect(page.locator('.p-datepicker-panel')).toBeVisible();
    await audit(page, `${theme} date picker`);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // The PPF dialog, with its type switch.
    await page.goto('/ppf');
    await page.getByRole('button', { name: 'Add investment to E2E PPF' }).click();
    const ppfDialog = page.getByRole('dialog', { name: 'Add PPF investment' });
    await expect(ppfDialog).toBeVisible();
    await audit(page, `${theme} /ppf dialog`);
    await ppfDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(ppfDialog).toBeHidden();

    // The dividends tabs past the first, then the dialog for a US stock (dollars, rate hint).
    await page.goto('/dividends');
    for (const name of ['By stock', 'Entries']) {
      await page.getByRole('tab', { name }).click();
      await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      await audit(page, `${theme} /dividends ${name}`);
    }
    await page.getByRole('button', { name: 'Add dividend' }).click();
    const dividendDialog = page.getByRole('dialog', { name: 'Add dividend' });
    await expect(dividendDialog).toBeVisible();
    await dividendDialog.getByRole('button', { name: 'US' }).click();
    await dividendDialog.getByLabel('Amount ($)').fill('20');
    await expect(dividendDialog.getByRole('button', { name: 'Use it' })).toBeVisible();
    await audit(page, `${theme} /dividends dialog`);
    await dividendDialog.getByRole('combobox', { name: 'Symbol' }).fill('E2E');
    await expect(page.getByRole('option', { name: 'E2EDIVUS' })).toBeVisible();
    await audit(page, `${theme} /dividends symbol suggestions`);
    await page.keyboard.press('Escape');
    await dividendDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dividendDialog).toBeHidden();

    // The NPS dialogs: a contribution (with its Self/Employer switch) and Update units.
    await page.goto('/nps');
    await page.getByRole('button', { name: 'Add contribution to E2E PRAN' }).click();
    const npsDialog = page.getByRole('dialog', { name: 'Add contribution' });
    await expect(npsDialog).toBeVisible();
    await audit(page, `${theme} /nps contribution dialog`);
    await npsDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(npsDialog).toBeHidden();
    await page.getByRole('button', { name: 'Update units of E2E PRAN' }).click();
    const unitsDialog = page.getByRole('dialog', { name: 'Update units · E2E PRAN' });
    await expect(unitsDialog).toBeVisible();
    await audit(page, `${theme} /nps units dialog`);
    await unitsDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(unitsDialog).toBeHidden();

    // The FD dialog, filled in so the maturity preview is audited too.
    await page.goto('/fd');
    await page.getByRole('button', { name: 'Edit E2E Bank' }).click();
    const fdDialog = page.getByRole('dialog', { name: 'Edit FD' });
    await expect(fdDialog.getByText(/Matures with/)).toBeVisible();
    await audit(page, `${theme} /fd dialog`);
    await fdDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(fdDialog).toBeHidden();

    // An edit dialog, opened and closed from the keyboard; focus returns to its button.
    await page.goto('/mutual-funds');
    const add = page.getByRole('button', { name: 'Add fund' });
    await add.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add fund' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await audit(page, `${theme} add-fund dialog`);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(add).toBeFocused();
  });
}
