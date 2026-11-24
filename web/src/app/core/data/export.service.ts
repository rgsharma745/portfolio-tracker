import { Injectable, inject } from '@angular/core';
import { SUPABASE } from './supabase.client';

const EQUITY_TABLES = [
  'equity_securities',
  'equity_grants',
  'equity_schedule',
  'equity_events',
  'equity_sales',
  'equity_sale_lots',
] as const;

/** Every table that holds the owner's own data (market data is shared and re-fetchable). */
export const EXPORT_TABLES = [
  'portfolios',
  'mf_holdings',
  'mf_transactions',
  'stock_holdings',
  ...EQUITY_TABLES,
  'savings_accounts',
  'pf_entries',
  'ppf_entries',
  'nps_holdings',
  'nps_contributions',
  'fixed_deposits',
  'dividends',
  'credit_cards',
  'card_bills',
  'portfolio_snapshots',
  'settings',
] as const;

export interface DataExport {
  exported_at: string;
  tables: Record<(typeof EXPORT_TABLES)[number], unknown[]>;
}

/** Builds a JSON copy of all the owner's data for download (Settings › Export). */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly supabase = inject(SUPABASE);

  /** Returns the export, or null if any table could not be read. */
  async exportAll(now = new Date()): Promise<DataExport | null> {
    const relations = EXPORT_TABLES.filter(
      (table) => !EQUITY_TABLES.some((name) => name === table),
    );
    const [equity, ...results] = await Promise.all([
      this.supabase.rpc('export_equity_ledger'),
      ...relations.map((table) => this.supabase.from(table).select('*')),
    ]);
    if (equity.error || !equity.data || results.some((r) => r.error)) return null;
    const tables = {
      ...Object.fromEntries(relations.map((table, i) => [table, results[i].data ?? []])),
      ...(equity.data as Pick<DataExport['tables'], (typeof EQUITY_TABLES)[number]>),
    } as DataExport['tables'];
    return { exported_at: now.toISOString(), tables };
  }
}
