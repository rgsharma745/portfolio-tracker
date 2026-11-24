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

function cashFlows(rows: readonly MfTransactionInput[]): CashFlow[] {
  return rows.flatMap((row) => {
    const direction = EXTERNAL_FLOWS[row.transaction_type];
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
  const activeFolios = foliosWithCashFlows(scopedTransactions);
  if (activeFolios.size === 0) return null;
  const relevantTransactions = scopedTransactions.filter((row) =>
    activeFolios.has(scopeKey(row.portfolio_id, row.folio)),
  );
  const scopedHoldings = importedHoldings(scopedTransactions, holdings).filter(
    (row) => row.folio !== null && activeFolios.has(scopeKey(row.portfolio_id, row.folio)),
  );
  if (scopedHoldings.some((h) => h.value === null)) return null;
  const value = scopedHoldings.reduce((sum, h) => sum + (h.value ?? 0), 0);
  const flows = cashFlows(relevantTransactions);
  return xirr(value > 0 ? [...flows, { date: today, amount: value }] : flows);
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
