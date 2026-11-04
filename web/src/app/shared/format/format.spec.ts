import { toCsv } from './csv';
import { formatDate, formatMonth, formatUnits, numberInputText, parseDecimal } from './number';
import { filterByPl, matchesSearch, sortRows } from './sort';

describe('number formatting', () => {
  it('formats units with en-IN grouping and up to 4 decimals', () => {
    expect(formatUnits(123456.78901)).toBe('1,23,456.789');
    expect(formatUnits(10)).toBe('10');
    expect(formatUnits(null)).toBe('—');
  });

  it('formats dates and months', () => {
    expect(formatDate('2026-11-03')).toBe('3 Nov 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatMonth('2026-11-01')).toBe('November 2026');
  });

  it('parses typed numbers', () => {
    expect(parseDecimal('1,23,456.78')).toBe(123456.78);
    expect(parseDecimal(' ₹ 500 ')).toBe(500);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('-3')).toBe(-3);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(7)).toBe(7);
    expect(parseDecimal('12abc')).toBeNaN();
    expect(parseDecimal('1.2.3')).toBeNaN();
  });

  it('writes numbers back to input text', () => {
    expect(numberInputText(1234.5)).toBe('1234.5');
    expect(numberInputText(null)).toBe('');
  });
});

describe('toCsv', () => {
  it('quotes, escapes and neutralises formulas', () => {
    const csv = toCsv(
      [
        { header: 'Name', value: (r: { name: string; value: number | null }) => r.name },
        { header: 'Value', value: (r) => r.value },
      ],
      [
        { name: 'Fund, "Growth"', value: 1234.5 },
        { name: '=HYPERLINK("x")', value: null },
        { name: 'Plain', value: Number.NaN },
      ],
    );
    expect(csv).toBe(
      'Name,Value\r\n"Fund, ""Growth""",1234.5\r\n"\'=HYPERLINK(""x"")",\r\nPlain,\r\n',
    );
  });
});

describe('sortRows', () => {
  const rows = [
    { name: 'beta', value: 2 },
    { name: 'Alpha', value: null },
    { name: 'gamma', value: 10 },
  ];

  it('sorts numbers with empty values last', () => {
    expect(sortRows(rows, { key: 'value', order: 1 }).map((r) => r.name)).toEqual([
      'beta',
      'gamma',
      'Alpha',
    ]);
    expect(sortRows(rows, { key: 'value', order: -1 }).map((r) => r.name)).toEqual([
      'gamma',
      'beta',
      'Alpha',
    ]);
  });

  it('sorts text ignoring case, and keeps order without a sort', () => {
    expect(sortRows(rows, { key: 'name', order: 1 }).map((r) => r.name)).toEqual([
      'Alpha',
      'beta',
      'gamma',
    ]);
    expect(sortRows(rows, null)).toEqual(rows);
  });

  it('matches search text in any field', () => {
    expect(matchesSearch('  ALP ', 'Alpha fund', null)).toBe(true);
    expect(matchesSearch('zzz', 'Alpha')).toBe(false);
    expect(matchesSearch('', 'x')).toBe(true);
  });
});

describe('filterByPl', () => {
  const rows = [{ pl: 5 }, { pl: -2 }, { pl: 0 }, { pl: null }];
  it('keeps gainers, losers or everything', () => {
    expect(filterByPl(rows, 'gainers')).toEqual([{ pl: 5 }]);
    expect(filterByPl(rows, 'losers')).toEqual([{ pl: -2 }]);
    expect(filterByPl(rows, 'all')).toHaveLength(4);
  });
});
