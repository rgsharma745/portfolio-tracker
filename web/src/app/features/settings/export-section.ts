import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { localIsoDate } from '../../core/calc/common';
import { ExportService } from '../../core/data/export.service';
import { downloadText } from '../../shared/format/download';

/** Settings › Export: download all your data as one JSON file. */
@Component({
  selector: 'app-export-section',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-card flex flex-col gap-3" aria-labelledby="export-title">
      <div>
        <h2 class="section-title" id="export-title">Export</h2>
        <p class="section-hint">
          Download everything you entered (portfolios, holdings, savings, cards, bills, history and
          settings) as a JSON file. Keep it somewhere private: it holds your financial data.
        </p>
      </div>
      @if (error()) {
        <p class="field-error" role="alert">Could not export. Try again.</p>
      }
      <div>
        <button pButton type="button" severity="secondary" [disabled]="busy()" (click)="export()">
          <i class="pi pi-download" aria-hidden="true"></i>
          {{ busy() ? 'Preparing…' : 'Export all data (JSON)' }}
        </button>
      </div>
    </section>
  `,
})
export class ExportSection {
  private readonly exporter = inject(ExportService);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  protected async export(): Promise<void> {
    this.busy.set(true);
    this.error.set(false);
    const data = await this.exporter.exportAll();
    this.busy.set(false);
    if (!data) {
      this.error.set(true);
      return;
    }
    downloadText(
      `portfolio-export-${localIsoDate()}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    );
  }
}
