import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { appendOutput, outputText, type OutputKind, type Segment } from '../lib/output';
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

  useEffect(() => {
    getPythonRunner();
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
        return ['err', `Stopped: ran longer than ${TIME_LIMIT_MS / 1000} seconds. Check for a loop that never ends.\n`];
      case 'stopped':
      case 'interrupted':
        return ['sys', 'Stopped.\n'];
      case 'load-failed':
        return ['err', `Python could not load. Reload the page to try again.\n(${r.message})\n`];
      case 'error':
        return null; // The traceback is already in the output.
    }
  };

  const start = useCallback(
    async (tab: Tab) => {
      const runner = getPythonRunner();
      if (runner.busy) return;
      flush();
      outputs.current[tab.id] = appendOutput([], 'sys', `▶ ${tab.title}\n`);
      setErrorLines((e) => omit(e, tab.id));

      if (tab.lang === 'sql') {
        outputs.current[tab.id] = appendOutput(outputs.current[tab.id], 'sys', 'Nothing ran: the SQL runner arrives in Phase 3.\n');
        redraw();
        return;
      }

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
      setLastRuns((l) => ({
        ...l,
        [tab.id]: {
          output: outputText(outputs.current[tab.id] ?? []),
          endedWithError: result.outcome === 'error' || result.outcome === 'timeout' || result.outcome === 'load-failed',
        },
      }));
      setRun(null);
      redraw();
    },
    [flush, write, interactive],
  );

  const stop = useCallback(() => getPythonRunner().stop(), []);
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
