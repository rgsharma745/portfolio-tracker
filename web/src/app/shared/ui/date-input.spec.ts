import { dateToIso, isoToDate } from './date-input';

describe('date input conversion', () => {
  it('reads YYYY-MM-DD as that local calendar day', () => {
    const date = isoToDate('2026-03-31');
    expect([date?.getFullYear(), date?.getMonth(), date?.getDate(), date?.getHours()]).toEqual([
      2026, 2, 31, 0,
    ]);
  });

  it('treats empty or malformed text as no date', () => {
    expect(isoToDate('')).toBeNull();
    expect(isoToDate(null)).toBeNull();
    expect(isoToDate('31/03/2026')).toBeNull();
  });

  it('writes the local calendar day, never shifted by the time zone', () => {
    // 23:30 local on 31 Mar is still 31 Mar here, though it may be 1 Apr in UTC
    expect(dateToIso(new Date(2026, 2, 31, 23, 30))).toBe('2026-03-31');
    expect(dateToIso(new Date(2027, 0, 5))).toBe('2027-01-05');
    expect(dateToIso(null)).toBe('');
    expect(dateToIso(new Date(Number.NaN))).toBe('');
  });

  it('round-trips', () => {
    expect(dateToIso(isoToDate('2024-02-29'))).toBe('2024-02-29');
  });
});
