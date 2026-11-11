import { matchSuggestions } from './suggest';

describe('matchSuggestions', () => {
  const known = ['HDFCBANK', 'ICICIBANK', 'ITC', 'SBIN'];

  it('lists values starting with the query first, then those containing it', () => {
    expect(matchSuggestions(known, ' i')).toEqual(['ICICIBANK', 'ITC', 'SBIN']);
    expect(matchSuggestions(known, 'bank')).toEqual(['HDFCBANK', 'ICICIBANK']);
  });

  it('ignores case, and lists everything for an empty query', () => {
    expect(matchSuggestions(['Acme Ltd', 'Beta Corp'], 'CORP')).toEqual(['Beta Corp']);
    expect(matchSuggestions(known, '  ')).toEqual(known);
  });
});
