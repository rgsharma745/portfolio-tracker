import { TestBed } from '@angular/core/testing';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  function render(inputs: Record<string, unknown>): HTMLElement {
    const fixture = TestBed.createComponent(StatCard);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the label, INR value and a signed, colored delta', () => {
    const el = render({ label: 'Mutual funds', value: 5674412, delta: -1250, deltaPercent: -0.5 });
    expect(el.querySelector('.stat-label')?.textContent).toContain('Mutual funds');
    expect(el.querySelector('.stat-value')?.textContent).toContain('₹56,74,412');
    const delta = el.querySelector('.stat-delta');
    expect(delta?.textContent).toContain('-₹1,250');
    expect(delta?.textContent).toContain('-0.50%');
    expect(delta?.classList).toContain('app-down');
  });

  it('turns the value red for dues above zero when danger is set', () => {
    const el = render({ label: 'Card dues', value: 34485, danger: true });
    expect(el.querySelector('.stat-value')?.classList).toContain('app-down');
  });

  it('shows skeletons while loading', () => {
    const el = render({ label: 'Stocks', loading: true });
    expect(el.querySelector('.stat-value')).toBeNull();
    expect(el.querySelectorAll('p-skeleton').length).toBe(2);
  });
});
