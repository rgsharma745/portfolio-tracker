import { Injectable, inject, signal } from '@angular/core';
import { DataProblem, findDataProblems, parseUnmatchedCodes } from '../calc/data-check';
import { SUPABASE } from './supabase.client';

/** Loads what the Data check needs; the rules live in core/calc/data-check.ts. */
@Injectable({ providedIn: 'root' })
export class DataCheckService {
  private readonly supabase = inject(SUPABASE);

  readonly problems = signal<DataProblem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const db = this.supabase;
    const [portfolios, funds, navs, stocks, prices, grants, cards, navJob] = await Promise.all([
      db.from('portfolios').select('id, name, is_active'),
      db.from('mf_holdings').select('id, scheme_name, scheme_code, portfolio_id'),
      db.from('mf_nav_latest').select('scheme_code'),
      db.from('stock_holdings').select('id, symbol, market, portfolio_id'),
      db.from('stock_price_latest').select('symbol'),
      db.from('rsu_grants').select('id, symbol, grant_label, portfolio_id'),
      db.from('credit_cards').select('id, name, bill_day, due_day, portfolio_id, is_active'),
      db
        .from('job_runs')
        .select('message')
        .eq('job', 'fetch_nav')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    this.loading.set(false);

    const failed = [portfolios, funds, navs, stocks, prices, grants, cards, navJob].some(
      (r) => r.error,
    );
    if (failed) {
      this.error.set('Could not run the data check.');
      return;
    }
    this.problems.set(
      findDataProblems({
        portfolios: portfolios.data ?? [],
        mfHoldings: funds.data ?? [],
        navCodes: (navs.data ?? []).map((n) => n.scheme_code),
        unmatchedCodes: parseUnmatchedCodes(navJob.data?.message),
        stockHoldings: stocks.data ?? [],
        pricedSymbols: (prices.data ?? []).map((p) => p.symbol),
        rsuGrants: grants.data ?? [],
        creditCards: cards.data ?? [],
      }),
    );
  }
}
