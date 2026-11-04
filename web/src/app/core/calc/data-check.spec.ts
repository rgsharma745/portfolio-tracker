import { DataCheckInput, findDataProblems, parseUnmatchedCodes } from './data-check';

const empty: DataCheckInput = {
  portfolios: [
    { id: 'me', name: 'Me', is_active: true },
    { id: 'old', name: 'Old', is_active: false },
  ],
  mfHoldings: [],
  navCodes: [],
  unmatchedCodes: [],
  stockHoldings: [],
  pricedSymbols: [],
  rsuGrants: [],
  creditCards: [],
};

const fund = (id: string, code: string | null, portfolio = 'me') => ({
  id,
  scheme_name: `Fund ${id}`,
  scheme_code: code,
  portfolio_id: portfolio,
});

describe('findDataProblems', () => {
  it('reports nothing for clean data', () => {
    expect(
      findDataProblems({
        ...empty,
        mfHoldings: [fund('a', '100')],
        navCodes: ['100'],
        stockHoldings: [{ id: 's', symbol: 'INFY', market: 'IN', portfolio_id: 'me' }],
        pricedSymbols: ['INFY'],
        creditCards: [
          { id: 'c', name: 'Card', bill_day: 14, due_day: 3, portfolio_id: 'me', is_active: true },
        ],
      }),
    ).toEqual([]);
  });

  it('classifies funds: no code, not found in AMFI, no NAV yet', () => {
    const problems = findDataProblems({
      ...empty,
      mfHoldings: [fund('a', null), fund('b', '  '), fund('c', '200'), fund('d', '300')],
      unmatchedCodes: ['200'],
      navCodes: [],
    });
    expect(problems.map((p) => [p.id, p.kind])).toEqual([
      ['a', 'mf_no_code'],
      ['b', 'mf_no_code'],
      ['c', 'mf_code_not_found'],
      ['d', 'mf_no_nav'],
    ]);
    expect(problems[0].portfolio).toBe('Me');
  });

  it('prefers "not found" over "no NAV" for the same code', () => {
    const [problem] = findDataProblems({
      ...empty,
      mfHoldings: [fund('a', '200')],
      navCodes: ['200'],
      unmatchedCodes: ['200'],
    });
    expect(problem.kind).toBe('mf_code_not_found');
  });

  it('reports stocks and RSU grants without a price', () => {
    const problems = findDataProblems({
      ...empty,
      stockHoldings: [
        { id: 's1', symbol: 'INFY', market: 'IN', portfolio_id: 'me' },
        { id: 's2', symbol: 'CIEN', market: 'US', portfolio_id: 'me' },
      ],
      rsuGrants: [{ id: 'r1', symbol: 'CIEN', grant_label: '2024', portfolio_id: 'me' }],
      pricedSymbols: ['INFY'],
    });
    expect(problems.map((p) => [p.kind, p.label, p.detail])).toEqual([
      ['stock_no_price', 'CIEN', 'US'],
      ['rsu_no_price', 'CIEN · 2024', 'CIEN'],
    ]);
  });

  it('reports active cards missing a bill day or due day', () => {
    const card = { portfolio_id: 'me', is_active: true };
    const problems = findDataProblems({
      ...empty,
      creditCards: [
        { ...card, id: 'c1', name: 'A', bill_day: null, due_day: 3 },
        { ...card, id: 'c2', name: 'B', bill_day: 14, due_day: null },
        { ...card, id: 'c3', name: 'C', bill_day: null, due_day: null },
        { ...card, id: 'c4', name: 'D', bill_day: null, due_day: null, is_active: false },
      ],
    });
    expect(problems.map((p) => p.detail)).toEqual([
      'No bill day',
      'No due day',
      'No bill day or due day',
    ]);
  });

  it('ignores inactive portfolios', () => {
    expect(
      findDataProblems({
        ...empty,
        mfHoldings: [fund('a', null, 'old')],
        stockHoldings: [{ id: 's', symbol: 'X', market: 'IN', portfolio_id: 'old' }],
      }),
    ).toEqual([]);
  });
});

describe('parseUnmatchedCodes', () => {
  it('reads codes from the NAV job message', () => {
    expect(parseUnmatchedCodes('{"unmatched":["1","2"],"updated":40}')).toEqual(['1', '2']);
  });

  it('ignores plain text, missing keys and non-string entries', () => {
    expect(parseUnmatchedCodes('AMFI download failed')).toEqual([]);
    expect(parseUnmatchedCodes('{"updated":40}')).toEqual([]);
    expect(parseUnmatchedCodes('{"unmatched":[1,"2",null]}')).toEqual(['2']);
    expect(parseUnmatchedCodes(null)).toEqual([]);
  });
});
