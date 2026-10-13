// Small helpers for SQL results: finding the failing line, and tables as plain text.
import type { SqlTable } from '../sql/protocol';

/** Line number (1-based) of the first non-blank character at or after `offset`. */
export function lineAt(code: string, offset: number): number {
  let i = Math.max(0, Math.min(offset, code.length));
  while (i < code.length && /\s/.test(code[i])) i++;
  return code.slice(0, i).split('\n').length;
}

/** How many rows of each table the tutor sees. */
export const TEXT_ROWS = 20;

/** A result table as plain text ("a | b" lines), the way the tutor receives it. */
export function tableText(table: SqlTable, maxRows = TEXT_ROWS): string {
  const lines = [table.columns.join(' | ')];
  for (const row of table.rows.slice(0, maxRows)) lines.push(row.map((v) => v ?? 'NULL').join(' | '));
  if (table.rowCount > maxRows) lines.push(`… ${table.rowCount - maxRows} more rows`);
  lines.push(`(${table.rowCount} row${table.rowCount === 1 ? '' : 's'})`);
  return lines.join('\n') + '\n';
}
