import { describeRun, validateOverrideForm } from './settings-calc';

describe('describeRun', () => {
  it('names the NPS NAV file for the NPS job', () => {
    expect(
      describeRun({
        job: 'fetch_nps_nav',
        status: 'success',
        message: '{"updated": 3, "unmatched": ["SM000001"], "source": "npstrust"}',
      }),
    ).toBe('3 updated, 1 not found in the NPS NAV file');
  });

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

  it('summarises the price, snapshot and backup jobs', () => {
    expect(
      describeRun({
        job: 'fetch_prices',
        status: 'success',
        message: '{"fx":"frankfurter","missing":["JIO"],"sources":{"nse":1},"updated":3}',
      }),
    ).toBe('3 updated, no price for JIO, USD/INR from frankfurter');
    expect(
      describeRun({
        job: 'fetch_prices',
        status: 'success',
        message: '{"fx":"manual","missing":[],"updated":0}',
      }),
    ).toBe('0 updated, USD/INR set by hand');
    expect(
      describeRun({
        job: 'snapshot',
        status: 'success',
        message: '{"rows":2,"snap_date":"2026-11-04"}',
      }),
    ).toBe('2 portfolios');
    expect(
      describeRun({
        job: 'backup',
        status: 'success',
        message: '{"file":"backup-2026-11-08.json.age","rows":{}}',
      }),
    ).toBe('backup-2026-11-08.json.age');
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
