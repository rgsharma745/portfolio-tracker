import { MISSING, formatMoney, formatPercent } from './money';

describe('formatMoney', () => {
  it('groups INR in lakhs and crores with no decimals by default', () => {
    expect(formatMoney(5674412)).toBe('₹56,74,412');
    expect(formatMoney(123456789.4)).toBe('₹12,34,56,789');
  });

  it('formats USD in en-US with two decimals by default', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('honours explicit digits', () => {
    expect(formatMoney(1234.567, 'INR', { digits: 2 })).toBe('₹1,234.57');
  });

  it('shows signs for gains and losses but not zero', () => {
    expect(formatMoney(2500, 'INR', { sign: true })).toBe('+₹2,500');
    expect(formatMoney(-2500, 'INR', { sign: true })).toBe('-₹2,500');
    expect(formatMoney(0, 'INR', { sign: true })).toBe('₹0');
    expect(formatMoney(-2500)).toBe('-₹2,500');
  });

  it('compacts large INR values to lakhs and crores', () => {
    expect(formatMoney(5674412, 'INR', { compact: true })).toBe('₹56.74L');
    expect(formatMoney(12500000, 'INR', { compact: true })).toBe('₹1.25Cr');
    expect(formatMoney(-150000, 'INR', { compact: true, sign: true })).toBe('-₹1.5L');
    expect(formatMoney(150000, 'INR', { compact: true, sign: true })).toBe('+₹1.5L');
  });

  it('does not compact values below one lakh', () => {
    expect(formatMoney(99999, 'INR', { compact: true })).toBe('₹99,999');
  });

  it('renders a dash for missing values', () => {
    expect(formatMoney(null)).toBe(MISSING);
    expect(formatMoney(undefined)).toBe(MISSING);
    expect(formatMoney(Number.NaN)).toBe(MISSING);
  });
});

describe('formatPercent', () => {
  it('adds a sign except for zero', () => {
    expect(formatPercent(12.345)).toBe('+12.35%');
    expect(formatPercent(-3.1)).toBe('-3.10%');
    expect(formatPercent(0)).toBe('0.00%');
    expect(formatPercent(null)).toBe(MISSING);
  });
});
