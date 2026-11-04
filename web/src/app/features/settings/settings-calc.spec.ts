import { describeRun, validateOverrideForm } from './settings-calc';

describe('describeRun', () => {
  it('summarises the NAV job message', () => {
    expect(
      describeRun({
        job: 'fetch_nav',
        status: 'success',
        message: '{"updated": 42, "unmatched": ["1", "2"]}',
      }),
    ).toBe('42 updated, 2 not found in the AMFI file');
    expect(
      describeRun({
        job: 'fetch_nav',
        status: 'success',
        message: '{"updated": 3, "unmatched": []}',
      }),
    ).toBe('3 updated');
  });

  it('shows other messages as they are', () => {
    expect(describeRun({ job: 'fetch_nav', status: 'failure', message: 'Timeout' })).toBe(
      'Timeout',
    );
    expect(describeRun({ job: 'fetch_nav', status: 'success', message: 'not json' })).toBe(
      'not json',
    );
    expect(describeRun({ job: 'fetch_nav', status: 'success', message: '{}' })).toBe('{}');
    expect(describeRun({ job: 'backup', status: 'success', message: null })).toBe('');
  });
});

describe('validateOverrideForm', () => {
  const today = '2026-11-04';

  it('accepts a stock price and a USD/INR rate', () => {
    expect(
      validateOverrideForm(
        { kind: 'stock', symbol: ' infy ', price: '1,512.4', date: today },
        today,
      ).value,
    ).toEqual({ kind: 'stock', symbol: 'INFY', price: 1512.4, date: today });
    expect(
      validateOverrideForm({ kind: 'usdinr', symbol: '', price: '85.2', date: '2026-11-01' }, today)
        .value,
    ).toMatchObject({ kind: 'usdinr', price: 85.2 });
  });

  it('explains problems', () => {
    expect(
      validateOverrideForm({ kind: 'stock', symbol: '', price: '', date: '' }, today).errors,
    ).toEqual({
      symbol: 'Choose or type a symbol.',
      price: 'Enter the price.',
      date: 'Pick a date.',
    });
    expect(
      validateOverrideForm({ kind: 'usdinr', symbol: '', price: '0', date: '2026-12-01' }, today)
        .errors,
    ).toEqual({ price: 'Must be more than zero.', date: 'Cannot be in the future.' });
    expect(
      validateOverrideForm({ kind: 'usdinr', symbol: '', price: '', date: today }, today).errors
        .price,
    ).toBe('Enter the rate.');
    expect(
      validateOverrideForm({ kind: 'stock', symbol: 'a b', price: '1', date: today }, today).errors
        .symbol,
    ).toBe('Use the exchange symbol, e.g. RELIANCE or AAPL.');
  });
});
