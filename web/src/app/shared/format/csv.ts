export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Builds RFC 4180 CSV (CRLF line endings). Numbers are written raw (no grouping or
 * rounding) so spreadsheets can sum them. Cells that a spreadsheet would run as a
 * formula are prefixed with an apostrophe.
 */
export function toCsv<T>(columns: readonly CsvColumn<T>[], rows: readonly T[]): string {
  const lines = [
    columns.map((c) => escape(c.header)),
    ...rows.map((row) => columns.map((c) => escape(c.value(row)))),
  ];
  return lines.map((cells) => cells.join(',')).join('\r\n') + '\r\n';
}

function escape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
