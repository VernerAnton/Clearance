/// <reference lib="webworker" />
// Runs SQL (sql.js, SQLite compiled to WebAssembly) off the main thread,
// so a query that never ends can't freeze the page.
import initSqlJs, { type SqlJsStatic, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { lineAt } from '../lib/sqlText';
import { MAX_ROWS, type FromSqlWorker, type SqlTable, type ToSqlWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const post = (msg: FromSqlWorker) => self.postMessage(msg);

// The .wasm file is part of this site's build (Vite copies it), not loaded from a CDN.
const ready: Promise<SqlJsStatic> = initSqlJs({ locateFile: () => wasmUrl });
ready.then(
  () => post({ type: 'ready' }),
  (err) => post({ type: 'load-failed', message: String(err) }),
);

function show(value: SqlValue): string | null {
  if (value === null) return null;
  if (value instanceof Uint8Array) return `<blob, ${value.length} bytes>`;
  return String(value);
}

async function run(code: string) {
  const SQL = await ready;
  // A fresh, empty database every run, so a tab's CREATE/INSERT statements
  // always run together with its queries.
  const db = new SQL.Database();
  const tables: SqlTable[] = [];
  let statements = 0;
  let error: { message: string; line: number | null } | null = null;
  const iterator = db.iterateStatements(code);
  let remaining = code;
  try {
    for (;;) {
      remaining = iterator.getRemainingSQL();
      const next = iterator.next();
      if (next.done) break;
      const stmt = next.value;
      const columns = stmt.getColumnNames();
      const rows: (string | null)[][] = [];
      let rowCount = 0;
      while (stmt.step()) {
        if (rowCount < MAX_ROWS) rows.push(stmt.get().map(show));
        rowCount++;
      }
      stmt.free();
      statements++;
      if (columns.length > 0) tables.push({ columns, rows, rowCount });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error = { message, line: lineAt(code, code.length - remaining.length) };
  } finally {
    db.close();
  }
  post({ type: 'done', tables, statements, error });
}

self.onmessage = (e: MessageEvent<ToSqlWorker>) => {
  if (e.data.type === 'run') void run(e.data.code);
};
