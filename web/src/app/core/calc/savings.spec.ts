import { savingsSummary, savingsTotal } from './savings';

const accounts = [
  { id: 'hdfc', portfolio_id: 'me', balance: 300000 },
  { id: 'sbi', portfolio_id: 'me', balance: 100000 },
  { id: 'icici', portfolio_id: 'wife', balance: 250000.5 },
  { id: 'old', portfolio_id: 'old', balance: 999 },
];

describe('savings', () => {
  it('totals one portfolio or several', () => {
    expect(savingsTotal(accounts, ['me'])).toBe(400000);
    expect(savingsTotal(accounts, ['me', 'wife'])).toBe(650000.5);
    expect(savingsTotal(accounts, [])).toBe(0);
  });

  it('gives each account its share of the total', () => {
    expect(savingsSummary(accounts, ['me'])).toEqual({
      total: 400000,
      accounts: [
        { id: 'hdfc', balance: 300000, share: 75 },
        { id: 'sbi', balance: 100000, share: 25 },
      ],
    });
  });

  it('has no shares when the total is zero, and none below zero', () => {
    const zero = savingsSummary([{ id: 'a', portfolio_id: 'me', balance: 0 }], ['me']);
    expect(zero.accounts[0].share).toBe(0);
    const overdrawn = savingsSummary(
      [
        { id: 'a', portfolio_id: 'me', balance: 1000 },
        { id: 'b', portfolio_id: 'me', balance: -200 },
      ],
      ['me'],
    );
    expect(overdrawn.total).toBe(800);
    expect(overdrawn.accounts.map((a) => a.share)).toEqual([100, 0]);
  });
});
