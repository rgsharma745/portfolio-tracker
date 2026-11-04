import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChild,
  contentChildren,
  inject,
  input,
  output,
} from '@angular/core';
import { TableModule } from 'primeng/table';
import { Currency } from '../format/money';
import { formatDate, formatUnits } from '../format/number';
import { Sort } from '../format/sort';
import { BreakpointService } from '../layout/breakpoint.service';
import { MoneyPipe, PercentPipe } from './money.pipe';
import { PlColorDirective } from './pl-color.directive';

export type ColumnType = 'text' | 'money' | 'pl' | 'percent' | 'units' | 'date' | 'custom';

export interface Column<T> {
  /** Row field shown in the cell and used for sorting. */
  key: string;
  header: string;
  type?: ColumnType;
  /** Defaults to true, except for `custom` columns. */
  sortable?: boolean;
  currency?: Currency | ((row: T) => Currency);
  /** Visually hidden header (e.g. an actions column). */
  hiddenHeader?: boolean;
  /** Right-align a custom column (numeric types are right-aligned already). */
  alignEnd?: boolean;
  /** How the totals row formats this column, when it differs from `type` (e.g. custom). */
  footerType?: ColumnType;
}

/** `<ng-template appCell="key" let-row>` overrides how one column's cells render. */
@Directive({ selector: 'ng-template[appCell]' })
export class CellTemplate {
  readonly appCell = input.required<string>();
  readonly template = inject(TemplateRef);
}

/** `<ng-template appFooter="key" let-totals>` overrides one column's cell in the totals row. */
@Directive({ selector: 'ng-template[appFooter]' })
export class FooterTemplate {
  readonly appFooter = input.required<string>();
  readonly template = inject(TemplateRef);
}

/** `<ng-template appCard let-row>`: how one row renders as a card below 768px. */
@Directive({ selector: 'ng-template[appCard]' })
export class CardTemplate {
  readonly template = inject(TemplateRef);
}

/**
 * The one table used by feature pages (AGENTS.md: never PrimeNG Table directly), so the
 * table can be swapped in one place. From 768px it renders a table with a sticky first
 * column, header sorting and an optional totals footer; below 768px a list of cards.
 * Sorting is controlled by the page (`sort` in, `sortChange` out) so the mobile sort menu
 * and the desktop headers share one state; rows arrive already sorted. PrimeNG's own
 * sorting is not used: it re-sorts on every new value and reports back, which loops with
 * page-controlled sorting.
 */
