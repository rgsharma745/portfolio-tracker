import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { Currency } from '../format/money';
import { MoneyPipe, PercentPipe } from './money.pipe';
import { PlColorDirective } from './pl-color.directive';

/** A headline figure with an optional gain/loss delta. */
@Component({
  selector: 'app-stat-card',
  imports: [MoneyPipe, PercentPipe, PlColorDirective, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-card stat-card" [attr.aria-busy]="loading()">
      <h3 class="stat-label">{{ label() }}</h3>
      @if (loading()) {
        <p-skeleton width="70%" height="1.75rem" />
        <p-skeleton width="45%" height="1rem" styleClass="mt-2" />
      } @else {
        @if (signed()) {
          <p class="stat-value app-num" [appPl]="value()">
            {{ value() | money: currency() : { sign: true, compact: compact() } }}
            @if (percent() !== undefined) {
              <span class="stat-percent">({{ percent() | percent2 }})</span>
            }
          </p>
        } @else {
          <p
            class="stat-value app-num"
            [class.app-down]="danger() && (value() ?? 0) > 0"
            [class.app-up]="goodWhenZero() && value() === 0"
          >
            {{ text() || (value() | money: currency() : { compact: compact() }) }}
          </p>
        }
        @if (note()) {
          <p class="stat-note">{{ note() }}</p>
        }
        @if (delta() !== undefined) {
          <p class="stat-delta app-num" [appPl]="delta()">
            {{ delta() | money: currency() : { sign: true, compact: compact() } }}
            @if (deltaPercent() !== undefined) {
              <span>({{ deltaPercent() | percent2 }})</span>
            }
            @if (deltaLabel()) {
              <span class="stat-delta-label">{{ deltaLabel() }}</span>
            }
          </p>
        }
      }
    </section>
  `,
  styles: `
    .stat-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .stat-label {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--app-text-muted);
    }
    .stat-value {
      margin: 0;
      font-size: 22px;
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    .stat-delta {
      margin: 0;
      font-size: 13px;
    }
    .stat-percent {
      font-size: 14px;
    }
    .stat-note {
      margin: 0;
      color: var(--app-text-muted);
      font-size: 13px;
    }
    .stat-delta-label {
      margin-left: 4px;
      color: var(--app-text-muted);
      font-family: var(--app-font-sans);
    }
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input<number | null>(null);
  readonly currency = input<Currency>('INR');
  readonly delta = input<number | null | undefined>(undefined);
  readonly deltaPercent = input<number | null | undefined>(undefined);
  readonly deltaLabel = input<string>('');
  /** Show the value in red when above zero (e.g. card dues). */
  readonly danger = input(false);
  readonly compact = input(false);
  /** Show the value itself as a gain/loss: signed and colored (P&L, today). */
  readonly signed = input(false);
  /** With `signed`: a percentage after the value. */
  readonly percent = input<number | null | undefined>(undefined);
  /** Show text instead of a money value (e.g. a card name). */
  readonly text = input('');
  /** A small line under the value. */
  readonly note = input('');
  /** Show a zero value in green (e.g. nothing pending). */
  readonly goodWhenZero = input(false);
  readonly loading = input(false);
}
