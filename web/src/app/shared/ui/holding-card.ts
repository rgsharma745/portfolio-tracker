import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Currency } from '../format/money';
import { MoneyPipe, PercentPipe } from './money.pipe';
import { PlColorDirective } from './pl-color.directive';

/**
 * A holding in the mobile card list: name, current value, P&L and %, today. The whole card
 * is a button that opens the holding. Tags (portfolio, stale) go in the projected content.
 */
@Component({
  selector: 'app-holding-card',
  imports: [MoneyPipe, PercentPipe, PlColorDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="app-card holding" (click)="open.emit()">
      <span class="top">
        <span class="title">{{ title() }}</span>
        <span class="value app-num">{{ value() | money: currency() }}</span>
      </span>
      <span class="bottom">
        <span class="meta">
          <ng-content />
          @if (meta()) {
            <span>{{ meta() }}</span>
          }
        </span>
        <span class="figures app-num">
          <span [appPl]="pl()">
            {{ pl() | money: currency() : { sign: true } }} ({{ plPercent() | percent2 }})
          </span>
          @if (dayChange() !== undefined) {
            <span [appPl]="dayChange()">
              {{ dayChange() | money: currency() : { sign: true } }} today
            </span>
          }
        </span>
      </span>
    </button>
  `,
  styles: `
    .holding {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      min-height: 44px;
      padding: 14px 16px;
      border-radius: 16px;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .holding:focus-visible {
      outline: 2px solid var(--p-primary-color);
      outline-offset: 2px;
    }
    .top,
    .bottom {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .title {
      display: -webkit-box;
      overflow: hidden;
      font-weight: 600;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .value {
      flex-shrink: 0;
      font-weight: 500;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      color: var(--app-text-muted);
      font-size: 13px;
    }
    .figures {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      flex-shrink: 0;
      font-size: 13px;
    }
  `,
})
export class HoldingCard {
  readonly title = input.required<string>();
  readonly value = input<number | null>(null);
  readonly currency = input<Currency>('INR');
  readonly pl = input<number | null>(null);
  readonly plPercent = input<number | null>(null);
  /** Leave undefined to hide the "today" line. */
  readonly dayChange = input<number | null | undefined>(undefined);
  readonly meta = input('');
  readonly open = output();
}
