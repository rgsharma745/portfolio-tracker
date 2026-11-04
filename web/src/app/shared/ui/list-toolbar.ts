import { ChangeDetectionStrategy, Component, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { PlFilter, Sort } from '../format/sort';
import { BreakpointService } from '../layout/breakpoint.service';

export interface SortOption {
  label: string;
  value: string;
}

const PL_FILTERS: { label: string; value: PlFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Gainers', value: 'gainers' },
  { label: 'Losers', value: 'losers' },
];

let nextId = 0;

/**
 * Above a holdings list: search, Gainers/Losers filter, a sort menu on mobile (desktop sorts
 * from the table headers), Export CSV and Add.
 */
@Component({
  selector: 'app-list-toolbar',
  imports: [
    FormsModule,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <p-iconfield class="toolbar-search">
        <p-inputicon class="pi pi-search" />
        <input
          pInputText
          type="search"
          [placeholder]="searchLabel()"
          [attr.aria-label]="searchLabel()"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
        />
      </p-iconfield>
      <span [id]="filterLabelId" class="visually-hidden">Show</span>
      <p-selectbutton
        [options]="plFilters"
        optionLabel="label"
        optionValue="value"
        [ngModel]="plFilter()"
        (ngModelChange)="plFilter.set($event)"
        [allowEmpty]="false"
        [ariaLabelledBy]="filterLabelId"
      />
      @if (bp.isMobile()) {
        <span class="sort">
          <p-select
            [options]="sortOptions()"
            optionLabel="label"
            optionValue="value"
            [ngModel]="sort().key"
            (ngModelChange)="setSortKey($event)"
            ariaLabel="Sort by"
          />
          <button
            pButton
            type="button"
            iconOnly
            text
            severity="secondary"
            [attr.aria-label]="sort().order === 1 ? 'Sort descending' : 'Sort ascending'"
            (click)="flipSort()"
          >
            <i
              [class]="sort().order === 1 ? 'pi pi-sort-amount-up-alt' : 'pi pi-sort-amount-down'"
              aria-hidden="true"
            ></i>
          </button>
        </span>
      }
      <div class="toolbar-end">
        <ng-content />
        <button pButton type="button" severity="secondary" (click)="export.emit()">
          <i class="pi pi-download" aria-hidden="true"></i>
          Export CSV
        </button>
        <button pButton type="button" (click)="add.emit()">
          <i class="pi pi-plus" aria-hidden="true"></i>
          {{ addLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .sort {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .sort button {
      width: 44px;
      height: 44px;
    }
  `,
})
export class ListToolbar {
  protected readonly bp = inject(BreakpointService);
  protected readonly plFilters = PL_FILTERS;
  protected readonly filterLabelId = `toolbar-filter-${nextId++}`;

  readonly searchLabel = input('Search');
  readonly addLabel = input('Add');
  readonly sortOptions = input.required<SortOption[]>();
  readonly search = model('');
  readonly plFilter = model<PlFilter>('all');
  readonly sort = model.required<Sort>();
  readonly add = output();
  readonly export = output();

  protected setSortKey(key: string): void {
    this.sort.set({ key, order: key === 'name' ? 1 : -1 });
  }

  protected flipSort(): void {
    this.sort.update((s) => ({ ...s, order: s.order === 1 ? -1 : 1 }));
  }
}
