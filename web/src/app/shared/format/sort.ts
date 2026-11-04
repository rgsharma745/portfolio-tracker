export interface Sort {
  key: string;
  /** 1 ascending, -1 descending. */
  order: 1 | -1;
}

/**
 * Sorts rows by one field: numbers numerically, text alphabetically (case-insensitive),
 * empty values last in either direction. Returns a new array.
 */
export function sortRows<T extends object>(rows: readonly T[], sort: Sort | null): T[] {
  if (!sort) return [...rows];
  const valueOf = (row: T) => (row as Record<string, unknown>)[sort.key];
  return [...rows].sort((a, b) => {
    const x = valueOf(a);
    const y = valueOf(b);
    const xEmpty = x === null || x === undefined || x === '';
    const yEmpty = y === null || y === undefined || y === '';
    if (xEmpty || yEmpty) return xEmpty === yEmpty ? 0 : xEmpty ? 1 : -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.order;
    return String(x).localeCompare(String(y), 'en-IN', { sensitivity: 'base' }) * sort.order;
  });
}

/** Case-insensitive match of `query` against any of the given texts. */
export function matchesSearch(query: string, ...texts: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || texts.some((t) => t?.toLowerCase().includes(q));
}

export type PlFilter = 'all' | 'gainers' | 'losers';

/** Gainers: P&L above zero; losers: below zero. Rows without a P&L only show under All. */
export function filterByPl<T extends { pl: number | null }>(
  rows: readonly T[],
  filter: PlFilter,
): T[] {
  if (filter === 'all') return [...rows];
  return rows.filter((r) => r.pl !== null && (filter === 'gainers' ? r.pl > 0 : r.pl < 0));
}
