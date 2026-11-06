import { EMPTY_TOTALS } from '../../core/calc/common';
import { allocation, historySeries, summaryRow, totalRow } from './overview-calc';

const totals = (value: number, invested: number, dayChange: number, count: number) => ({
  ...EMPTY_TOTALS,
  value,
  invested,
  pl: value - invested,
  dayChange,
  count,
});

describe('summary rows', () => {
  it('combines MF and stocks per portfolio and adds a family total', () => {
    const me = summaryRow('me', 'Me', totals(1500, 1000, 10, 2), totals(500, 600, -5, 1));
    const wife = summaryRow('wife', 'Wife', totals(1000, 1000, 0, 1), EMPTY_TOTALS);
    expect(me).toMatchObject({ holdings: 3, invested: 1600, value: 2000, pl: 400, dayChange: 5 });
    expect(me.plPercent).toBe(25);
    expect(totalRow([me, wife])).toMatchObject({
      name: 'Family total',
      holdings: 4,
      invested: 2600,
      value: 3000,
      pl: 400,
      dayChange: 5,
    });
    expect(totalRow([])).toMatchObject({ value: 0, plPercent: 0 });
  });
});

describe('allocation', () => {
  it('gives each positive part its share', () => {
    expect(
      allocation([
        { key: 'mf', label: 'MF', value: 300 },
        { key: 'stocks', label: 'Stocks', value: 100 },
        { key: 'rsu', label: 'RSU', value: 0 },
        { key: 'savings', label: 'Savings', value: -5 },
      ]),
    ).toEqual([
      { key: 'mf', label: 'MF', value: 300, share: 75 },
      { key: 'stocks', label: 'Stocks', value: 100, share: 25 },
    ]);
    expect(allocation([])).toEqual([]);
  });
});

describe('historySeries', () => {
  const snap = (portfolio_id: string, snap_date: string, mf_value: number, stocks_value = 0) => ({
    portfolio_id,
    snap_date,
    mf_value,
    stocks_value,
  });
  const snapshots = [
    snap('me', '2026-11-03', 100, 50),
    snap('wife', '2026-11-03', 20),
    snap('me', '2026-09-01', 90),
    snap('me', '2025-01-01', 10),
    snap('old', '2026-11-03', 999),
  ];

  it('sums portfolios per day, oldest first', () => {
    expect(historySeries(snapshots, ['me', 'wife'], 'All', '2026-11-04')).toEqual([
      { date: '2025-01-01', value: 10 },
      { date: '2026-09-01', value: 90 },
      { date: '2026-11-03', value: 170 },
    ]);
  });

  it('limits to the range', () => {
    expect(historySeries(snapshots, ['me'], '1M', '2026-11-04')).toEqual([
      { date: '2026-11-03', value: 150 },
    ]);
    expect(historySeries(snapshots, ['me'], '6M', '2026-11-04')).toHaveLength(2);
    expect(historySeries(snapshots, ['me'], '1Y', '2026-11-04')).toHaveLength(2);
  });

  it('plots the PF balance from the first day it is above zero', () => {
    const pf = (portfolio_id: string, snap_date: string, pf_balance: number) => ({
      ...snap(portfolio_id, snap_date, 1),
      pf_balance,
    });
    const rows = [
      pf('me', '2026-09-01', 0),
      pf('me', '2026-10-01', 500),
      pf('wife', '2026-10-01', 100),
      pf('me', '2026-11-01', 700),
      snap('wife', '2026-11-01', 1), // a row without the column counts as 0
    ];
    expect(historySeries(rows, ['me', 'wife'], 'All', '2026-11-04', 'pf')).toEqual([
      { date: '2026-10-01', value: 600 },
      { date: '2026-11-01', value: 700 },
    ]);
    expect(historySeries([pf('me', '2026-11-01', 0)], ['me'], 'All', '2026-11-04', 'pf')).toEqual(
      [],
    );
  });
});
