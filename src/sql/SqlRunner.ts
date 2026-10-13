// The page's side of the SQL worker: runs a tab's SQL with a time limit and Stop.
import type { FromSqlWorker, SqlTable } from './protocol';
import { TIME_LIMIT_MS } from '../python/PythonRunner';

export type SqlOutcome = 'ok' | 'error' | 'timeout' | 'stopped' | 'load-failed';

export interface SqlResult {
  outcome: SqlOutcome;
  tables: SqlTable[];
  statements: number;
  error: { message: string; line: number | null } | null;
  ms: number;
}

export class SqlRunner {
  private worker!: Worker;
  private ready!: Promise<string | null>; // null when loaded, else the error message
  private current: { finish: (r: SqlResult) => void; timer?: number; started: number } | null = null;

  constructor() {
    this.start();
  }

  private start() {
    this.worker = new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise((resolve) => {
      const onReady = (e: MessageEvent<FromSqlWorker>) => {
        if (e.data.type === 'ready') resolve(null);
        else if (e.data.type === 'load-failed') resolve(e.data.message);
        else return;
        this.worker.removeEventListener('message', onReady);
      };
      this.worker.addEventListener('message', onReady);
      this.worker.addEventListener('error', (e) => resolve(e.message || 'The SQL worker failed to start.'));
    });
    this.worker.addEventListener('message', (e: MessageEvent<FromSqlWorker>) => {
      if (e.data.type !== 'done') return;
      const { tables, statements, error } = e.data;
      this.end({ outcome: error ? 'error' : 'ok', tables, statements, error, ms: performance.now() - (this.current?.started ?? 0) });
    });
  }

  get busy() {
    return this.current !== null;
  }

  run(code: string): Promise<SqlResult> {
    if (this.current) throw new Error('Already running');
    return new Promise((finish) => {
      const run: { finish: (r: SqlResult) => void; timer?: number; started: number } = { finish, started: performance.now() };
      this.current = run;
      void this.ready.then((failed) => {
        if (this.current !== run) return; // Stopped while loading.
        if (failed) return this.end({ outcome: 'load-failed', tables: [], statements: 0, error: { message: failed, line: null }, ms: 0 });
        run.started = performance.now();
        run.timer = window.setTimeout(() => this.halt('timeout'), TIME_LIMIT_MS);
        this.worker.postMessage({ type: 'run', code });
      });
    });
  }

  stop() {
    this.halt('stopped');
  }

  /** SQLite can't be interrupted from outside, so stopping means a fresh worker. */
  private halt(outcome: 'timeout' | 'stopped') {
    const run = this.current;
    if (!run) return;
    this.worker.terminate();
    this.start();
    this.end({ outcome, tables: [], statements: 0, error: null, ms: performance.now() - run.started });
  }

  private end(result: SqlResult) {
    const run = this.current;
    if (!run) return;
    window.clearTimeout(run.timer);
    this.current = null;
    run.finish(result);
  }
}
