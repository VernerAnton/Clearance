// The page's side of the Python worker: starts it, runs code, passes input()
// lines in, and enforces the time limit and the Stop button.
import {
  INPUT_CAPACITY,
  INPUT_HEADER_BYTES,
  INPUT_LENGTH,
  INPUT_STATE,
  type FromWorker,
  type RunStatus,
  type ToWorker,
} from './protocol';

export const TIME_LIMIT_MS = 5000;
/** How long Stop waits for Python to notice before the worker is thrown away. */
const KILL_AFTER_MS = 1000;

export type RunOutcome = RunStatus | 'timeout' | 'stopped' | 'load-failed';

export interface RunHandlers {
  onOutput: (kind: 'out' | 'err' | 'input', text: string) => void;
  /** 'waiting' means Python is in input(): the page should show a place to type. */
  onPhase: (phase: 'loading' | 'running' | 'waiting') => void;
}

export interface RunResult {
  outcome: RunOutcome;
  /** Line of the error in the learner's code, if known. */
  line: number | null;
  /** Running time, not counting time spent waiting for input. */
  ms: number;
  message?: string;
}

export class PythonRunner {
  /** True when the page is cross-origin isolated, so input() can pause Python. */
  readonly interactive = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;

  private worker!: Worker;
  private ready!: Promise<string | null>; // null when loaded, else the error message
  private inputBuffer: SharedArrayBuffer | null = null;
  private interrupt: Uint8Array | null = null;
  private current: {
    handlers: RunHandlers;
    finish: (r: RunResult) => void;
    elapsed: number;
    since: number | null; // when the clock last started; null while waiting for input
    timer?: number;
    killTimer?: number;
    reason?: 'timeout' | 'stopped';
    waiting: boolean;
    started: boolean; // Python has begun running the code (loading is over)
  } | null = null;

  constructor() {
    this.start();
  }

  /** Make a fresh worker and start loading Python in it. */
  private start() {
    this.worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' });
    if (this.interactive) {
      this.inputBuffer = new SharedArrayBuffer(INPUT_HEADER_BYTES + INPUT_CAPACITY);
      const interruptBuffer = new SharedArrayBuffer(1);
      this.interrupt = new Uint8Array(interruptBuffer);
      this.post({ type: 'init', indexURL: '/pyodide/', inputBuffer: this.inputBuffer, interruptBuffer });
    } else {
      this.post({ type: 'init', indexURL: '/pyodide/', inputBuffer: null, interruptBuffer: null });
    }
    this.ready = new Promise((resolve) => {
      const onReady = (e: MessageEvent<FromWorker>) => {
        if (e.data.type === 'ready') resolve(null);
        else if (e.data.type === 'load-failed') resolve(e.data.message);
        else return;
        this.worker.removeEventListener('message', onReady);
      };
      this.worker.addEventListener('message', onReady);
      this.worker.addEventListener('error', (e) => resolve(e.message || 'The Python worker failed to start.'));
    });
    this.worker.addEventListener('message', (e: MessageEvent<FromWorker>) => this.onMessage(e.data));
  }

  private post(msg: ToWorker) {
    this.worker.postMessage(msg);
  }

  get busy() {
    return this.current !== null;
  }

  async run(code: string, filename: string, stdinLines: string[] | null, handlers: RunHandlers): Promise<RunResult> {
    if (this.current) throw new Error('Already running');
    return new Promise<RunResult>((finish) => {
      this.current = { handlers, finish, elapsed: 0, since: null, waiting: false, started: false };
      handlers.onPhase('loading');
      void this.ready.then((failed) => {
        if (this.current?.finish !== finish) return; // Stopped while Python was still loading.
        if (failed) return this.end({ outcome: 'load-failed', line: null, ms: 0, message: failed });
        if (this.interrupt) this.interrupt[0] = 0;
        this.post({ type: 'run', code, filename, stdinLines: this.interactive ? null : stdinLines });
      });
    });
  }

