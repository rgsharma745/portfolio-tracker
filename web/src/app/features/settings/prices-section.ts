import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { localIsoDate } from '../../core/calc/common';
import { HoldingsService } from '../../core/data/holdings.service';
import { MarketService } from '../../core/data/market.service';
import { Market } from '../../core/calc/stocks';
import { EquityService } from '../../core/data/equity.service';
import { formatMoney } from '../../shared/format/money';
import { formatDate } from '../../shared/format/number';
import { FormErrors } from '../../shared/format/validation';
import { OverrideForm, OverrideKind, validateOverrideForm } from './settings-calc';
import { DateInput } from '../../shared/ui/date-input';
import { SuggestInput } from '../../shared/ui/suggest-input';

interface OverrideRow {
  kind: OverrideKind;
  key: string;
  label: string;
  value: string;
  date: string;
  market?: string;
  symbol?: string;
}

/**
 * Settings › Manual prices: set a stock's price or the USD/INR rate by hand (for example
 * when a source is down). The jobs never overwrite a manual value until it is removed.
 */
@Component({
  selector: 'app-prices-section',
  imports: [
    SuggestInput,
    FormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectButtonModule,
    DateInput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-card flex flex-col gap-4" aria-labelledby="prices-title">
      <div>
        <h2 class="section-title" id="prices-title">Manual prices</h2>
        <p class="section-hint">
          Set a price by hand when a source is wrong or missing. The daily jobs leave it alone until
          you remove it.
          @if (autoRate(); as rate) {
            Current USD/INR: <span class="app-num">{{ rate }}</span>.
          }
        </p>
      </div>

      @if (overrides().length) {
        <ul class="overrides" aria-label="Manual prices">
          @for (o of overrides(); track o.key) {
            <li>
              <span>
                <strong>{{ o.label }}</strong>
                <span class="app-num"> {{ o.value }}</span>
                <span class="muted"> · {{ o.date }}</span>
              </span>
              <button
                pButton
                type="button"
                text
                severity="secondary"
                [disabled]="busy()"
                [attr.aria-label]="'Remove manual price for ' + o.label"
                (click)="remove(o)"
              >
                Remove
              </button>
            </li>
          }
        </ul>
      }

      <form class="form-grid" (ngSubmit)="save()" novalidate>
        <span id="override-kind" class="visually-hidden">What to set</span>
        <p-selectbutton
          [options]="kinds"
          optionLabel="label"
          optionValue="value"
          [ngModel]="form().kind"
          (ngModelChange)="set('kind', $event)"
          [allowEmpty]="false"
          ariaLabelledBy="override-kind"
          name="kind"
        />
        <div class="form-row">
          @if (form().kind === 'stock') {
            <div class="field">
              <label for="override-market">Market</label>
              <select
                pInputText
                id="override-market"
                name="market"
                [ngModel]="stockMarket()"
                (ngModelChange)="stockMarket.set($event)"
              >
                <option value="IN">India</option>
                <option value="US">US</option>
              </select>
            </div>
            <div class="field">
              <label for="override-symbol">Symbol</label>
              <app-suggest-input
                inputId="override-symbol"
                [options]="symbols()"
                dropdownLabel="Show symbols"
                [value]="form().symbol"
                (valueChange)="set('symbol', $event)"
              />
              @if (errors().symbol; as e) {
                <p class="field-error">{{ e }}</p>
              }
            </div>
          }
          <div class="field">
            <label for="override-price">{{ priceLabel() }}</label>
            <input
              pInputText
              id="override-price"
              name="price"
              inputmode="decimal"
              autocomplete="off"
              [ngModel]="form().price"
              (ngModelChange)="set('price', $event)"
            />
            @if (errors().price; as e) {
              <p class="field-error">{{ e }}</p>
            }
          </div>
          <div class="field">
            <label for="override-date">As of</label>
            <app-date-input
              inputId="override-date"
              [maxDate]="today"
              [value]="form().date"
              (valueChange)="set('date', $event)"
            />
            @if (errors().date; as e) {
              <p class="field-error">{{ e }}</p>
            }
          </div>
        </div>
        @if (message(); as m) {
          <p-message [severity]="m.severity">{{ m.text }}</p-message>
        }
        <div>
          <button pButton type="submit" [disabled]="busy()">Set manual price</button>
        </div>
      </form>
    </section>
  `,
  styles: `
    .overrides {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .overrides li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 4px 12px;
      min-height: 44px;
      border-bottom: 1px solid var(--app-hairline);
    }
    .muted {
      color: var(--app-text-muted);
      font-size: 13px;
    }
  `,
})
export class PricesSection {
  private readonly holdings = inject(HoldingsService);
  private readonly equity = inject(EquityService);
  private readonly market = inject(MarketService);
  protected readonly today = localIsoDate();
  protected readonly stockMarket = signal<Market>('IN');
  protected readonly kinds: { label: string; value: OverrideKind }[] = [
    { label: 'Stock price', value: 'stock' },
    { label: 'USD/INR rate', value: 'usdinr' },
  ];

  protected readonly form = signal<OverrideForm>({
    kind: 'stock',
    symbol: '',
    price: '',
    date: this.today,
  });
  protected readonly errors = signal<FormErrors<OverrideForm>>({});
  protected readonly busy = signal(false);
  protected readonly message = signal<{ severity: 'success' | 'error'; text: string } | null>(null);

  protected readonly symbols = computed(() => {
    const market = this.stockMarket();
    const symbols = [
      ...this.holdings
        .stocks()
        .filter((s) => s.market === market)
        .map((s) => s.symbol),
      ...this.equity
        .ledger()
        .securities.filter((s) => s.market === market)
        .flatMap((s) => (s.symbol ? [s.symbol] : [])),
    ];
    return [...new Set(symbols)].sort((a, b) => a.localeCompare(b));
  });
  protected readonly priceLabel = computed(() =>
    this.form().kind === 'usdinr'
      ? 'Rate (₹ per $1)'
      : this.stockMarket() === 'US'
        ? 'Price ($)'
        : 'Price (₹)',
  );
  protected readonly autoRate = computed(() => {
    const fx = this.holdings.fx().find((r) => r.pair === 'USDINR');
    return fx ? `₹${fx.rate} (${formatDate(fx.rate_date)}${fx.is_manual ? ', manual' : ''})` : '';
  });
  protected readonly overrides = computed<OverrideRow[]>(() => {
    const rows: OverrideRow[] = this.holdings
      .prices()
      .filter((p) => p.is_manual)
      .map((p) => ({
        kind: 'stock',
        key: `stock:${p.market}:${p.symbol}`,
        label: `${p.symbol} (${p.market === 'UNASSIGNED' ? 'choose market' : p.market})`,
        market: p.market,
        symbol: p.symbol,
        value:
          p.market === 'UNASSIGNED'
            ? String(p.close)
            : formatMoney(p.close, p.market === 'US' ? 'USD' : 'INR', { digits: 2 }),
        date: formatDate(p.price_date),
      }));
    const fx = this.holdings.fx().find((r) => r.pair === 'USDINR' && r.is_manual);
    if (fx) {
      rows.push({
        kind: 'usdinr',
        key: 'usdinr',
        label: 'USD/INR',
        value: `₹${fx.rate}`,
        date: formatDate(fx.rate_date),
      });
    }
    return rows;
  });

  constructor() {
    void this.equity.load();
  }

  protected set<K extends keyof OverrideForm>(key: K, value: OverrideForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected async save(): Promise<void> {
    const { errors, value } = validateOverrideForm(this.form(), this.today);
    this.errors.set(errors);
    if (!value) return;
    await this.run(
      () =>
        value.kind === 'usdinr'
          ? this.market.setUsdInr(value.price, value.date)
          : this.market.setStockPrice(this.stockMarket(), value.symbol, value.price, value.date),
      `Saved the manual ${value.kind === 'usdinr' ? 'USD/INR rate' : `price for ${value.symbol}`}.`,
    );
    if (this.message()?.severity === 'success') {
      this.form.update((f) => ({ ...f, symbol: '', price: '' }));
    }
  }

  protected remove(row: OverrideRow): void {
    void this.run(
      () =>
        row.kind === 'usdinr'
          ? this.market.removeUsdInrOverride()
          : this.market.removeStockOverride(row.market ?? '', row.symbol ?? ''),
      `Removed the manual price for ${row.label}. The next price job fills it in again.`,
    );
  }

  private async run(write: () => Promise<string | null>, success: string): Promise<void> {
    this.busy.set(true);
    const error = await write();
    this.busy.set(false);
    this.message.set(
      error ? { severity: 'error', text: error } : { severity: 'success', text: success },
    );
  }
}
