import { inPortfolios } from './common';
import { CashFlow, xirr } from './xirr';

interface MfPosition {
  portfolio_id: string;
  folio: string | null;
  scheme_code: string | null;
  scheme_name: string;
}

export interface MfTransactionInput extends MfPosition {
  folio: string;
  transaction_date: string;
  transaction_type: string;
  amount: number | null;
}

export interface MfCurrentValueInput extends MfPosition {
  value: number | null;
}

const EXTERNAL_FLOWS: Readonly<Record<string, 1 | -1>> = {
  PURCHASE: -1,
  PURCHASE_SIP: -1,
  REDEMPTION: 1,
  DIVIDEND_PAYOUT: 1,
};

const LIVE_FLOWS: Readonly<Record<string, 1 | -1>> = {
  ...EXTERNAL_FLOWS,
  SWITCH_IN: -1,
  SWITCH_OUT: 1,
  SWITCH_IN_MERGER: -1,
  SWITCH_OUT_MERGER: 1,
};

function cashFlows(rows: readonly MfTransactionInput[], directions = EXTERNAL_FLOWS): CashFlow[] {
  return rows.flatMap((row) => {
    const direction = directions[row.transaction_type];
    return direction && row.amount !== null && row.amount !== 0
      ? [{ date: row.transaction_date, amount: direction * Math.abs(row.amount) }]
      : [];
  });
}

export function mfPositionKey(row: MfPosition): string {
  const scheme = row.scheme_code ?? row.scheme_name.trim().toLowerCase().replace(/\s+/g, ' ');
  return JSON.stringify([row.portfolio_id, row.folio, scheme]);
}

function importedHoldings(
  transactions: readonly MfTransactionInput[],
  holdings: readonly MfCurrentValueInput[],
): MfCurrentValueInput[] {
  const positions = new Set(transactions.map(mfPositionKey));
  return holdings.filter((row) => positions.has(mfPositionKey(row)));
}

/** XIRR for the selected portfolios, or all active portfolios when all are in scope. */
export function mfXirr(
  transactions: readonly MfTransactionInput[],
  holdings: readonly MfCurrentValueInput[],
  portfolioIds: readonly string[],
  today: string,
): number | null {
  const scopedTransactions = inPortfolios(transactions, portfolioIds);
  return xirrWithCurrentValue(
    cashFlows(scopedTransactions),
    importedHoldings(scopedTransactions, holdings),
    today,
  );
}

/** Return on positions still held, including transfers into and out of those positions. */
export function mfLiveXirr(
  transactions: readonly MfTransactionInput[],
  holdings: readonly (MfCurrentValueInput & { units: number })[],
  portfolioIds: readonly string[],
  today: string,
): number | null {
  const scopedTransactions = inPortfolios(transactions, portfolioIds);
  const open = importedHoldings(
    scopedTransactions,
    holdings.filter((row) => row.units > 0),
  );
  const keys = new Set(open.map(mfPositionKey));
  const rows = scopedTransactions.filter((row) => keys.has(mfPositionKey(row)));
  return xirrWithCurrentValue(cashFlows(rows, LIVE_FLOWS), open, today);
}

function xirrWithCurrentValue(
  flows: CashFlow[],
  holdings: readonly MfCurrentValueInput[],
  today: string,
): number | null {
  if (holdings.some((holding) => holding.value === null)) return null;
  const value = holdings.reduce((sum, holding) => sum + (holding.value ?? 0), 0);
  const daily = new Map<string, number>();
  for (const { date, amount } of flows) daily.set(date, (daily.get(date) ?? 0) + amount);
  if (value > 0) daily.set(today, (daily.get(today) ?? 0) + value);
  return xirr(Array.from(daily, ([date, amount]) => ({ date, amount })));
}

/** One return per scheme within a portfolio and folio, including transfers across positions. */
export function mfXirrByPosition(
  transactions: readonly MfTransactionInput[],
  holdings: readonly MfCurrentValueInput[],
  portfolioIds: readonly string[],
  today: string,
): Map<string, number | null> {
  const history = new Map<string, MfTransactionInput[]>();
  for (const row of inPortfolios(transactions, portfolioIds)) {
    const key = mfPositionKey(row);
    const rows = history.get(key);
    if (rows) rows.push(row);
    else history.set(key, [row]);
  }

  const returns = new Map<string, number | null>();
  for (const holding of inPortfolios(holdings, portfolioIds)) {
    const key = mfPositionKey(holding);
    const rows = history.get(key);
    if (rows) returns.set(key, xirrWithCurrentValue(cashFlows(rows, LIVE_FLOWS), [holding], today));
  }
  return returns;
}

/** Gross invested and redeemed amounts for the selected position's imported trades. */
export function mfTradeTotals(
  transactions: readonly { transaction_side: string | null; amount: number | null }[],
): { buy: number | null; sell: number | null } {
  const totals: { buy: number | null; sell: number | null } = { buy: null, sell: null };
  for (const { transaction_side: side, amount } of transactions) {
    if ((side === 'buy' || side === 'sell') && amount !== null) {
      totals[side] = (totals[side] ?? 0) + Math.abs(amount);
    }
  }
  return totals;
}
