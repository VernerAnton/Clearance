// Messages between the page and the SQL worker.

export interface SqlTable {
  columns: string[];
  /** Up to MAX_ROWS rows, as display text (null stays null so it can show as NULL). */
  rows: (string | null)[][];
  /** How many rows the query really returned. */
  rowCount: number;
}

export const MAX_ROWS = 500;

export type ToSqlWorker = { type: 'run'; code: string };

export type FromSqlWorker =
  | { type: 'ready' }
  | { type: 'load-failed'; message: string }
  | {
      type: 'done';
      tables: SqlTable[];
      /** How many statements ran without an error. */
      statements: number;
      error: { message: string; line: number | null } | null;
    };
