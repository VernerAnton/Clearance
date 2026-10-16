import { useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react';
import { LIMITS } from '../lib/layout';
import type { Segment } from '../lib/output';
import type { SqlTable } from '../sql/protocol';
import type { Lang, Tab } from '../lib/tabs';
import { CodeEditor, type EditorHelpers } from './CodeEditor';
import { Splitter } from './Splitter';
import { paneAttrs, type PaneProps } from './pane';
import { LIMITS as API_LIMITS } from '../../shared/api';

export type RunPhase = 'loading' | 'running' | 'waiting';

interface Props {
  tabs: Tab[];
  activeId: string;
  output: Segment[];
  errorLine: number | null;
  /** The run in progress (in any tab), or null. */
  run: { tabId: string; phase: RunPhase } | null;
  /** False when the page isn't cross-origin isolated: input() lines are typed before Run. */
  interactiveInput: boolean;
  stdinText: string;
  onStdinText: (text: string) => void;
  helpers: EditorHelpers;
  focusTick: number;
  outputHeight: number;
  onOutputHeight: (height: number) => void;
  onOutputReset: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (lang: Lang) => void;
  onCode: (code: string) => void;
  /** The Task box changed. */
  onTask: (task: string) => void;
  /** Set in the side-panel layout. */
  pane?: PaneProps;
  onRun: () => void;
  onStop: () => void;
  onInput: (text: string) => void;
  onClearOutput: () => void;
}

const PHASE_TEXT: Record<RunPhase, string> = {
  loading: 'Loading…',
  running: 'Running…',
  waiting: 'Waiting for your input…',
};

/** One SQL result, with the row count under it. */
function ResultTable({ table }: { table: SqlTable }) {
  const { columns, rows, rowCount } = table;
  return (
    <div className="result">
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((v, c) => (
                  <td key={c}>{v === null ? <span className="sys">NULL</span> : v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sys">
        {rowCount} row{rowCount === 1 ? '' : 's'}
        {rowCount > rows.length && ` (showing the first ${rows.length})`}
      </div>
    </div>
  );
}

/** The box that appears in the output where input() is waiting. */
function InlineInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('');
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(value);
    }
  };
  return (
    <input
      className="stdin"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      aria-label="Type your input and press Enter"
      spellCheck={false}
      autoComplete="off"
    />
  );
}

/** The exercise text for this tab. Sent to the tutor with every message; folds to one line. */
function TaskBox({ task, onTask }: { task: string; onTask: (task: string) => void }) {
  const [open, setOpen] = useState(false);
  const firstLine = task.trim().split('\n')[0];
  return (
    <div className={`taskbox${open ? ' open' : ''}`}>
      <button type="button" className="task-toggle" aria-expanded={open} aria-controls="task-text" onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">📝</span>
        <span className="task-label">Task</span>
        <span className={`task-summary${firstLine ? '' : ' empty'}`}>
          {firstLine || 'Paste the exercise instructions (optional)'}
        </span>
        <span className="task-caret" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <textarea
          id="task-text"
          aria-label="Exercise instructions"
          value={task}
          maxLength={API_LIMITS.task}
          onChange={(e) => onTask(e.target.value)}
          placeholder="Paste the exercise's instructions from your course. The tutor reads them with every message, so it knows what your code is supposed to do."
        />
      )}
    </div>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Workspace(props: Props) {
  const { tabs, activeId, output, errorLine, run, helpers, focusTick, onSelect, onClose, onNew, onCode, onTask, pane } = props;
  const { onRun, onStop, onInput, onClearOutput, interactiveInput, stdinText, onStdinText } = props;
  const { outputHeight, onOutputHeight, onOutputReset } = props;
  const waitingHere = run?.tabId === activeId && run.phase === 'waiting';
  const active = tabs.find((t) => t.id === activeId)!;
  const outRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  // Copies the whole tab, e.g. to paste into a course site.
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.alert("Couldn't copy: the browser blocked the clipboard. Select the code and press Ctrl+C instead.");
    }
  };

  const tabsRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // The output can grow until the editor is down to its minimum height.
  const outputBounds = () => {
    const editor = editorRef.current?.offsetHeight ?? 0;
    return {
      min: LIMITS.outputHeight.min,
      max: Math.min(LIMITS.outputHeight.max, outputHeight + editor - LIMITS.minEditorHeight),
    };
  };

  // Without a scroll bar, let the mouse wheel scroll the tab row sideways.
  const onTabsWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
  };

  // Keep the active tab visible when the tab row is wider than the screen.
  useEffect(() => {
    // Only the tab row scrolls sideways; the page itself stays put.
    const row = tabsRef.current;
    const tab = row?.querySelector<HTMLElement>('[data-active="true"]');
    if (!row || !tab) return;
    const left = tab.offsetLeft;
    if (left < row.scrollLeft) row.scrollLeft = left;
    else if (left + tab.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left + tab.offsetWidth - row.clientWidth;
  }, [activeId]);

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
  }, [output, waitingHere]);

  return (
    <section className="work" aria-label="Code workspace" {...paneAttrs(pane)}>
      <div className="tabs">
        <div className="tablist" ref={tabsRef} onWheel={onTabsWheel} role="tablist" aria-label="Open files">
          {tabs.map((t) => (
            <div key={t.id} className="tab" data-active={t.id === activeId}>
              <button
                type="button"
                role="tab"
                className="sel"
                aria-selected={t.id === activeId}
                onClick={() => onSelect(t.id)}
                title={t.fromMission ? 'Mission from the tutor' : 'Your tab'}
              >
                {t.fromMission && (
                  <>
                    <span className="mission-mark" aria-hidden="true">
                      🎯
                    </span>
                    <span className="sr">Mission: </span>
                  </>
                )}
                {t.title}
                <span className="badge">{t.lang === 'sql' ? 'SQL' : 'PY'}</span>
              </button>
              <button
                type="button"
                className="x"
                onClick={() => onClose(t.id)}
                disabled={tabs.length === 1 || run?.tabId === t.id}
                aria-label={`Close ${t.title}`}
                title={
                  tabs.length === 1
                    ? 'The last tab stays open'
                    : run?.tabId === t.id
                      ? 'Stop the program before closing this tab'
                      : `Close ${t.title}`
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="newtab">
          <button type="button" className="btn small" onClick={() => onNew('python')}>
            + Python
          </button>
          <button type="button" className="btn small" onClick={() => onNew('sql')}>
            + SQL
          </button>
        </div>
      </div>

      <TaskBox key={active.id} task={active.task} onTask={onTask} />

      <div className="editor" ref={editorRef} role="tabpanel" aria-label={active.title}>
        <CodeEditor
          tabId={active.id}
          lang={active.lang}
          code={active.code}
          helpers={helpers}
          errorLine={errorLine}
          focusTick={focusTick}
          onChange={onCode}
          onRun={onRun}
        />
        {active.fromMission && <span className="owner">Mission from the tutor</span>}
      </div>

      <div className="console" style={{ height: outputHeight }}>
        <Splitter
          axis="y"
          label="Resize output"
          value={outputHeight}
          grow={-1}
          bounds={outputBounds}
          onChange={onOutputHeight}
          onReset={onOutputReset}
        />
        <div className="runbar">
          {run ? (
            <button type="button" className="stop" onClick={onStop}>
              ■ Stop
            </button>
          ) : (
            <button type="button" className="run" onClick={onRun}>
              ▶ Run
            </button>
          )}
          <span className="runstate" aria-live="polite">
            {run ? (
              <>
                {PHASE_TEXT[run.phase]}
                {run.tabId !== activeId && ` (in “${tabs.find((t) => t.id === run.tabId)?.title}”)`}
              </>
            ) : (
              <>
                <span className="keyhint">
                  <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> + <kbd>Enter</kbd> runs the tab
                </span>
                <span className="tabhint"> · Esc then Tab leaves the editor</span>
              </>
            )}
          </span>
          <button type="button" className="copy" onClick={copyCode} disabled={!active.code}>
            {copied ? 'Copied ✓' : 'Copy code'}
          </button>
          <button type="button" className="clearout" onClick={onClearOutput} disabled={run?.tabId === activeId}>
            Clear output
          </button>
        </div>

        {!interactiveInput && active.lang === 'python' && (
          <div className="stdin-box">
            <label htmlFor="stdin-lines">
              Input for <code>input()</code>, one line per call
            </label>
            <textarea
              id="stdin-lines"
              rows={2}
              value={stdinText}
              onChange={(e) => onStdinText(e.target.value)}
              spellCheck={false}
            />
            <p className="notice">
              Typing straight into the output needs a cross-origin isolated page, and this one isn’t. Fill this in before
              you press Run.
            </p>
          </div>
        )}

        <div className="output" ref={outRef} aria-label="Output">
          {output.length === 0 && !waitingHere ? (
            <div className="sys">
              {active.lang === 'sql' ? 'Results appear here as a table.' : 'Output from print() and input() appears here.'}
            </div>
          ) : (
            <div className="output-text">
              {output.map((seg, i) =>
                seg.kind === 'table' ? (
                  <ResultTable key={i} table={seg.table} />
                ) : (
                  <span key={i} className={seg.kind}>
                    {seg.text}
                  </span>
                ),
              )}
              {waitingHere && <InlineInput onSubmit={onInput} />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
