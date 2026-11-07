import { Injectable, inject, signal } from '@angular/core';
import { Tables } from '../db.types';
import { HoldingsService } from './holdings.service';
import { SUPABASE } from './supabase.client';
import { WriteError, writeErrorMessage } from './write-error';

export type JobRun = Tables<'job_runs'>;

/** The scheduled jobs, in the order Settings lists them. */
export const JOBS = ['fetch_nav', 'fetch_nps_nav', 'fetch_prices', 'snapshot', 'backup'] as const;
export type JobName = (typeof JOBS)[number];

/**
 * Manual price overrides and job status. Overrides are rows in the shared latest-price
 * tables with `is_manual = true`, which the jobs never overwrite; removing the row hands
 * the symbol back to the jobs (docs/DATA_MODEL.md).
 */
@Injectable({ providedIn: 'root' })
export class MarketService {
  private readonly supabase = inject(SUPABASE);
  private readonly holdings = inject(HoldingsService);

  readonly lastRuns = signal<Partial<Record<JobName, JobRun>>>({});
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Loads the most recent run of each job. */
  async loadJobRuns(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const results = await Promise.all(
      JOBS.map((job) =>
        this.supabase
          .from('job_runs')
          .select('*')
          .eq('job', job)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    );
    this.loading.set(false);
    if (results.some((r) => r.error)) {
      this.error.set('Could not load job runs.');
      return;
    }
    const runs: Partial<Record<JobName, JobRun>> = {};
    JOBS.forEach((job, i) => {
      const run = results[i].data;
      if (run) runs[job] = run;
    });
    this.lastRuns.set(runs);
  }

  async setStockPrice(symbol: string, close: number, date: string): Promise<WriteError> {
    const { error } = await this.supabase
      .from('stock_price_latest')
      .upsert(
        { symbol, close, price_date: date, source: 'manual', is_manual: true },
        { onConflict: 'symbol' },
      );
    return this.afterWrite(error);
  }

  async setUsdInr(rate: number, date: string): Promise<WriteError> {
    const { error } = await this.supabase
      .from('fx_latest')
      .upsert({ pair: 'USDINR', rate, rate_date: date, is_manual: true }, { onConflict: 'pair' });
    return this.afterWrite(error);
  }

  /** Removes a manual override; the price job fills the row again on its next run. */
  async removeStockOverride(symbol: string): Promise<WriteError> {
    const { error } = await this.supabase
      .from('stock_price_latest')
      .delete()
      .eq('symbol', symbol)
      .eq('is_manual', true);
    return this.afterWrite(error);
  }

  async removeUsdInrOverride(): Promise<WriteError> {
    const { error } = await this.supabase
      .from('fx_latest')
      .delete()
      .eq('pair', 'USDINR')
      .eq('is_manual', true);
    return this.afterWrite(error);
  }

  private async afterWrite(error: { code?: string } | null): Promise<WriteError> {
    if (error) return writeErrorMessage(error);
    await this.holdings.load();
    return null;
  }
}
