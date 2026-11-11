import { Injectable, inject } from '@angular/core';
import { SUPABASE } from './supabase.client';

/** Every table that holds the owner's own data (market data is shared and re-fetchable). */
export const EXPORT_TABLES = [
  'portfolios',
  'mf_holdings',
  'stock_holdings',
  'rsu_grants',
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
    const results = await Promise.all(
      EXPORT_TABLES.map((table) => this.supabase.from(table).select('*')),
    );
    if (results.some((r) => r.error)) return null;
    const tables = Object.fromEntries(
      EXPORT_TABLES.map((table, i) => [table, results[i].data ?? []]),
    ) as DataExport['tables'];
    return { exported_at: now.toISOString(), tables };
  }
}
