import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  CategoryScale,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { ThemeService } from '../../core/theme/theme.service';
import { Currency, formatMoney } from '../format/money';
import { amountsHidden } from '../format/privacy';
import { formatDate } from '../format/number';
import { MoneyPipe } from './money.pipe';

// Register only what the line chart uses, so the bundle stays small.
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
);

export interface ChartPoint {
  date: string;
  value: number;
}

/**
 * One series over time (Chart.js directly; see docs/ARCHITECTURE.md). Colors come from
 * the theme's CSS variables and re-apply when the theme changes. Hover shows a crosshair
 * tooltip with the date and value.
 */
@Component({
  selector: 'app-line-chart',
  imports: [MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="box" [style.height]="height()">
      <canvas #canvas role="img" [attr.aria-label]="summary()"></canvas>
    </div>
    <details #data (toggle)="showData.set(data.open)">
      <summary>View chart data</summary>
      @if (showData()) {
        <div class="chart-data" tabindex="0" role="region" [attr.aria-label]="label() + ' data'">
          <table>
            <caption class="visually-hidden">
              {{
                label()
              }}
              by date
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              @for (point of points(); track point.date) {
                <tr>
                  <td>{{ date(point.date) }}</td>
                  <td class="app-num">{{ point.value | money: currency() }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </details>
  `,
  styles: `
    .box {
      position: relative;
      width: 100%;
    }
    summary {
      align-content: center;
      min-block-size: 44px;
      cursor: pointer;
    }
    .chart-data {
      max-block-size: 18rem;
      overflow: auto;
    }
    table {
      inline-size: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: 8px;
      border-block-end: 1px solid var(--app-hairline);
      text-align: start;
    }
    th {
      position: sticky;
      inset-block-start: 0;
      background: var(--app-bg);
    }
    th:last-child,
    td:last-child {
      text-align: end;
    }
  `,
})
export class LineChart {
  readonly points = input.required<readonly ChartPoint[]>();
  /** What the series is, e.g. "Combined value". */
  readonly label = input.required<string>();
  readonly currency = input<Currency>('INR');
  readonly height = input('260px');
  protected readonly showData = signal(false);
  protected readonly date = formatDate;

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private chart: Chart<'line'> | null = null;

  /** Accessible name: the series and its first and last values. */
  protected readonly summary = computed(() => {
    const pts = this.points();
    if (!pts.length) return `${this.label()}: no data`;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const money = (v: number) => formatMoney(v, this.currency());
    return `${this.label()} from ${formatDate(first.date)} (${money(first.value)}) to ${formatDate(last.date)} (${money(last.value)})`;
  });

  constructor() {
    afterRenderEffect(() => {
      const points = this.points();
      this.theme.isDark();
      amountsHidden();
      this.render(points);
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }

  private render(points: readonly ChartPoint[]): void {
    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return; // e.g. unit tests without canvas support
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const line = color('--app-series-1');
    const muted = color('--app-text-muted');
    const grid = color('--app-hairline');
    const currency = this.currency();

    this.chart?.destroy();
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: points.map((p) => p.date),
        datasets: [
          {
            label: this.label(),
            data: points.map((p) => p.value),
            borderColor: line,
            backgroundColor: `${line}14`,
            borderWidth: 2,
            fill: 'origin',
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBorderWidth: 2,
            pointHoverBorderColor: color('--app-bg'),
            pointHoverBackgroundColor: line,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: (items) => formatDate(String(items[0]?.label ?? '')),
              label: (item) => formatMoney(item.parsed.y, currency),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: grid },
            ticks: {
              color: muted,
              maxTicksLimit: 6,
              maxRotation: 0,
              callback: (_value, index) => shortDate(points[index]?.date),
            },
          },
          y: {
            grid: { color: grid },
            border: { display: false },
            ticks: {
              // In privacy mode every tick would read ••••; the line's shape is enough.
              display: !amountsHidden(),
              color: muted,
              maxTicksLimit: 5,
              precision: 0,
              callback: (value) => formatMoney(Number(value), currency, { compact: true }),
            },
          },
        },
      },
    });
  }
}

function shortDate(iso: string | undefined): string {
  return iso ? formatDate(iso).replace(/ \d{4}$/, '') : '';
}
