import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatMoney } from '../format/money';
import { MoneyPipe } from './money.pipe';

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  /** 0 to 100. */
  share: number;
}

/** Below this share a block is too narrow for its label; the legend still lists it. */
const LABEL_MIN_SHARE = 12;

/**
 * One whole split into a few parts: a tall segmented bar with shares printed inside, and a
 * legend that lists every part with its amount and share (the table view). Colors are the
 * chart series tokens in a fixed order, so a part keeps its color across portfolios.
 */
@Component({
  selector: 'app-allocation-bar',
  imports: [MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" role="img" [attr.aria-label]="summary()">
      @for (part of parts(); track part.key) {
        <span
          class="block"
          [style.flex-grow]="part.share"
          [style.background]="colorOf(part.key)"
          [title]="part.label + ': ' + percent(part.share)"
        >
          @if (part.share >= labelMin) {
            <span class="block-label" [class.dark-label]="darkLabel(part.key)">{{
              percent(part.share)
            }}</span>
          }
        </span>
      }
    </div>
    <ul class="legend">
      @for (part of parts(); track part.key) {
        <li>
          <span class="swatch" [style.background]="colorOf(part.key)" aria-hidden="true"></span>
          <span class="name">{{ part.label }}</span>
          <span class="amount app-num">{{ part.value | money }}</span>
          <span class="share app-num">{{ percent(part.share) }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .bar {
      display: flex;
      gap: 2px;
      height: 28px;
    }
    .block {
      display: flex;
      align-items: center;
      min-width: 4px;
      padding: 0 8px;
      border-radius: 4px;
      overflow: hidden;
    }
    .block-label {
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .block-label.dark-label {
      color: #000; // 4.8:1 on light-theme blue, the closest of the four
    }
    .legend {
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      gap: 8px 12px;
      align-items: center;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
      font-size: 14px;
    }
    .legend li {
      display: contents;
    }
    .swatch {
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
    .name {
      color: var(--app-text-body);
    }
    .share {
      min-width: 3.5rem;
      color: var(--app-text-muted);
      text-align: right;
    }
  `,
})
export class AllocationBar {
  readonly parts = input.required<readonly AllocationSlice[]>();
  /** Slice keys in color order; a key's position picks its series color. */
  readonly order = input.required<readonly string[]>();
  protected readonly labelMin = LABEL_MIN_SHARE;

  protected readonly summary = computed(() =>
    this.parts()
      .map((p) => `${p.label} ${formatMoney(p.value)} (${this.percent(p.share)})`)
      .join(', '),
  );

  protected colorOf(key: string): string {
    const index = this.order().indexOf(key);
    return `var(--app-series-${(index < 0 ? 0 : index) + 1})`;
  }

  /**
   * Dark text on series 1 to 4 (blue, orange, green, yellow): white on them is below 4.5:1
   * in one theme or both (blue 4.4:1 light, 3.6:1 dark). Series 5 and 6 keep white.
   */
  protected darkLabel(key: string): boolean {
    const index = this.order().indexOf(key);
    return index >= 0 && index <= 3;
  }

  protected percent(share: number): string {
    return `${share.toFixed(share < 10 ? 1 : 0)}%`;
  }
}
