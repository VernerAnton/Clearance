// Messages between the page and the Python worker.

export type RunStatus = 'ok' | 'error' | 'interrupted';

export type ToWorker =
  | {
      type: 'init';
      indexURL: string;
      /** Shared memory for input() (only when the page is cross-origin isolated). */
      inputBuffer: SharedArrayBuffer | null;
      /** Writing 2 here raises KeyboardInterrupt inside Python (Stop / time limit). */
      interruptBuffer: SharedArrayBuffer | null;
    }
  | {
      type: 'run';
      code: string;
      filename: string;
      /** Fallback for pages that aren't isolated: input() lines typed before Run. */
      stdinLines: string[] | null;
    };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'load-failed'; message: string }
  | { type: 'started' }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  /** Python called input() and is now waiting for a line. */
  | { type: 'input-request' }
  /** Fallback mode: a pre-typed input line was used, show it in the output. */
  | { type: 'stdin-echo'; text: string }
  | { type: 'done'; status: RunStatus; line: number | null };

// Layout of the shared input buffer: two Int32 slots, then the text bytes.
export const INPUT_STATE = 0; // 0 = waiting, 1 = text is ready, 2 = cancelled
export const INPUT_LENGTH = 1;
export const INPUT_HEADER_BYTES = 8;
export const INPUT_CAPACITY = 64 * 1024;
