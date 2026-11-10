import type { FixedDeposit } from '../../core/data/fd.service';
import { formatDate } from '../../shared/format/number';
import { fdCards, nextMaturityNote, rateText } from './fd-cards';

const TODAY = '2026-11-10';
const names = new Map([
  ['me', 'Me'],
  ['wife', 'Wife'],
]);

const fd = (id: string, bank: string, maturity: string, portfolio = 'me'): FixedDeposit => ({
  id,
  bank,
  portfolio_id: portfolio,
  start_date: '2025-11-10',
  maturity_date: maturity,
  principal: 100_000,
  rate: 7.25,
  compounding: 'quarterly',
  owner_id: 'owner',
  created_at: '2025-11-10T00:00:00Z',
  updated_at: '2025-11-10T00:00:00Z',
});

describe('fdCards', () => {
  const deposits = [
    fd('a', 'HDFC', '2027-05-10'),
    fd('b', 'SBI', '2026-11-11'),
    fd('c', 'ICICI', '2026-10-01'),
    fd('d', 'Axis', '2026-11-01'),
    fd('e', 'Kotak', '2026-12-01', 'wife'),
  ];

  it('lists running FDs soonest first and matured ones latest first', () => {
    const { active, matured } = fdCards(deposits, ['me', 'wife'], names, TODAY);
    expect(active.map((c) => c.fd.bank)).toEqual(['SBI', 'Kotak', 'HDFC']);
    expect(matured.map((c) => c.fd.bank)).toEqual(['Axis', 'ICICI']);
  });

  it('keeps only the selected portfolios and names each one', () => {
    const { active, matured } = fdCards(deposits, ['wife'], names, TODAY);
    expect(active.map((c) => [c.fd.bank, c.portfolio])).toEqual([['Kotak', 'Wife']]);
    expect(matured).toEqual([]);
    expect(fdCards(deposits, ['gone'], names, TODAY).active).toEqual([]);
    expect(
      fdCards([fd('x', 'PNB', '2027-01-01', 'other')], ['other'], names, TODAY).active[0].portfolio,
    ).toBe('');
  });

  it('says how long is left, with a rough term from 60 days', () => {
    const { active, matured } = fdCards(deposits, ['me', 'wife'], names, TODAY);
    const [sbi, kotak, hdfc] = active;
    expect([sbi.daysText, sbi.daysHint]).toEqual(['1 day left', '']);
    expect([kotak.daysText, kotak.daysHint]).toEqual(['21 days left', '']);
    expect(hdfc.daysText).toBe('181 days left');
    expect(hdfc.daysHint).toBe('About 6 months');
    expect(matured[0].daysText).toBe(`Matured ${formatDate('2026-11-01')}`);
    expect(matured[0].daysHint).toBe('');
  });

  it('formats the dates and the rate for the card', () => {
    const [card] = fdCards([deposits[0]], ['me'], names, TODAY).active;
    expect(card.startLabel).toBe(formatDate('2025-11-10'));
    expect(card.maturityLabel).toBe(formatDate('2027-05-10'));
    expect(card.rateText).toBe('7.25%');
  });
});

describe('rateText', () => {
  it('shows up to three decimals', () => {
    expect(rateText(7)).toBe('7%');
    expect(rateText(6.8)).toBe('6.8%');
    expect(rateText(7.1255)).toBe('7.126%');
  });
});

describe('nextMaturityNote', () => {
  it('names the next FD, or says every FD has matured, or nothing when there are none', () => {
    const [next] = fdCards([fd('b', 'SBI', '2026-11-11')], ['me'], names, TODAY).active;
    expect(nextMaturityNote(next, 0)).toBe('SBI · 1 day left');
    expect(nextMaturityNote(null, 2)).toBe('Every FD has matured');
    expect(nextMaturityNote(null, 0)).toBe('');
  });
});
