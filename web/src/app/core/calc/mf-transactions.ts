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

export interface MfXirrSummary {
  key: string;
  portfolioId: string;
  folio: string;
  xirr: number | null;
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

function scopeKey(portfolioId: string, folio: string | null): string {
  return `${portfolioId}\u0000${folio ?? ''}`;
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

function foliosWithCashFlows(rows: readonly MfTransactionInput[]): Set<string> {
  return new Set(
    rows
      .filter((row) => cashFlows([row]).length > 0)
      .map((row) => scopeKey(row.portfolio_id, row.folio)),
  );
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

/** One XIRR per portfolio/folio pair. A null value means the folio is not fully priced. */
export function mfXirrByFolio(
  transactions: readonly MfTransactionInput[],
  holdings: readonly MfCurrentValueInput[],
  portfolioIds: readonly string[],
  today: string,
): MfXirrSummary[] {
  const scopedTransactions = inPortfolios(transactions, portfolioIds);
  const scopedHoldings = importedHoldings(scopedTransactions, holdings);
  const keys = new Map<string, { portfolioId: string; folio: string }>();
  const activeFolios = foliosWithCashFlows(scopedTransactions);
  for (const row of scopedTransactions) {
    const key = scopeKey(row.portfolio_id, row.folio);
    if (!activeFolios.has(key)) continue;
    keys.set(key, {
      portfolioId: row.portfolio_id,
      folio: row.folio,
    });
  }
  return [...keys].map(([key, group]) => {
    const txns = scopedTransactions.filter(
      (row) => row.portfolio_id === group.portfolioId && row.folio === group.folio,
    );
    const current = scopedHoldings.filter(
      (row) => row.portfolio_id === group.portfolioId && row.folio === group.folio,
    );
    const unpriced = current.some((row) => row.value === null);
    const value = current.reduce((sum, row) => sum + (row.value ?? 0), 0);
    const flows = cashFlows(txns);
    return {
      key,
      portfolioId: group.portfolioId,
      folio: group.folio,
      xirr: unpriced ? null : xirr(value > 0 ? [...flows, { date: today, amount: value }] : flows),
    };
  });
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
