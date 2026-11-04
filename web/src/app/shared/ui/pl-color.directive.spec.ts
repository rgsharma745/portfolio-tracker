import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlColorDirective } from './pl-color.directive';

@Component({
  imports: [PlColorDirective],
  template: '<span [appPl]="value()">x</span>',
})
class Host {
  readonly value = signal<number | null>(null);
}

describe('PlColorDirective', () => {
  function render(value: number | null): HTMLElement {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set(value);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('span') as HTMLElement;
  }

  it('marks gains green', () => {
    expect(render(10).className).toBe('app-up');
  });

  it('marks losses red', () => {
    expect(render(-0.5).className).toBe('app-down');
  });

  it('leaves zero and missing values neutral', () => {
    expect(render(0).className).toBe('');
    expect(render(null).className).toBe('');
  });
});
