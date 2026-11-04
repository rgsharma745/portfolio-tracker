import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { PortfolioScope, PortfolioService } from '../../core/data/portfolio.service';

interface ScopeOption {
  label: string;
  value: PortfolioScope;
}

/**
 * All, then one entry per active portfolio. A dropdown from tablet up,
 * a scrollable chip row on mobile (shown/hidden with CSS).
 */
@Component({
  selector: 'app-portfolio-switcher',
  imports: [FormsModule, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-select
      class="switcher-select"
      [options]="options()"
      optionLabel="label"
      optionValue="value"
      [ngModel]="portfolios.scope()"
      (ngModelChange)="select($event)"
      ariaLabel="Portfolio"
    />
    <div class="switcher-chips" role="group" aria-label="Portfolio">
      @for (option of options(); track option.value) {
        <button
          type="button"
          class="chip"
          [class.chip-active]="option.value === portfolios.scope()"
          [attr.aria-pressed]="option.value === portfolios.scope()"
          (click)="select(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .switcher-select {
      display: none;
      min-width: 10rem;
    }
    .switcher-chips {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 2px;
    }
    .chip {
      flex: none;
      min-height: 44px;
      padding: 0 16px;
      border: 1px solid var(--app-hairline);
      border-radius: 9999px;
      background: transparent;
      color: var(--app-text);
      font: 600 14px var(--app-font-sans);
      cursor: pointer;
    }
    .chip-active {
      background: var(--app-text);
      border-color: var(--app-text);
      color: var(--app-bg);
    }
    .chip:focus-visible {
      outline: 2px solid var(--p-primary-color);
      outline-offset: 2px;
    }
    @media (min-width: 768px) {
      .switcher-select {
        display: inline-flex;
      }
      .switcher-chips {
        display: none;
      }
    }
  `,
})
export class PortfolioSwitcher {
  protected readonly portfolios = inject(PortfolioService);

  protected readonly options = computed<ScopeOption[]>(() => [
    { label: 'All', value: null },
    ...this.portfolios.active().map((p) => ({ label: p.name, value: p.id })),
  ]);

  protected select(scope: PortfolioScope): void {
    void this.portfolios.setScope(scope);
  }
}
