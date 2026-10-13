import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { appendOutput, appendTable, outputText, type OutputKind, type Segment } from '../lib/output';
import { SqlRunner, type SqlResult } from '../sql/SqlRunner';
import type { Tab } from '../lib/tabs';
import { PythonRunner, TIME_LIMIT_MS, type RunResult } from '../python/PythonRunner';
import type { RunPhase } from '../components/Workspace';

/** What the tutor will be told about a tab's last run (Phase 4). */
export interface LastRun {
  output: string;
  endedWithError: boolean;
}

// One Python worker for the whole page, started as soon as the app loads
// so Python is (usually) ready by the time the learner presses Run.
let pythonRunner: PythonRunner | null = null;
const getPythonRunner = () => (pythonRunner ??= new PythonRunner());
let sqlRunner: SqlRunner | null = null;
const getSqlRunner = () => (sqlRunner ??= new SqlRunner());

const TIMEOUT_MESSAGE = `Stopped: ran longer than ${TIME_LIMIT_MS / 1000} seconds. Check for a loop that never ends.\n`;

/** Lines typed in the fallback Input box, one per input() call. */
function stdinLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\n$/, '').split('\n');
}

const omit = <T,>(record: Record<string, T>, key: string) => {
  if (!(key in record)) return record;
  const { [key]: _gone, ...rest } = record;
  return rest;
};

