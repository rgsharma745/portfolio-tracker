import { TestBed } from '@angular/core/testing';
import { StockCard } from './stock-card';
import type { StockRow } from './stock-rows';

const row = (over: Partial<StockRow> = {}): StockRow =>
  ({
    id: 's',
    name: 'Reliance Industries',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    portfolio: 'Me',
    currency: 'INR',
    quantity: 30,
    avgPrice: 2131,
    invested: 63_930,
    price: 2390,
    priceDate: '2026-11-10',
    value: 71_700,
    valueInr: 71_700,
    pl: 7770,
    plPercent: 12.15,
    dayChange: 850,
    dayChangePercent: 1.2,
    stale: false,
    ...over,
  }) as StockRow;

function render(r: StockRow) {
  const fixture = TestBed.createComponent(StockCard);
  fixture.componentRef.setInput('row', r);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  return { fixture, el, text };
}

describe('StockCard', () => {
  it('lays out quantity, average, P&L %, value, invested and today’s move', () => {
    const { text, el } = render(row());
    expect(text).toContain('Qty. 30 · Avg. ₹2,131.00');
    expect(text).toContain('+12.15%');
    expect(text).toContain('RELIANCE');
    expect(text).toContain('₹71,700');
    expect(text).toContain('Invested ₹63,930');
    expect(text).toContain('LTP ₹2,390.00');
    expect(text).toContain('(+1.20%)');
    expect(el.querySelector('.value')?.classList).toContain('app-up');
  });

  it('leaves out the average and today’s move when they are unknown', () => {
    const { text, el } = render(
      row({ avgPrice: null, dayChange: null, dayChangePercent: null, pl: -10 }),
    );
    expect(text).not.toContain('Avg.');
    expect(text).not.toContain('(');
    expect(el.querySelector('.value')?.classList).toContain('app-down');
  });

  it('opens the stock when tapped', () => {
    const { fixture, el } = render(row());
    const opened = vi.fn();
    fixture.componentInstance.open.subscribe(opened);
    el.querySelector('button')?.click();
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
