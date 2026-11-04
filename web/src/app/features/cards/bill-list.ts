import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { formatDate } from '../../shared/format/number';
import { CardTemplate, CellTemplate, Column, DataTable } from '../../shared/ui/data-table';
import { MoneyPipe } from '../../shared/ui/money.pipe';
import { BillRow, STATUS_LABEL, STATUS_SEVERITY, dueLabel } from './bill-rows';

/**
 * Bills as a table (from 768px) or cards with a large Mark paid button (mobile).
 * Rows arrive sorted (overdue first, paid last).
 */
@Component({
  selector: 'app-bill-list',
  imports: [ButtonModule, TagModule, CardTemplate, CellTemplate, DataTable, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-data-table
      [label]="label()"
      [rows]="rows()"
      [columns]="columns"
      [emptyMessage]="emptyMessage()"
      minWidth="52rem"
    >
      <ng-template appCell="name" let-row>
        <div class="name-cell">
          <span>{{ row.name }}</span>
          <span class="name-tags">
            @if (showPortfolio()) {
              <p-tag [value]="row.portfolio" severity="secondary" />
            }
            @if (row.bill.notes) {
              <span class="note-text" [title]="row.bill.notes">{{ row.bill.notes }}</span>
            }
          </span>
        </div>
      </ng-template>
      <ng-template appCell="amount" let-row>
        @if (row.amount === null) {
          <span class="muted">Not entered</span>
        } @else {
          <span class="app-num">{{ row.amount | money }}</span>
        }
      </ng-template>
      <ng-template appCell="dueDate" let-row>
        <span class="due">
          {{ date(row.dueDate) }}
          @if (row.status !== 'paid') {
            <span class="muted" [class.overdue]="row.status === 'overdue'">{{ due(row) }}</span>
          }
        </span>
      </ng-template>
      <ng-template appCell="status" let-row>
        <p-tag [value]="statusText(row)" [severity]="severity(row)" />
      </ng-template>
      <ng-template appCell="actions" let-row>
        <div class="row-actions">
          @if (canPay(row)) {
            <button
              pButton
              type="button"
              size="small"
              [disabled]="paying() === row.id"
              [attr.aria-label]="'Mark ' + row.name + ' paid'"
              (click)="markPaid.emit(row)"
            >
              Mark paid
            </button>
          }
          <button
            pButton
            type="button"
            iconOnly
            rounded
            text
            severity="secondary"
            [attr.aria-label]="'Edit ' + row.name + ' bill'"
            (click)="edit.emit(row)"
          >
            <i class="pi pi-pencil" aria-hidden="true"></i>
          </button>
        </div>
      </ng-template>
      <ng-template appCard let-row>
        <article class="app-card bill-card" [attr.aria-label]="row.name + ' bill'">
          <div class="bill-top">
            <span class="bill-name">{{ row.name }}</span>
            <p-tag [value]="statusText(row)" [severity]="severity(row)" />
          </div>
          <div class="bill-figures">
            @if (row.amount === null) {
              <span class="muted">Amount not entered yet</span>
            } @else {
              <span class="bill-amount">
                <span class="app-num">{{
                  (row.status === 'paid' ? row.amount : row.balance) | money
                }}</span>
                @if (row.status === 'partial' || (row.status === 'overdue' && row.paid > 0)) {
                  <span class="muted"> left of {{ row.amount | money }}</span>
                }
              </span>
            }
            <span class="muted" [class.overdue]="row.status === 'overdue'">
              Due {{ date(row.dueDate) }}
              @if (row.status !== 'paid') {
                · {{ due(row) }}
              }
            </span>
            @if (showPortfolio()) {
              <span><p-tag [value]="row.portfolio" severity="secondary" /></span>
            }
            @if (row.bill.notes) {
              <span class="note-text">{{ row.bill.notes }}</span>
            }
          </div>
          <div class="bill-actions">
            @if (canPay(row)) {
              <button
                pButton
                type="button"
                class="pay"
                [disabled]="paying() === row.id"
                [attr.aria-label]="'Mark ' + row.name + ' paid'"
                (click)="markPaid.emit(row)"
              >
                <i class="pi pi-check" aria-hidden="true"></i>
                Mark paid
              </button>
            }
            <button
              pButton
              type="button"
              severity="secondary"
              [attr.aria-label]="
                (row.amount === null ? 'Enter amount for ' : 'Edit ') + row.name + ' bill'
              "
              (click)="edit.emit(row)"
            >
              {{ row.amount === null ? 'Enter amount' : 'Edit' }}
            </button>
          </div>
        </article>
      </ng-template>
    </app-data-table>
  `,
  styles: `
    .muted {
      color: var(--app-text-muted);
      font-size: 13px;
    }
    .muted.overdue {
      color: var(--app-down);
    }
    .due {
      display: flex;
      flex-direction: column;
    }
    .note-text {
      max-width: 16rem;
      overflow: hidden;
      color: var(--app-text-muted);
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bill-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      border-radius: 16px;
    }
    .bill-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .bill-name {
      font-weight: 600;
    }
    .bill-figures {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .bill-amount {
      font-size: 20px;
    }
    .bill-actions {
      display: flex;
      gap: 8px;
    }
    .bill-actions button {
      min-height: 44px;
    }
    .pay {
      flex: 1;
    }
  `,
})
export class BillList {
  readonly rows = input.required<readonly BillRow[]>();
  readonly label = input.required<string>();
  readonly today = input.required<string>();
  readonly showPortfolio = input(false);
  readonly paying = input<string | null>(null);
  readonly emptyMessage = input('No bills.');
  readonly markPaid = output<BillRow>();
  readonly edit = output<BillRow>();

  protected readonly columns: Column<BillRow>[] = [
    { key: 'name', header: 'Card', type: 'custom', sortable: false },
    { key: 'amount', header: 'Amount', type: 'custom', alignEnd: true },
    { key: 'paid', header: 'Paid', type: 'money', sortable: false },
    { key: 'balance', header: 'Balance', type: 'money', sortable: false },
    { key: 'dueDate', header: 'Due', type: 'custom' },
    { key: 'status', header: 'Status', type: 'custom' },
    { key: 'actions', header: 'Actions', type: 'custom', hiddenHeader: true },
  ];

  protected statusText(row: BillRow): string {
    return STATUS_LABEL[row.status];
  }

  protected severity(row: BillRow): (typeof STATUS_SEVERITY)[keyof typeof STATUS_SEVERITY] {
    return STATUS_SEVERITY[row.status];
  }

  protected canPay(row: BillRow): boolean {
    return row.amount !== null && row.balance > 0;
  }

  protected date(value: string): string {
    return formatDate(value);
  }

  protected due(row: BillRow): string {
    return dueLabel(row.dueDate, this.today());
  }
}
