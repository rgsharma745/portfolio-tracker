import { inPortfolios } from './common';

/** Savings: the total is the sum of balances; each account's share drives the share bar. */

export interface SavingsAccountInput {
  id: string;
  portfolio_id: string;
  balance: number;
}

export interface SavingsShare {
  id: string;
  balance: number;
  /** Percentage of the positive balances, 0 to 100 (0 for a zero or negative balance). */
  share: number;
}

export interface SavingsSummary {
  total: number;
  accounts: SavingsShare[];
}

export function savingsTotal(
  accounts: readonly SavingsAccountInput[],
  portfolioIds: readonly string[],
): number {
  return savingsSummary(accounts, portfolioIds).total;
}

/** Total and per-account share for the accounts in the given portfolios. */
export function savingsSummary(
  accounts: readonly SavingsAccountInput[],
  portfolioIds: readonly string[],
): SavingsSummary {
  const rows = inPortfolios(accounts, portfolioIds);
  const total = rows.reduce((sum, a) => sum + a.balance, 0);
  // Shares are of the positive balances, so an overdrawn account cannot push others past 100%.
  const positive = rows.reduce((sum, a) => sum + Math.max(a.balance, 0), 0);
  return {
    total,
    accounts: rows.map((a) => ({
      id: a.id,
      balance: a.balance,
      share: positive > 0 ? (Math.max(a.balance, 0) / positive) * 100 : 0,
    })),
  };
}
