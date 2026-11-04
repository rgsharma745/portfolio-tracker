import { cardDues } from './cards';
import { mfTotals, navQuotes } from './mf';
import { rsuTotals } from './rsu';
import { savingsTotal } from './savings';
import { priceQuotes, stockTotals, usdInrRate } from './stocks';
import data from './fixtures/snapshot-case.json';

/**
 * The daily snapshot job (scripts/lib/calc.py) duplicates these formulas in Python. Both
 * sides check the same fixture, so a change to one that is not made to the other fails CI.
 */
describe('snapshot parity with the Python job', () => {
  const navs = navQuotes(data.mf_nav_latest);
  const prices = priceQuotes(data.stock_price_latest);
  const rate = usdInrRate(data.fx_latest);

  for (const [portfolioId, expected] of Object.entries(data.expected)) {
    it(`computes the same totals for ${portfolioId}`, () => {
      const ids = [portfolioId];
      expect(mfTotals(data.mf_holdings, navs, ids, data.today).value).toBeCloseTo(
        expected.mf_value,
        2,
      );
      expect(stockTotals(data.stock_holdings, prices, rate, ids, data.today).value).toBeCloseTo(
        expected.stocks_value,
        2,
      );
      expect(rsuTotals(data.rsu_grants, prices, rate, ids).vestedInr ?? 0).toBeCloseTo(
        expected.rsu_vested_value,
        2,
      );
      expect(savingsTotal(data.savings_accounts, ids)).toBeCloseTo(expected.savings, 2);
      expect(cardDues(data.card_bills, ids)).toBeCloseTo(expected.card_dues, 2);
    });
  }
});
