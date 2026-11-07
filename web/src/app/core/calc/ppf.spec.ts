import {
  PPF_YEARLY_MAX,
  PpfEntryInput,
  ppfAccountKey,
  ppfBalance,
  ppfByAccount,
  ppfByFinancialYear,
  ppfThisYear,
  ppfTotals,
} from './ppf';

const deposit = (overrides: Partial<PpfEntryInput> = {}): PpfEntryInput => ({
  portfolio_id: 'p1',
  account: 'SBI PPF',
  entry_date: '2025-04-05',
  entry_type: 'investment',
  amount: 100_000,
  ...overrides,
});

const interest = (overrides: Partial<PpfEntryInput> = {}): PpfEntryInput =>
  deposit({ entry_type: 'interest', entry_date: '2026-03-31', amount: 7100, ...overrides });

const SBI = ppfAccountKey({ portfolio_id: 'p1', account: 'SBI PPF' });

describe('ppfTotals', () => {
  it('adds investments and interest into the balance', () => {
    const entries = [deposit(), deposit({ amount: 50_000 }), interest()];
    expect(ppfTotals(entries, ['p1'])).toEqual({
      invested: 150_000,
      interest: 7100,
      balance: 157_100,
    });
    expect(ppfBalance(entries, ['p1'])).toBe(157_100);
  });

  it('only counts the given portfolios', () => {
    const entries = [deposit(), deposit({ portfolio_id: 'p2', amount: 1 })];
    expect(ppfBalance(entries, ['p2'])).toBe(1);
    expect(ppfBalance(entries, [])).toBe(0);
  });
});

describe('ppfByAccount', () => {
  it('groups by portfolio and account, sorted by account name', () => {
    const entries = [
      deposit(),
      interest(),
      deposit({ account: 'Post office', entry_date: '2024-06-01', amount: 500 }),
      deposit({ portfolio_id: 'p2', amount: 2000, entry_date: '2026-01-10' }),
    ];
    const summary = ppfByAccount(entries, ['p1', 'p2']);
    expect(summary.map((s) => [s.account, s.portfolioId, s.balance, s.lastDate])).toEqual([
      ['Post office', 'p1', 500, '2024-06-01'],
      ['SBI PPF', 'p1', 107_100, '2026-03-31'],
      ['SBI PPF', 'p2', 2000, '2026-01-10'],
    ]);
    expect(summary[1].key).toBe(SBI);
  });
});

describe('ppfByFinancialYear', () => {
  const today = '2026-11-07';

  it('splits at 1 April, newest year first, with a running closing balance', () => {
    const entries = [
      deposit({ entry_date: '2025-03-31', amount: 10_000 }), // FY 2024–25
      deposit({ entry_date: '2025-04-01', amount: 20_000 }), // FY 2025–26
      interest({ entry_date: '2026-03-31', amount: 1500 }), // FY 2025–26
      deposit({ entry_date: '2026-04-01', amount: 30_000 }), // FY 2026–27
    ];
    const rows = ppfByFinancialYear(entries, ['p1'], today);
    expect(rows.map((r) => [r.label, r.invested, r.interest, r.closingBalance])).toEqual([
      ['FY 2026–27', 30_000, 0, 61_500],
      ['FY 2025–26', 20_000, 1500, 31_500],
      ['FY 2024–25', 10_000, 0, 10_000],
    ]);
    expect(rows[0].roomLeft).toBe(PPF_YEARLY_MAX - 30_000);
  });

  it('includes gap years and flags a finished year below ₹500', () => {
    const entries = [
      deposit({ entry_date: '2022-05-01', amount: 1000 }),
      deposit({ entry_date: '2024-05-01', amount: 400 }),
      deposit({ entry_date: '2026-05-01', amount: 100 }), // this year: not finished, not flagged
    ];
    const rows = ppfByFinancialYear(entries, ['p1'], today);
    expect(rows.map((r) => [r.fyStart, r.invested, r.belowMinimum])).toEqual([
      [2026, 100, []],
      [2025, 0, ['SBI PPF']],
      [2024, 400, ['SBI PPF']],
      [2023, 0, ['SBI PPF']],
      [2022, 1000, []],
    ]);
  });

  it('flags an account over ₹1.5 lakh but never counts interest towards the limit', () => {
    const entries = [
      deposit({ amount: 100_000 }),
      deposit({ entry_date: '2025-09-01', amount: 60_000 }),
      interest({ amount: 12_000 }),
      deposit({ account: 'Post office', amount: 150_000 }),
    ];
    const [row] = ppfByFinancialYear(entries, ['p1'], today);
    expect(row.overLimit).toEqual(['SBI PPF']);
    expect(row.roomLeft).toBeNull(); // two accounts
    expect(ppfByFinancialYear(entries, ['p1'], today, SBI)[0].roomLeft).toBe(0);
  });

  it('does not flag years before an account was opened', () => {
    const entries = [
      deposit({ account: 'Old', entry_date: '2020-05-01', amount: 5000 }),
      deposit({ account: 'Old', entry_date: '2021-05-01', amount: 5000 }),
      deposit({ entry_date: '2021-06-01', amount: 5000 }),
    ];
    const rows = ppfByFinancialYear(entries, ['p1'], today);
    expect(rows.find((r) => r.fyStart === 2020)?.belowMinimum).toEqual([]);
  });

  it('narrows to one account and is empty without entries', () => {
    const entries = [deposit(), deposit({ account: 'Other', amount: 1 })];
    const rows = ppfByFinancialYear(entries, ['p1'], today, SBI);
    expect(rows.map((r) => r.invested)).toEqual([100_000]);
    expect(ppfByFinancialYear([], ['p1'], today)).toEqual([]);
    expect(ppfByFinancialYear(entries, ['p2'], today)).toEqual([]);
  });
});

describe('ppfThisYear', () => {
  it('sums this financial year’s deposits and gives room left for one account', () => {
    const entries = [
      deposit({ entry_date: '2026-04-01', amount: 40_000 }),
      deposit({ entry_date: '2026-03-31', amount: 99_000 }), // last year
      interest({ entry_date: '2026-05-01', amount: 9000 }), // not a deposit
    ];
    expect(ppfThisYear(entries, ['p1'], '2026-11-07')).toEqual({
      invested: 40_000,
      roomLeft: 110_000,
      accounts: 1,
    });
  });

  it('gives no room left over several accounts', () => {
    const entries = [deposit(), deposit({ account: 'Other' })];
    expect(ppfThisYear(entries, ['p1'], '2025-11-07')).toEqual({
      invested: 200_000,
      roomLeft: null,
      accounts: 2,
    });
  });
});
