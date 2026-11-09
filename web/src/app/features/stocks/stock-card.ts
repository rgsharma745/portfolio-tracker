import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatUnits } from '../../shared/format/number';
import { MoneyPipe, PercentPipe } from '../../shared/ui/money.pipe';
import { PlColorDirective } from '../../shared/ui/pl-color.directive';
import type { StockRow } from './stock-rows';

/**
 * A stock in the mobile list, laid out like a broker's holdings card:
 *
 *     Qty. 30 · Avg. ₹2,131.00                 +12.34%
 *     TICKER [tags]                            ₹71,700
 *     Invested ₹63,930            LTP ₹2,390.00 (+1.20%)
 *
 * The P&L % and the current value take the P&L colour; today's % takes today's colour.
 * The whole card is a button that opens the stock. Tags go in the projected content.
 */
@Component({
  selector: 'app-stock-card',
  imports: [MoneyPipe, PercentPipe, PlColorDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = row();
    <button type="button" class="app-card stock" (click)="open.emit()">
      <span class="line">
        <span class="muted">
          Qty. <span class="app-num">{{ units(r.quantity) }}</span>
          @if (r.avgPrice !== null) {
            · Avg. <span class="app-num">{{ r.avgPrice | money: r.currency : { digits: 2 } }}</span>
          }
        </span>
        <span class="end app-num" [appPl]="r.pl">{{ r.plPercent | percent2 }}</span>
      </span>
      <span class="line">
        <span class="symbol">
          <span class="symbol-name">{{ r.symbol }}</span>
          <ng-content />
        </span>
        <span class="end value app-num" [appPl]="r.pl">{{ r.value | money: r.currency }}</span>
      </span>
      <span class="line">
        <span class="muted"
          >Invested <span class="app-num">{{ r.invested | money: r.currency }}</span></span
        >
        <span class="end muted">
          LTP <span class="app-num">{{ r.price | money: r.currency : { digits: 2 } }}</span>
          @if (r.dayChangePercent !== null) {
            <span class="app-num" [appPl]="r.dayChange">({{ r.dayChangePercent | percent2 }})</span>
          }
        </span>
      </span>
    </button>
  `,
  styles: `
    .stock {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      min-height: 44px;
      padding: 14px 16px;
      border-radius: 16px;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .stock:focus-visible {
      outline: 2px solid var(--p-primary-color);
      outline-offset: 2px;
    }
    .line {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .muted {
      min-width: 0;
      color: var(--app-text-muted);
      font-size: 13px;
    }
    .end {
      flex-shrink: 0;
      text-align: right;
      font-size: 13px;
    }
    .symbol {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .symbol-name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .value {
      font-size: 16px;
      font-weight: 600;
    }
  `,
})
export class StockCard {
  readonly row = input.required<StockRow>();
  readonly open = output();

  protected units(value: number): string {
    return formatUnits(value);
  }
}