  /** The learner typed a line for input(). */
  provideInput(text: string) {
    const run = this.current;
    if (!run?.waiting || !this.inputBuffer) return;
    const ctrl = new Int32Array(this.inputBuffer, 0, 2);
    const bytes = new TextEncoder().encode(text).slice(0, INPUT_CAPACITY);
    new Uint8Array(this.inputBuffer, INPUT_HEADER_BYTES).set(bytes);
    Atomics.store(ctrl, INPUT_LENGTH, bytes.length);
    Atomics.store(ctrl, INPUT_STATE, 1);
    Atomics.notify(ctrl, INPUT_STATE);
    run.waiting = false;
    run.handlers.onOutput('input', text + '\n');
    this.resumeClock();
  }

  /** Stop button. */
  stop() {
    this.halt('stopped');
  }

  private halt(reason: 'timeout' | 'stopped') {
    const run = this.current;
    if (!run || run.reason) return;
    run.reason = reason;
    this.pauseClock();
    if (!run.started) {
      // Python is still loading: drop this run but keep the worker loading.
      this.end({ outcome: reason, line: null, ms: 0 });
      return;
    }
    if (this.interrupt) {
      // Ask Python to stop (raises KeyboardInterrupt), and wake it if it's waiting for input.
      this.interrupt[0] = 2;
      if (run.waiting && this.inputBuffer) {
        const ctrl = new Int32Array(this.inputBuffer, 0, 2);
        Atomics.store(ctrl, INPUT_STATE, 2);
        Atomics.notify(ctrl, INPUT_STATE);
      }
      run.killTimer = window.setTimeout(() => this.restart(), KILL_AFTER_MS);
    } else {
      // No shared memory: the only way to stop is to throw the worker away.
      this.restart();
    }
  }

  /** Throw the worker away (Python didn't stop in time) and load a fresh one. */
  private restart() {
    const run = this.current;
    this.worker.terminate();
    this.start();
    if (run) this.end({ outcome: run.reason ?? 'stopped', line: null, ms: run.elapsed });
  }

  private onMessage(msg: FromWorker) {
    const run = this.current;
    if (!run) return;
    switch (msg.type) {
      case 'started':
        run.started = true;
        run.handlers.onPhase('running');
        this.resumeClock();
        break;
      case 'stdout':
        run.handlers.onOutput('out', msg.text);
        break;
      case 'stderr':
        run.handlers.onOutput('err', msg.text);
        break;
      case 'stdin-echo':
        run.handlers.onOutput('input', msg.text);
        break;
      case 'input-request':
        if (run.reason) {
          // Stop was pressed just before Python asked: cancel straight away.
          const ctrl = new Int32Array(this.inputBuffer!, 0, 2);
          Atomics.store(ctrl, INPUT_STATE, 2);
          Atomics.notify(ctrl, INPUT_STATE);
          break;
        }
        this.pauseClock();
        run.waiting = true;
        run.handlers.onPhase('waiting');
        break;
      case 'done': {
        this.pauseClock();
        const outcome: RunOutcome = run.reason ?? msg.status;
        this.end({ outcome, line: msg.status === 'error' ? msg.line : null, ms: run.elapsed });
        break;
      }
    }
  }

  private end(result: RunResult) {
    const run = this.current;
    if (!run) return;
    window.clearTimeout(run.timer);
    window.clearTimeout(run.killTimer);
    this.current = null;
    run.finish(result);
  }

  // The clock only runs while Python is running, not while it waits for input.
  private resumeClock() {
    const run = this.current;
    if (!run || run.reason) return;
    run.since = performance.now();
    run.handlers.onPhase('running');
    window.clearTimeout(run.timer);
    run.timer = window.setTimeout(() => this.halt('timeout'), Math.max(0, TIME_LIMIT_MS - run.elapsed));
  }

  private pauseClock() {
    const run = this.current;
    if (!run || run.since === null) return;
    run.elapsed += performance.now() - run.since;
    run.since = null;
    window.clearTimeout(run.timer);
  }
}
