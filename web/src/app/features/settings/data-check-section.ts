import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DataProblem, DataProblemKind } from '../../core/calc/data-check';
import { DataCheckService } from '../../core/data/data-check.service';
import { RefreshService } from '../../core/data/refresh.service';
import { ErrorState } from '../../shared/ui/error-state';
import { ListSkeleton } from '../../shared/ui/list-skeleton';

interface ProblemGroup {
  kind: DataProblemKind;
  title: string;
  hint: string;
  items: DataProblem[];
}

const GROUPS: Record<DataProblemKind, { title: string; hint: string }> = {
  mf_no_code: {
    title: 'Funds without a scheme code',
    hint: 'Add the AMFI scheme code (a number, listed on amfiindia.com or your statement) so the daily NAV job can value these funds.',
  },
  mf_code_not_found: {
    title: 'Scheme codes not found in the AMFI file',
    hint: 'The last NAV job could not find these codes. Check them for typos, or whether the fund was merged or renamed.',
  },
  mf_no_nav: {
    title: 'Funds with no NAV yet',
    hint: 'The NAV job has not priced these codes yet. If this remains after the next daily run, check the code.',
  },
  stock_no_price: {
    title: 'Stocks without a price',
    hint: 'Check the symbol (NSE symbol such as RELIANCE, or a US ticker such as CIEN), or set a manual price in Settings.',
  },
  rsu_no_price: {
    title: 'RSU grants without a price',
    hint: 'The grant symbol has no stock price yet. Check the ticker, or set a manual price.',
  },
  card_missing_days: {
    title: 'Cards missing a bill day or due day',
    hint: 'Set both days so bill due dates can be computed.',
  },
};

/** Settings › Data check: what the jobs cannot price, grouped with how to fix it. */
@Component({
  selector: 'app-data-check-section',
  imports: [ButtonModule, TagModule, ErrorState, ListSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-card flex flex-col gap-4" aria-labelledby="data-check-title">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="section-title" id="data-check-title">Data check</h2>
          <p class="section-hint">Holdings the daily jobs cannot value, and incomplete cards.</p>
        </div>
        <button
          pButton
          type="button"
          iconOnly
          rounded
          text
          severity="secondary"
          aria-label="Run data check again"
          [disabled]="check.loading()"
          (click)="check.load()"
        >
          <i class="pi pi-refresh" aria-hidden="true"></i>
        </button>
      </div>

      @if (check.loading() && !groups().length) {
        <app-list-skeleton [rows]="3" />
      } @else if (check.error(); as message) {
        <app-error-state [message]="message" (retry)="check.load()" />
      } @else if (!groups().length) {
        <p class="all-good" role="status">
          <i class="pi pi-check-circle" aria-hidden="true"></i>
          All good: everything can be valued.
        </p>
      } @else {
        @for (group of groups(); track group.kind) {
          <div class="group" [attr.data-testid]="'check-' + group.kind">
            <h3 class="group-title">
              {{ group.title }}
              <p-tag [value]="'' + group.items.length" severity="warn" />
            </h3>
            <p class="section-hint">{{ group.hint }}</p>
            <ul class="items">
              @for (item of group.items; track item.id) {
                <li class="item">
                  <span class="item-label">{{ item.label }}</span>
                  <span class="item-meta">{{ item.detail }} · {{ item.portfolio }}</span>
                </li>
              }
            </ul>
          </div>
        }
      }
    </section>
  `,
  styles: `
    .all-good {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: var(--app-up);
      font-weight: 600;
    }
    .group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .group-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }
    .items {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .item {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 2px 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--app-hairline);
    }
    .item-label {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .item-meta {
      color: var(--app-text-muted);
      font-size: 13px;
    }
  `,
})
export class DataCheckSection {
  protected readonly check = inject(DataCheckService);
  private readonly refresher = inject(RefreshService);

  protected readonly groups = computed<ProblemGroup[]>(() => {
    const byKind = new Map<DataProblemKind, DataProblem[]>();
    for (const problem of this.check.problems()) {
      byKind.set(problem.kind, [...(byKind.get(problem.kind) ?? []), problem]);
    }
    return (Object.keys(GROUPS) as DataProblemKind[])
      .filter((kind) => byKind.has(kind))
      .map((kind) => ({ kind, ...GROUPS[kind], items: byKind.get(kind) ?? [] }));
  });

  constructor() {
    // Runs on open and whenever the top bar Refresh is pressed.
    effect(() => {
      this.refresher.tick();
      void this.check.load();
    });
  }
}
