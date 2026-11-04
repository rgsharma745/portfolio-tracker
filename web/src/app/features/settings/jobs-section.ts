import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { RefreshService } from '../../core/data/refresh.service';
import { JOBS, JobName, JobRun, MarketService } from '../../core/data/market.service';
import { JOB_LABEL, describeRun } from './settings-calc';

/** Settings › Job runs: when each scheduled job last ran and how it went. */
@Component({
  selector: 'app-jobs-section',
  imports: [DatePipe, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-card flex flex-col gap-3" aria-labelledby="jobs-title">
      <div>
        <h2 class="section-title" id="jobs-title">Job runs</h2>
        <p class="section-hint">The last run of each scheduled job.</p>
      </div>
      @if (market.error(); as e) {
        <p class="field-error">{{ e }}</p>
      }
      <ul class="jobs" aria-label="Job runs">
        @for (job of jobs; track job) {
          <li [attr.data-testid]="'job-' + job">
            <span class="job-name">{{ label[job] }}</span>
            @if (market.lastRuns()[job]; as run) {
              <p-tag
                [value]="run.status === 'success' ? 'Succeeded' : 'Failed'"
                [severity]="run.status === 'success' ? 'success' : 'danger'"
              />
              <span class="muted">{{
                run.finished_at ?? run.started_at | date: 'd MMM y, h:mm a'
              }}</span>
              @if (describe(run); as text) {
                <span class="detail">{{ text }}</span>
              }
            } @else {
              <span class="muted">Not run yet</span>
            }
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    .jobs {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .jobs li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 10px;
      padding: 10px 0;
      border-bottom: 1px solid var(--app-hairline);
    }
    .jobs li:last-child {
      border-bottom: 0;
    }
    .job-name {
      flex: 1 1 12rem;
      font-weight: 600;
    }
    .muted {
      color: var(--app-text-muted);
      font-size: 13px;
    }
    .detail {
      flex-basis: 100%;
      color: var(--app-text-body);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
  `,
})
export class JobsSection {
  protected readonly market = inject(MarketService);
  private readonly refresher = inject(RefreshService);
  protected readonly jobs = JOBS;
  protected readonly label: Record<JobName, string> = JOB_LABEL;

  constructor() {
    effect(() => {
      this.refresher.tick();
      void this.market.loadJobRuns();
    });
  }

  protected describe(run: JobRun): string {
    return describeRun(run);
  }
}
