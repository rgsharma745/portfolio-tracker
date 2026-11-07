import { xirr } from './xirr';

describe('xirr', () => {
  it("matches Excel's XIRR example", () => {
    // Microsoft's XIRR help page: =XIRR(values, dates) = 0.373362535
    const r = xirr([
      { date: '2008-01-01', amount: -10000 },
      { date: '2008-03-01', amount: 2750 },
      { date: '2008-10-30', amount: 4250 },
      { date: '2009-02-15', amount: 3250 },
      { date: '2009-04-01', amount: 2750 },
    ]);
    expect(r).toBeCloseTo(0.373362535, 6);
  });

  it('is exactly 10% for 1,000 growing to 1,100 over 365 days', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 9);
  });

  it('handles monthly contributions and a loss', () => {
    const flows = Array.from({ length: 12 }, (_, i) => ({
      date: `2025-${String(i + 1).padStart(2, '0')}-05`,
      amount: -5000,
    }));
    const r = xirr([...flows, { date: '2026-01-05', amount: 55000 }]);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(0);
    // The present value at the answer is zero
    const pv = [...flows, { date: '2026-01-05', amount: 55000 }].reduce(
      (s, f) =>
        s +
        f.amount /
          Math.pow(1 + r!, (Date.parse(f.date) - Date.parse('2025-01-05')) / 86_400_000 / 365),
      0,
    );
    expect(Math.abs(pv)).toBeLessThan(1e-3);
  });

  it('does not depend on the order of the flows', () => {
    const r = xirr([
      { date: '2026-01-01', amount: 1100 },
      { date: '2025-01-01', amount: -1000 },
    ]);
    expect(r).toBeCloseTo(0.1, 9);
  });

  it('falls back to bisection for a very large return', () => {
    const r = xirr([
      { date: '2026-01-01', amount: -100 },
      { date: '2026-01-11', amount: 110 },
    ]);
    // 10% in 10 days is about 3,160% a year, outside the bracket
    expect(r).toBeNull();
    const big = xirr([
      { date: '2025-01-01', amount: -100 },
      { date: '2026-01-01', amount: 900 },
    ]);
    expect(big).toBeCloseTo(8, 6);
  });

  it('returns null when there is no answer', () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: '2025-01-01', amount: -1000 }])).toBeNull();
    expect(
      xirr([
        { date: '2025-01-01', amount: -1000 },
        { date: '2026-01-01', amount: -1000 },
      ]),
    ).toBeNull();
    expect(
      xirr([
        { date: '2025-01-01', amount: -1000 },
        { date: '2025-01-01', amount: 1100 },
      ]),
    ).toBeNull();
    expect(
      xirr([
        { date: '2025-01-01', amount: -1000 },
        { date: '2026-01-01', amount: 0 },
      ]),
    ).toBeNull();
  });

  it('handles a near-total loss', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 50 },
    ]);
    expect(r).toBeCloseTo(-0.95, 6);
  });
});
