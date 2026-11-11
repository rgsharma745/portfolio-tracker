/**
 * Known values matching what was typed, ignoring case and surrounding spaces: those starting
 * with it first, then the rest containing it. An empty query returns every value.
 */
export function matchSuggestions(values: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...values];
  const lower = values.map((v) => v.toLowerCase());
  const starts = values.filter((_, i) => lower[i].startsWith(q));
  const contains = values.filter((_, i) => !lower[i].startsWith(q) && lower[i].includes(q));
  return [...starts, ...contains];
}
