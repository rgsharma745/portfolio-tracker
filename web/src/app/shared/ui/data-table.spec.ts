import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Sort } from '../format/sort';
import { BreakpointService } from '../layout/breakpoint.service';
import { CardTemplate, CellTemplate, Column, DataTable } from './data-table';

interface Row {
  id: string;
  name: string;
  value: number | null;
}

@Component({
  imports: [DataTable, CardTemplate, CellTemplate],
  template: `
    <app-data-table
      label="Things"
      [rows]="rows()"
      [columns]="columns"
      [footer]="footer()"
      [sort]="sort()"
      (sortChange)="sort.set($event)"
    >
      <ng-template appCell="name" let-row>
        <strong class="name">{{ row.name }}</strong>
      </ng-template>
      <ng-template appCard let-row>
        <p class="card">{{ row.name }}</p>
      </ng-template>
    </app-data-table>
  `,
})
class Host {
  readonly rows = signal<Row[]>([
    { id: 'a', name: 'Alpha', value: 1500 },
    { id: 'b', name: 'Beta', value: null },
  ]);
  readonly footer = signal<Record<string, unknown> | null>({ value: 1500 });
  readonly sort = signal<Sort>({ key: 'value', order: -1 });
  readonly columns: Column<Row>[] = [
    { key: 'name', header: 'Name' },
    { key: 'value', header: 'Value', type: 'money' },
  ];
}

function render(mobile: boolean) {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [{ provide: BreakpointService, useValue: { isMobile: signal(mobile) } }],
  });
  const fixture = TestBed.createComponent(Host);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('DataTable', () => {
  it('renders a labelled table with formatted cells and a totals row', async () => {
    const { fixture, el } = render(false);
    await fixture.whenStable();
    const table = el.querySelector('table');
    expect(table?.getAttribute('aria-label')).toBe('Things');
    expect(el.querySelector('tbody')?.textContent).toContain('₹1,500');
    expect(el.querySelector('tfoot')?.textContent).toContain('Total');
  });

  it('keeps rendering when rows change', async () => {
    const { fixture, el } = render(false);
    await fixture.whenStable();
    fixture.componentInstance.rows.update((rows) => [
      ...rows,
      { id: 'c', name: 'Gamma', value: 10 },
    ]);
    fixture.componentInstance.footer.set({ value: 1510 });
    await fixture.whenStable();
    expect(el.querySelector('tbody')?.textContent).toContain('Gamma');
  });

  it('sorts from the column headers through the page', async () => {
    const { fixture, el } = render(false);
    await fixture.whenStable();
    const header = (name: string) =>
      [...el.querySelectorAll('th')].find((th) => th.textContent?.includes(name))!;
    expect(header('Value').getAttribute('aria-sort')).toBe('descending');
    header('Value').querySelector('button')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.sort()).toEqual({ key: 'value', order: 1 });
    expect(header('Value').getAttribute('aria-sort')).toBe('ascending');
    header('Name').querySelector('button')!.click();
    expect(fixture.componentInstance.sort()).toEqual({ key: 'name', order: 1 });
  });

  it('renders cards on mobile', async () => {
    const { fixture, el } = render(true);
    await fixture.whenStable();
    expect(el.querySelectorAll('.card')).toHaveLength(2);
    expect(el.querySelector('ul')?.getAttribute('aria-label')).toBe('Things');
  });
});
