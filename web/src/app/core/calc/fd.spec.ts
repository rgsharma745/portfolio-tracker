import { FdInput, fdMaturityAmount, fdTotals, fdValue, fdView } from './fd';

const fd = (overrides: Partial<FdInput> = {}): FdInput => ({
  portfolio_id: 'p1',
  start_date: '2025-11-08',
  maturity_date: '2026-11-08', // 365 days
  principal: 100_000,
  rate: 7,
  compounding: 'quarterly',
  ...overrides,
});

describe('fdMaturityAmount', () => {
  it('compounds quarterly over a one-year term', () => {
    expect(fdMaturityAmount(fd())).toBeCloseTo(107_185.9, 1);
  });

  it('compounds at the chosen frequency', () => {
    const twoYears = fd({ principal: 250_000, rate: 7.25, maturity_date: '2027-11-08' });
    expect(fdMaturityAmount({ ...twoYears, compounding: 'monthly' })).toBeCloseTo(288_883.84, 2);
    expect(fdMaturityAmount(fd({ compounding: 'yearly' }))).toBeCloseTo(107_000, 6);
    expect(fdMaturityAmount(fd({ compounding: 'half_yearly' }))).toBeCloseTo(107_122.5, 6);
  });

  it('returns the principal for a payout FD', () => {
    expect(fdMaturityAmount(fd({ compounding: 'payout' }))).toBe(100_000);
  });

  it('treats an unknown compounding as quarterly', () => {
    expect(fdMaturityAmount(fd({ compounding: 'weekly' }))).toBeCloseTo(107_185.9, 1);
  });
});

describe('fdView', () => {
  it('values an FD part way through its term', () => {
    const v = fdView(fd(), '2026-05-09'); // day 182 of 365
    expect(v.value).toBeCloseTo(103_520.78, 2);
    expect(v.accrued).toBeCloseTo(3_520.78, 2);
    expect(v.maturityInterest).toBeCloseTo(7_185.9, 1);
    expect(v.daysLeft).toBe(183);
    expect(v.totalDays).toBe(365);
    expect(v.progress).toBeCloseTo((182 / 365) * 100, 6);
    expect(v.matured).toBe(false);
    expect(v.soon).toBe(false);
  });

  it('flags an FD maturing within 30 days', () => {
    expect(fdView(fd(), '2026-10-09').soon).toBe(true); // 30 days left
    expect(fdView(fd(), '2026-10-08').soon).toBe(false); // 31 days left
  });

  it('holds the maturity amount once matured', () => {
    const v = fdView(fd(), '2027-02-01');
    expect(v.matured).toBe(true);
    expect(v.soon).toBe(false);
    expect(v.daysLeft).toBe(0);
    expect(v.progress).toBe(100);
    expect(v.value).toBeCloseTo(107_185.9, 1);
  });

  it('is worth its principal before it starts', () => {
    const v = fdView(fd(), '2025-10-01');
    expect(v.value).toBe(100_000);
    expect(v.accrued).toBe(0);
    expect(v.progress).toBe(0);
    expect(v.daysLeft).toBe(403);
  });
});

describe('fdTotals', () => {
  it('sums the FDs in scope only', () => {
    const fds = [
      fd(),
      fd({ compounding: 'payout', principal: 50_000 }),
      fd({ portfolio_id: 'p2', principal: 1 }),
      fd({ maturity_date: '2026-01-01', principal: 10_000, compounding: 'yearly' }),
    ];
    const t = fdTotals(fds, ['p1'], '2026-11-08');
    expect(t.count).toBe(3);
    expect(t.matured).toBe(3); // two mature today, one in January
    expect(t.principal).toBe(160_000);
    expect(t.value).toBeCloseTo(t.principal + t.accrued, 6);
    expect(t.maturityAmount).toBeCloseTo(t.principal + t.maturityInterest, 6);
    expect(fdValue(fds, ['p1'], '2026-11-08')).toBe(t.value);
  });

  it('is zero with no FDs', () => {
    expect(fdTotals([], ['p1'], '2026-11-08')).toEqual({
      principal: 0,
      value: 0,
      accrued: 0,
      maturityAmount: 0,
      maturityInterest: 0,
      count: 0,
      matured: 0,
    });
  });
});