/** Runs tabs and keeps each tab's output, last run and error line. */
export function useCodeRunner() {
  // Output lives in a ref and is redrawn at most once per frame, so a program
  // that prints thousands of lines doesn't re-render the page thousands of times.
  const outputs = useRef<Record<string, Segment[]>>({});
  const pending = useRef<[string, OutputKind, string][]>([]);
  const frame = useRef<number | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  const [run, setRun] = useState<{ tabId: string; phase: RunPhase } | null>(null);
  const [lastRuns, setLastRuns] = useState<Record<string, LastRun>>({});
  const [errorLines, setErrorLines] = useState<Record<string, number>>({});
  const [stdinTexts, setStdinTexts] = useState<Record<string, string>>({});
  const stdinRef = useRef(stdinTexts);
  stdinRef.current = stdinTexts;
  const [interactive] = useState(() => typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated);

  // Which runner is busy, so Stop goes to the right one.
  const busyWith = useRef<'python' | 'sql' | null>(null);

  useEffect(() => {
    getPythonRunner();
    getSqlRunner();
  }, []);

  const flush = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    for (const [id, kind, text] of pending.current) outputs.current[id] = appendOutput(outputs.current[id] ?? [], kind, text);
    pending.current = [];
    redraw();
  }, []);

  const write = useCallback(
    (id: string, kind: OutputKind, text: string) => {
      pending.current.push([id, kind, text]);
      frame.current ??= requestAnimationFrame(flush);
    },
    [flush],
  );

  const finishMessage = (r: RunResult): [OutputKind, string] | null => {
    switch (r.outcome) {
      case 'ok':
        return ['sys', `Finished in ${Math.round(r.ms)} ms\n`];
      case 'timeout':
        return ['err', TIMEOUT_MESSAGE];
      case 'stopped':
      case 'interrupted':
        return ['sys', 'Stopped.\n'];
      case 'load-failed':
        return ['err', `Python could not load. Reload the page to try again.\n(${r.message})\n`];
      case 'error':
        return null; // The traceback is already in the output.
    }
  };

  /** After a run: remember what the tutor should see, and end the run. */
  const finishRun = (tabId: string, endedWithError: boolean) => {
    setLastRuns((l) => ({ ...l, [tabId]: { output: outputText(outputs.current[tabId] ?? []), endedWithError } }));
    busyWith.current = null;
    setRun(null);
    redraw();
  };

  const runSql = async (tab: Tab) => {
    busyWith.current = 'sql';
    setRun({ tabId: tab.id, phase: 'running' });
    redraw();
    const result: SqlResult = await getSqlRunner().run(tab.code);
    let segs = outputs.current[tab.id] ?? [];
    for (const table of result.tables) segs = appendTable(segs, table);
    switch (result.outcome) {
      case 'ok':
        if (result.tables.length === 0) {
          segs = appendOutput(segs, 'sys', 'The statements ran. Nothing was selected, so there are no rows to show.\n');
        }
        segs = appendOutput(segs, 'sys', `Finished in ${Math.round(result.ms)} ms\n`);
        break;
      case 'error': {
        const where = result.error?.line ? ` (line ${result.error.line})` : '';
        segs = appendOutput(segs, 'err', `Error${where}: ${result.error?.message}\n`);
        const line = result.error?.line;
        if (line) setErrorLines((e) => ({ ...e, [tab.id]: line }));
        break;
      }
      case 'timeout':
        segs = appendOutput(segs, 'err', TIMEOUT_MESSAGE);
        break;
      case 'stopped':
        segs = appendOutput(segs, 'sys', 'Stopped.\n');
        break;
      case 'load-failed':
        segs = appendOutput(segs, 'err', `SQL could not load. Reload the page to try again.\n(${result.error?.message})\n`);
        break;
    }
    outputs.current[tab.id] = segs;
    finishRun(tab.id, result.outcome !== 'ok' && result.outcome !== 'stopped');
  };

  const start = useCallback(
    async (tab: Tab) => {
      if (busyWith.current) return;
      flush();
      outputs.current[tab.id] = appendOutput([], 'sys', `▶ ${tab.title}\n`);
      setErrorLines((e) => omit(e, tab.id));
      if (tab.lang === 'sql') return runSql(tab);

      const runner = getPythonRunner();
      busyWith.current = 'python';
      setRun({ tabId: tab.id, phase: 'loading' });
      redraw();
      const filename = tab.title.endsWith('.py') ? tab.title : 'main.py';
      const result = await runner.run(tab.code, filename, stdinLines(stdinRef.current[tab.id] ?? ''), {
        onOutput: (kind, text) => write(tab.id, kind, text),
        onPhase: (phase) => setRun({ tabId: tab.id, phase }),
      });

      flush();
      const message = finishMessage(result);
      if (message) outputs.current[tab.id] = appendOutput(outputs.current[tab.id] ?? [], ...message);
      if (!interactive && result.outcome === 'error' && /EOFError: EOF when reading a line\n$/.test(outputText(outputs.current[tab.id] ?? []))) {
        outputs.current[tab.id] = appendOutput(outputs.current[tab.id], 'sys', 'input() asked for more lines than the Input box has.\n');
      }
      const line = result.line;
      if (line !== null) setErrorLines((e) => ({ ...e, [tab.id]: line }));
      finishRun(tab.id, result.outcome === 'error' || result.outcome === 'timeout' || result.outcome === 'load-failed');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flush, write, interactive],
  );

  const stop = useCallback(() => (busyWith.current === 'sql' ? getSqlRunner().stop() : getPythonRunner().stop()), []);
  const provideInput = useCallback((text: string) => getPythonRunner().provideInput(text), []);

  const clearOutput = useCallback((tabId: string) => {
    delete outputs.current[tabId];
    redraw();
  }, []);

  const clearErrorLine = useCallback((tabId: string) => setErrorLines((e) => omit(e, tabId)), []);

  /** A tab was closed: forget everything about it. */
  const forgetTab = useCallback((tabId: string) => {
    delete outputs.current[tabId];
    setLastRuns((l) => omit(l, tabId));
    setErrorLines((e) => omit(e, tabId));
    setStdinTexts((s) => omit(s, tabId));
  }, []);

  const setStdinText = useCallback((tabId: string, text: string) => setStdinTexts((s) => ({ ...s, [tabId]: text })), []);

  return {
    outputs: outputs.current,
    run,
    lastRuns,
    errorLines,
    stdinTexts,
    interactive,
    start,
    stop,
    provideInput,
    clearOutput,
    clearErrorLine,
    forgetTab,
    setStdinText,
  };
}
