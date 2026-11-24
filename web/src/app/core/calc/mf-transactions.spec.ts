import { describe, expect, it } from 'vitest';
import { mfLiveXirr, mfTradeTotals, mfXirr, mfXirrByFolio } from './mf-transactions';

const indexFund = { scheme_code: '123456', scheme_name: 'Index Fund' };
const manualFund = { scheme_code: '654321', scheme_name: 'Manual Fund' };

const transactions = [
  {
    ...indexFund,
    portfolio_id: 'p1',
    folio: 'f1',
    transaction_date: '2024-01-01',
    transaction_type: 'PURCHASE',
    amount: 100,
  },
  {
    ...indexFund,
    portfolio_id: 'p1',
    folio: 'f1',
    transaction_date: '2024-07-01',
    transaction_type: 'PURCHASE_SIP',
    amount: 100,
  },
  {
    ...indexFund,
    portfolio_id: 'p1',
    folio: 'f1',
    transaction_date: '2024-09-01',
    transaction_type: 'SWITCH_OUT',
    amount: 50,
  },
  {
    ...indexFund,
    portfolio_id: 'p2',
    folio: 'f2',
    transaction_date: '2024-01-01',
    transaction_type: 'PURCHASE',
    amount: 100,
  },
] as const;

describe('mutual fund transaction XIRR', () => {
  it('uses the imported purchase and current value for an Actual/365 annual return', () => {
    const history = [
      {
        ...indexFund,
        portfolio_id: 'p1',
        folio: 'f1',
        transaction_date: '2023-01-01',
        transaction_type: 'PURCHASE',
        amount: 100,
      },
    ];
    const current = [{ ...indexFund, portfolio_id: 'p1', folio: 'f1', value: 110 }];

    expect(mfXirr(history, current, ['p1'], '2024-01-01')).toBeCloseTo(0.1, 10);
    expect(mfXirrByFolio(history, current, ['p1'], '2024-01-01')[0].xirr).toBeCloseTo(0.1, 10);
  });

  it('calculates selected and all-portfolio XIRR from external flows and current value', () => {
    const holdings = [
      { ...indexFund, portfolio_id: 'p1', folio: 'f1', value: 250 },
      { ...indexFund, portfolio_id: 'p2', folio: 'f2', value: 125 },
    ];
    expect(mfXirr(transactions, holdings, ['p1'], '2025-01-01')).not.toBeNull();
    expect(mfXirr(transactions, holdings, ['p1', 'p2'], '2025-01-01')).not.toBeNull();
    expect(mfXirr(transactions, holdings, ['p2'], '2025-01-01')).not.toBeNull();
    expect(mfXirr(transactions, holdings, ['p2'], '2025-01-01')).not.toBe(
      mfXirr(transactions, holdings, ['p1', 'p2'], '2025-01-01'),
    );
  });

  it('reports folio returns independently and excludes unpriced holdings', () => {
    const rows = mfXirrByFolio(
      transactions,
      [
        { ...indexFund, portfolio_id: 'p1', folio: 'f1', value: 250 },
        { ...indexFund, portfolio_id: 'p2', folio: 'f2', value: null },
      ],
      ['p1', 'p2'],
      '2025-01-01',
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.folio === 'f1')?.xirr).not.toBeNull();
    expect(rows.find((row) => row.folio === 'f2')?.xirr).toBeNull();
  });

  it('returns null when the scoped holdings are not valued', () => {
    expect(
      mfXirr(
        transactions,
        [{ ...indexFund, portfolio_id: 'p1', folio: 'f1', value: null }],
        ['p1'],
        '2025-01-01',
      ),
    ).toBeNull();
  });

  it('excludes manual holdings without transaction flows from portfolio XIRR', () => {
    const history = [
      {
        ...indexFund,
        portfolio_id: 'p1',
        folio: 'f1',
        transaction_date: '2024-01-01',
        transaction_type: 'PURCHASE',
        amount: 100,
      },
    ];
    const withManual = mfXirr(
      history,
      [
        { ...indexFund, portfolio_id: 'p1', folio: 'f1', value: 150 },
        { ...manualFund, portfolio_id: 'p1', folio: 'f1', value: null },
        { ...manualFund, portfolio_id: 'p1', folio: 'f1', value: 500 },
      ],
      ['p1'],
      '2025-01-01',
    );
    const onlyImported = mfXirr(
      history,
      [{ ...indexFund, portfolio_id: 'p1', folio: 'f1', value: 150 }],
      ['p1'],
      '2025-01-01',
    );

    expect(withManual).toBe(onlyImported);
    const sameFolio = mfXirrByFolio(
      history,
      [
        { ...indexFund, portfolio_id: 'p1', folio: 'f1', value: 150 },
        { ...manualFund, portfolio_id: 'p1', folio: 'f1', value: 500 },
      ],
      ['p1'],
      '2025-01-01',
    );
    expect(sameFolio[0].xirr).toBe(onlyImported);
    const manualOnlyFolios = mfXirrByFolio(
      history,
      [{ ...indexFund, portfolio_id: 'p1', folio: 'manual-only', value: 500 }],
      ['p1'],
      '2025-01-01',
    );
    expect(manualOnlyFolios).toHaveLength(1);
    expect(manualOnlyFolios[0].folio).toBe('f1');
    expect(manualOnlyFolios[0].xirr).toBeNull();
  });

  it('calculates a closed folio from its realized flows without a terminal value', () => {
    const closed = [
      {
        ...indexFund,
        portfolio_id: 'p1',
        folio: 'f1',
        transaction_date: '2024-01-01',
        transaction_type: 'PURCHASE',
        amount: 100,
      },
      {
        ...indexFund,
        portfolio_id: 'p1',
        folio: 'f1',
        transaction_date: '2024-12-31',
        transaction_type: 'REDEMPTION',
        amount: 110,
      },
    ];
    expect(mfXirr(closed, [], ['p1'], '2025-01-01')).not.toBeNull();
  });
});

