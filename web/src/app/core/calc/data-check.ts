import { quoteKey } from './stocks';

/**
 * Data check: holdings the daily jobs cannot value, and cards whose due dates cannot be
 * computed. Only active portfolios are checked, since only they count in totals.
 */

export type DataProblemKind =
  | 'mf_no_code'
  | 'mf_code_not_found'
  | 'mf_no_nav'
  | 'nps_no_code'
  | 'nps_code_not_found'
  | 'nps_no_nav'
  | 'stock_no_price'
  | 'equity_no_price'
  | 'card_missing_days';

export interface DataProblem {
  kind: DataProblemKind;
  id: string;
  label: string;
  portfolio: string;
  detail: string;
}

export interface DataCheckInput {
  portfolios: readonly { id: string; name: string; is_active: boolean }[];
  mfHoldings: readonly {
    id: string;
    scheme_name: string;
    scheme_code: string | null;
    portfolio_id: string;
  }[];
  /** Scheme codes that have a row in mf_nav_latest. */
  navCodes: readonly string[];
  /** Scheme codes the last NAV job could not find in the AMFI file. */
  unmatchedCodes: readonly string[];
  npsHoldings: readonly {
    id: string;
    account: string;
    scheme_name: string;
    scheme_code: string | null;
    units: number;
    portfolio_id: string;
  }[];
  /** Scheme codes that have a row in nps_nav_latest. */
  npsNavCodes: readonly string[];
  /** Scheme codes the last NPS NAV job could not find. */
  npsUnmatchedCodes: readonly string[];
  stockHoldings: readonly { id: string; symbol: string; market: string; portfolio_id: string }[];
  /** Market-qualified stock quote keys. */
  pricedSymbols: readonly string[];
  equityLots: readonly {
    id: string;
    portfolio_id: string;
    label: string;
    current_price: number | null;
  }[];
  creditCards: readonly {
    id: string;
    name: string;
    bill_day: number | null;
    due_day: number | null;
    portfolio_id: string;
    is_active: boolean;
  }[];
}

export function findDataProblems(input: DataCheckInput): DataProblem[] {
  const portfolioName = new Map(
    input.portfolios.filter((p) => p.is_active).map((p) => [p.id, p.name]),
  );
  const inActive = <T extends { portfolio_id: string }>(rows: readonly T[]) =>
    rows.filter((row) => portfolioName.has(row.portfolio_id));
  const nameOf = (portfolioId: string) => portfolioName.get(portfolioId) ?? '';

  const navCodes = new Set(input.navCodes);
  const unmatched = new Set(input.unmatchedCodes);
  const priced = new Set(input.pricedSymbols);
  const problems: DataProblem[] = [];

  /** No code, a code the job could not find, or a code with no NAV yet (in that order). */
  const checkCode = (
    kinds: readonly [DataProblemKind, DataProblemKind, DataProblemKind],
    base: Omit<DataProblem, 'kind' | 'detail'>,
    rawCode: string | null,
    notFound: ReadonlySet<string>,
    withNav: ReadonlySet<string>,
  ) => {
    const code = rawCode?.trim() ?? '';
    if (!code) problems.push({ ...base, kind: kinds[0], detail: 'No scheme code' });
    else if (notFound.has(code)) problems.push({ ...base, kind: kinds[1], detail: `Code ${code}` });
    else if (!withNav.has(code)) problems.push({ ...base, kind: kinds[2], detail: `Code ${code}` });
  };

  for (const fund of inActive(input.mfHoldings)) {
    checkCode(
      ['mf_no_code', 'mf_code_not_found', 'mf_no_nav'],
      { id: fund.id, label: fund.scheme_name, portfolio: nameOf(fund.portfolio_id) },
      fund.scheme_code,
      unmatched,
      navCodes,
    );
  }

  const npsNavCodes = new Set(input.npsNavCodes);
  const npsUnmatched = new Set(input.npsUnmatchedCodes);
  // A scheme with no units left needs no NAV.
  for (const h of inActive(input.npsHoldings).filter((x) => x.units > 0)) {
    checkCode(
      ['nps_no_code', 'nps_code_not_found', 'nps_no_nav'],
      { id: h.id, label: `${h.account} · ${h.scheme_name}`, portfolio: nameOf(h.portfolio_id) },
      h.scheme_code,
      npsUnmatched,
      npsNavCodes,
    );
  }

  for (const stock of inActive(input.stockHoldings)) {
    if (!priced.has(quoteKey(stock.market, stock.symbol))) {
      problems.push({
        kind: 'stock_no_price',
        id: stock.id,
        label: stock.symbol,
        portfolio: nameOf(stock.portfolio_id),
        detail: stock.market === 'US' ? 'US' : 'India',
      });
    }
  }

  for (const lot of inActive(input.equityLots)) {
    problems.push({
      kind: 'equity_no_price',
      id: lot.id,
      label: lot.label,
      portfolio: nameOf(lot.portfolio_id),
      detail: lot.current_price === null ? 'Missing share price' : 'Missing USD/INR rate',
    });
  }

  for (const card of inActive(input.creditCards.filter((c) => c.is_active))) {
    const missing = [card.bill_day ? '' : 'bill day', card.due_day ? '' : 'due day'].filter(
      Boolean,
    );
    if (missing.length) {
      problems.push({
        kind: 'card_missing_days',
        id: card.id,
        label: card.name,
        portfolio: nameOf(card.portfolio_id),
        detail: `No ${missing.join(' or ')}`,
      });
    }
  }

  return problems;
}

/**
 * Reads unmatched scheme codes from the NAV job's `job_runs.message`, which is JSON:
 * `{"unmatched": ["123456", ...], ...}`. Anything else yields no codes.
 */
export function parseUnmatchedCodes(message: string | null | undefined): string[] {
  if (!message) return [];
  try {
    const parsed: unknown = JSON.parse(message);
    if (parsed && typeof parsed === 'object' && 'unmatched' in parsed) {
      const codes = (parsed as { unmatched: unknown }).unmatched;
      return Array.isArray(codes) ? codes.filter((c): c is string => typeof c === 'string') : [];
    }
  } catch {
    // Plain-text message (e.g. an error): no unmatched codes to report.
  }
  return [];
}