@Component({
  selector: 'app-data-table',
  imports: [NgTemplateOutlet, TableModule, MoneyPipe, PercentPipe, PlColorDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bp.isMobile() && cardTemplate()) {
      <ul class="card-list" [attr.aria-label]="label()">
        @for (row of rows(); track trackKey(row)) {
          <li>
            <ng-container
              [ngTemplateOutlet]="cardTemplate()!.template"
              [ngTemplateOutletContext]="{ $implicit: row }"
            />
          </li>
        }
      </ul>
    } @else {
      <div class="table-scroll">
        <p-table
          [value]="tableRows()"
          [dataKey]="dataKey()"
          [tableStyle]="{ 'min-width': minWidth() }"
          [pt]="tablePt()"
          [rowHover]="true"
        >
          <ng-template #header>
            <tr>
              @for (col of columns(); track col.key) {
                @if (isSortable(col)) {
                  <th [class.num]="isNumeric(col)" [attr.aria-sort]="ariaSort(col)">
                    <button type="button" class="sort-button" (click)="toggleSort(col)">
                      {{ col.header }}
                      <i [class]="'pi ' + sortIcon(col)" aria-hidden="true"></i>
                    </button>
                  </th>
                } @else {
                  <th [class.num]="isNumeric(col)">
                    <span [class.visually-hidden]="col.hiddenHeader">{{ col.header }}</span>
                  </th>
                }
              }
            </tr>
          </ng-template>
          <ng-template #body let-row>
            <tr>
              @for (col of columns(); track col.key) {
                <td [class.num]="isNumeric(col)">
                  <ng-container
                    [ngTemplateOutlet]="cell"
                    [ngTemplateOutletContext]="{ $implicit: row, col: col }"
                  />
                </td>
              }
            </tr>
          </ng-template>
          @if (footer(); as totals) {
            <ng-template #footer>
              <tr>
                @for (col of columns(); track col.key; let first = $first) {
                  <td [class.num]="isNumeric(col)">
                    @if (footerTemplates().get(col.key); as custom) {
                      <ng-container
                        [ngTemplateOutlet]="custom"
                        [ngTemplateOutletContext]="{ $implicit: totals }"
                      />
                    } @else if (first && valueOf(totals, col) === undefined) {
                      Total
                    } @else if (footerColumn(col); as footerCol) {
                      <ng-container
                        [ngTemplateOutlet]="plainCell"
                        [ngTemplateOutletContext]="{ $implicit: totals, col: footerCol }"
                      />
                    }
                  </td>
                }
              </tr>
            </ng-template>
          }
          <ng-template #emptymessage>
            <tr>
              <td [attr.colspan]="columns().length" class="empty">{{ emptyMessage() }}</td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    }

    <ng-template #cell let-row let-col="col">
      @if (cellTemplates().get(col.key); as custom) {
        <ng-container [ngTemplateOutlet]="custom" [ngTemplateOutletContext]="{ $implicit: row }" />
      } @else {
        <ng-container
          [ngTemplateOutlet]="plainCell"
          [ngTemplateOutletContext]="{ $implicit: row, col: col }"
        />
      }
    </ng-template>

    <ng-template #plainCell let-row let-col="col">
      @switch (col.type) {
        @case ('money') {
          <span class="app-num">{{ num(row, col) | money: currencyOf(row, col) }}</span>
        }
        @case ('pl') {
          <span class="app-num" [appPl]="num(row, col)">
            {{ num(row, col) | money: currencyOf(row, col) : { sign: true } }}
          </span>
        }
        @case ('percent') {
          <span class="app-num" [appPl]="num(row, col)">{{ num(row, col) | percent2 }}</span>
        }
        @case ('units') {
          <span class="app-num">{{ units(num(row, col)) }}</span>
        }
        @case ('date') {
          {{ date(valueOf(row, col)) }}
        }
        @default {
          {{ valueOf(row, col) }}
        }
      }
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .card-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .table-scroll {
      overflow-x: auto;
      border: 1px solid var(--app-hairline);
      border-radius: 24px;
    }
    th,
    td {
      white-space: nowrap;
    }
    th {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    :host ::ng-deep tfoot td {
      font-size: 14px;
    }
    th.num,
    td.num {
      text-align: right;
    }
    .sort-button {
      display: inline-flex;
      text-transform: inherit;
      letter-spacing: inherit;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .sort-button:focus-visible {
      outline: 2px solid var(--p-primary-color);
      outline-offset: 2px;
    }
    .sort-button .pi {
      font-size: 10px;
      color: var(--app-text-muted);
    }
    /* Unsorted columns show their sort icon only on hover or keyboard focus. */
    .sort-button .pi-sort-alt {
      opacity: 0;
    }
    th:hover .pi-sort-alt,
    .sort-button:focus-visible .pi-sort-alt {
      opacity: 1;
    }
    /* Sticky first column so the name stays visible while scrolling sideways. */
    th:first-child,
    td:first-child {
      position: sticky;
      left: 0;
      z-index: 1;
      white-space: normal;
      min-width: 16rem;
      max-width: 28rem;
    }
    /* Body cells take the row's (theme-aware, opaque) background so scrolled cells pass
       beneath the sticky column; header and totals cells keep the theme's band color. */
    :host ::ng-deep .p-datatable-tbody > tr > td:first-child {
      background: inherit;
    }
    :host ::ng-deep tfoot td {
      font-weight: 600;
    }
    .empty {
      padding: 24px;
      text-align: center;
      color: var(--app-text-body);
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class DataTable<T extends object> {
  protected readonly bp = inject(BreakpointService);

  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<readonly Column<T>[]>();
  /** Accessible name of the table or list. */
  readonly label = input.required<string>();
  readonly dataKey = input('id');
  /** Totals row: values by column key. The first column shows "Total" when it has none. */
  readonly footer = input<Record<string, unknown> | null>(null);
  readonly sort = input<Sort | null>(null);
  readonly emptyMessage = input('Nothing matches.');
  readonly minWidth = input('48rem');
  readonly sortChange = output<Sort>();

  protected readonly cardTemplate = contentChild(CardTemplate);
  private readonly cellDirectives = contentChildren(CellTemplate);
  private readonly footerDirectives = contentChildren(FooterTemplate);
  protected readonly footerTemplates = computed(
    () => new Map(this.footerDirectives().map((d) => [d.appFooter(), d.template])),
  );
  protected readonly cellTemplates = computed(
    () => new Map(this.cellDirectives().map((d) => [d.appCell(), d.template])),
  );
  /** p-table takes a mutable array; hand it a copy so the page's array stays untouched. */
  protected readonly tableRows = computed(() => [...this.rows()]);
  /** The accessible name belongs on the <table> element itself. */
  protected readonly tablePt = computed(() => ({ table: { 'aria-label': this.label() } }));

  protected trackKey(row: T): unknown {
    return (row as Record<string, unknown>)[this.dataKey()];
  }

  protected valueOf(row: object, col: Column<T>): unknown {
    return (row as Record<string, unknown>)[col.key];
  }

  /** The column as the totals row formats it, or null when it has no total. */
  protected footerColumn(col: Column<T>): Column<T> | null {
    const type = col.footerType ?? col.type;
    const totals = this.footer();
    if (!totals || type === 'custom' || totals[col.key] === undefined) return null;
    return { ...col, type };
  }

  protected currencyOf(row: T, col: Column<T>): Currency {
    const currency = col.currency ?? 'INR';
    return typeof currency === 'function' ? currency(row) : currency;
  }

  protected isSortable(col: Column<T>): boolean {
    return col.sortable ?? col.type !== 'custom';
  }

  protected isNumeric(col: Column<T>): boolean {
    return col.alignEnd || ['money', 'pl', 'percent', 'units'].includes(col.type ?? 'text');
  }

  protected num(row: object, col: Column<T>): number | null {
    const value = this.valueOf(row, col);
    return typeof value === 'number' ? value : null;
  }

  protected units(value: number | null): string {
    return formatUnits(value);
  }

  protected date(value: unknown): string {
    return formatDate(value as string | null);
  }

  protected ariaSort(col: Column<T>): 'ascending' | 'descending' | 'none' {
    const sort = this.sort();
    if (sort?.key !== col.key) return 'none';
    return sort.order === 1 ? 'ascending' : 'descending';
  }

  protected sortIcon(col: Column<T>): string {
    const sort = this.sort();
    if (sort?.key !== col.key) return 'pi-sort-alt';
    return sort.order === 1 ? 'pi-sort-amount-up-alt' : 'pi-sort-amount-down';
  }

  /** Same column flips the order; a new column starts descending for numbers. */
  protected toggleSort(col: Column<T>): void {
    const sort = this.sort();
    const order =
      sort?.key === col.key ? (sort.order === 1 ? -1 : 1) : this.isNumeric(col) ? -1 : 1;
    this.sortChange.emit({ key: col.key, order });
  }
}