describe('portfolio live and overall XIRR', () => {
  it('starts live return at switch-in and keeps the original purchase in overall return', () => {
    const closed = { ...indexFund, portfolio_id: 'p1', folio: 'shared' };
    const open = { ...manualFund, portfolio_id: 'p1', folio: 'shared' };
    const history = [
      { ...closed, transaction_type: 'PURCHASE', transaction_date: '2023-01-01', amount: 100 },
      { ...closed, transaction_type: 'SWITCH_OUT', transaction_date: '2024-01-01', amount: -110 },
      { ...open, transaction_type: 'SWITCH_IN', transaction_date: '2024-01-01', amount: 110 },
    ];
    const holdings = [
      { ...closed, units: 0, value: 0 },
      { ...open, units: 1, value: 132 },
    ];
    const today = '2024-12-31';

    expect(mfLiveXirr(history, holdings, ['p1'], today)).toBeCloseTo(0.2);
    expect(mfXirr(history, holdings, ['p1'], today)).toBeCloseTo(Math.sqrt(1.32) - 1);
    expect(mfLiveXirr(history, holdings, ['p2'], today)).toBeNull();
    expect(mfXirr(history, holdings, ['p2'], today)).toBeNull();
    const unpriced = [holdings[0], { ...holdings[1], value: null }];
    expect(mfLiveXirr(history, unpriced, ['p1'], today)).toBeNull();
    expect(mfXirr(history, unpriced, ['p1'], today)).toBeNull();
  });

  it('keeps realized returns when every position is closed', () => {
    const position = { ...indexFund, portfolio_id: 'p1', folio: 'closed' };
    const history = [
      { ...position, transaction_type: 'PURCHASE', transaction_date: '2023-01-01', amount: 100 },
      { ...position, transaction_type: 'REDEMPTION', transaction_date: '2024-01-01', amount: -110 },
    ];
    const holdings = [{ ...position, units: 0, value: 0 }];
    expect(mfXirr(history, holdings, ['p1'], '2025-01-01')).toBeCloseTo(0.1);
    expect(mfLiveXirr(history, holdings, ['p1'], '2025-01-01')).toBeNull();
  });
});

describe('closed fund trade totals', () => {
  it('sums buy and sell amounts independently and ignores unclassified trades', () => {
    expect(
      mfTradeTotals([
        { transaction_side: 'buy', amount: 900 },
        { transaction_side: 'buy', amount: 100 },
        { transaction_side: 'sell', amount: -1100 },
        { transaction_side: 'sell', amount: null },
        { transaction_side: null, amount: 50 },
      ]),
    ).toEqual({ buy: 1000, sell: 1100 });
    expect(mfTradeTotals([{ transaction_side: 'buy', amount: 0 }])).toEqual({
      buy: 0,
      sell: null,
    });
  });
});
