import { cardDues } from './cards';
import { fdValue } from './fd';
import { mfTotals, navQuotes } from './mf';
import { npsValue } from './nps';
import { pfBalance } from './pf';
import { ppfBalance } from './ppf';
import { equityValue } from './equity';
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
  const npsNavs = navQuotes(data.nps_nav_latest);

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
      expect(equityValue(data.equity_lots, ids).value).toBeCloseTo(
        expected.employee_equity_value,
        2,
      );
      expect(savingsTotal(data.savings_accounts, ids)).toBeCloseTo(expected.savings, 2);
      expect(cardDues(data.card_bills, ids)).toBeCloseTo(expected.card_dues, 2);
      expect(pfBalance(data.pf_entries, ids)).toBeCloseTo(expected.pf_balance, 2);
      expect(ppfBalance(data.ppf_entries, ids)).toBeCloseTo(expected.ppf_balance, 2);
      expect(npsValue(data.nps_holdings, npsNavs, ids, data.today)).toBeCloseTo(
        expected.nps_value,
        2,
      );
      expect(fdValue(data.fixed_deposits, ids, data.today)).toBeCloseTo(expected.fd_value, 2);
    });
  }
});
