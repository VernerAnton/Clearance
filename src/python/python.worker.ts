/// <reference lib="webworker" />
// Runs Python (Pyodide) off the main thread, so a long loop can't freeze the page.
import type { PyodideAPI } from 'pyodide';
import runnerSource from './runner.py?raw';
import {
  INPUT_HEADER_BYTES,
  INPUT_LENGTH,
  INPUT_STATE,
  type FromWorker,
  type RunStatus,
  type ToWorker,
} from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let pyodide: PyodideAPI | null = null;
let inputCtrl: Int32Array | null = null;
let inputBytes: Uint8Array | null = null;
let pendingLines: string[] = [];

const post = (msg: FromWorker) => self.postMessage(msg);

// Output is sent in chunks: a program printing in a tight loop would otherwise
// send thousands of messages a second and swamp the page. Text goes out at once
// after a quiet moment, and at most every FLUSH_MS during a burst.
const FLUSH_MS = 30;
let buffered: { type: 'stdout' | 'stderr'; text: string } | null = null;
let lastFlush = 0;

function flushOutput() {
  if (buffered) post(buffered);
  buffered = null;
  lastFlush = performance.now();
}

function writeOutput(type: 'stdout' | 'stderr', text: string) {
  if (buffered && buffered.type !== type) flushOutput();
  if (buffered) buffered.text += text;
  else buffered = { type, text };
  if (performance.now() - lastFlush >= FLUSH_MS || buffered.text.length > 64 * 1024) flushOutput();
}
const decoder = new TextDecoder();

/** Called by Python whenever input() needs a line. Returns null for "no more input". */
function readLine(): string | null {
  if (inputCtrl && inputBytes) {
    // Interactive: ask the page, then sleep until it writes the line into shared memory.
    Atomics.store(inputCtrl, INPUT_STATE, 0);
    flushOutput(); // The prompt must be on screen before we wait.
    post({ type: 'input-request' });
    Atomics.wait(inputCtrl, INPUT_STATE, 0);
    if (Atomics.load(inputCtrl, INPUT_STATE) !== 1) return null; // Stopped while waiting.
    const length = Atomics.load(inputCtrl, INPUT_LENGTH);
    return decoder.decode(inputBytes.slice(0, length));
  }
  // Fallback: hand out the lines typed into the Input box before Run.
  const line = pendingLines.shift();
  if (line === undefined) return null;
  flushOutput();
  post({ type: 'stdin-echo', text: line + '\n' });
  return line;
}

async function init(msg: Extract<ToWorker, { type: 'init' }>) {
  try {
    // Loaded from this site (public/pyodide/), not bundled and not from a CDN.
    const url = `${msg.indexURL}pyodide.mjs`;
    const { loadPyodide } = (await import(/* @vite-ignore */ url)) as typeof import('pyodide');
    pyodide = await loadPyodide({ indexURL: msg.indexURL });
    if (msg.inputBuffer) {
      inputCtrl = new Int32Array(msg.inputBuffer, 0, 2);
      inputBytes = new Uint8Array(msg.inputBuffer, INPUT_HEADER_BYTES);
    }
    if (msg.interruptBuffer) pyodide.setInterruptBuffer(new Uint8Array(msg.interruptBuffer));
    // Raw bytes, decoded here. "isatty" makes Python flush at every line end,
    // so output appears as it happens. input() flushes its prompt before waiting.
    const outDecoder = new TextDecoder();
    const errDecoder = new TextDecoder();
    pyodide.setStdout({
      isatty: true,
      write: (bytes) => (writeOutput('stdout', outDecoder.decode(bytes, { stream: true })), bytes.length),
    });
    pyodide.setStderr({
      isatty: true,
      write: (bytes) => (writeOutput('stderr', errDecoder.decode(bytes, { stream: true })), bytes.length),
    });
    // autoEOF: each answer counts as complete, so Python doesn't ask again for more.
    pyodide.setStdin({ stdin: readLine, autoEOF: true });
    pyodide.FS.writeFile('/home/pyodide/_clearance_runner.py', runnerSource);
    pyodide.runPython('import sys; sys.path.insert(0, "/home/pyodide"); import _clearance_runner');
    post({ type: 'ready' });
  } catch (err) {
    post({ type: 'load-failed', message: String(err) });
  }
}

function run(msg: Extract<ToWorker, { type: 'run' }>) {
  if (!pyodide) return;
  pendingLines = msg.stdinLines ? [...msg.stdinLines] : [];
  const runner = pyodide.pyimport('_clearance_runner');
  post({ type: 'started' });
  let status: RunStatus = 'error';
  let line: number | null = null;
  try {
    const result = runner.run(msg.code, msg.filename);
    const [s, l] = result.toJs();
    result.destroy();
    status = s;
    line = l ?? null;
  } catch (err) {
    // Only reached if something goes wrong outside the learner's code.
    writeOutput('stderr', `${err}\n`);
  } finally {
    runner.destroy();
    flushOutput();
  }
  post({ type: 'done', status, line });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  if (e.data.type === 'init') void init(e.data);
  else if (e.data.type === 'run') run(e.data);
};
