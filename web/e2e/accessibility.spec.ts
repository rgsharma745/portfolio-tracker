import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  HOLDINGS_EMAIL,
  adminInsert,
  adminUpsert,
  ensureUser,
  seedPortfolios,
  signInWithMagicLink,
} from './support/fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = ['/overview', '/mutual-funds', '/stocks', '/rsu', '/savings', '/cards', '/settings'];
/** WCAG 2.1 A and AA, the level docs/UI_SPEC.md asks for. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date().toISOString().slice(0, 8) + '01';

async function audit(page: import('@playwright/test').Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.map(
    (v) =>
      `${where} ${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target).join('\n  ')}`,
  );
  expect(report, report.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`accessibility: every page passes WCAG 2.1 AA checks (${theme})`, async ({ page }) => {
    test.setTimeout(90_000);
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

    await page.addInitScript((mode) => localStorage.setItem('pt.theme', mode), theme);
    await page.goto('/login');
    await audit(page, `${theme} /login`);

    await signInWithMagicLink(page, HOLDINGS_EMAIL);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await audit(page, `${theme} ${path}`);
    }

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
