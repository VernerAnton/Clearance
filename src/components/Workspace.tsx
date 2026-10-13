import { useEffect, useRef, type WheelEvent } from 'react';
import { LIMITS } from '../lib/layout';
import type { Lang, Tab } from '../lib/tabs';
import { CodeEditor, type EditorHelpers } from './CodeEditor';
import { Splitter } from './Splitter';

export interface OutputLine {
  kind: 'out' | 'err' | 'sys';
  text: string;
}

interface Props {
  tabs: Tab[];
  activeId: string;
  output: OutputLine[];
  helpers: EditorHelpers;
  focusTick: number;
  outputHeight: number;
  onOutputHeight: (height: number) => void;
  onOutputReset: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (lang: Lang) => void;
  onCode: (code: string) => void;
  onRun: () => void;
  onClearOutput: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Workspace(props: Props) {
  const { tabs, activeId, output, helpers, focusTick, onSelect, onClose, onNew, onCode, onRun, onClearOutput } = props;
  const { outputHeight, onOutputHeight, onOutputReset } = props;
  const active = tabs.find((t) => t.id === activeId)!;
  const outRef = useRef<HTMLDivElement>(null);

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
  }, [output]);

  return (
    <section className="work" aria-label="Code workspace">
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
                disabled={tabs.length === 1}
                aria-label={`Close ${t.title}`}
                title={tabs.length === 1 ? 'The last tab stays open' : `Close ${t.title}`}
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

      <div className="editor" ref={editorRef} role="tabpanel" aria-label={active.title}>
        <CodeEditor
          tabId={active.id}
          lang={active.lang}
          code={active.code}
          helpers={helpers}
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
          <button type="button" className="run" onClick={onRun}>
            ▶ Run
          </button>
          <span className="runstate">
            <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> + <kbd>Enter</kbd> runs the tab
            <span className="tabhint"> · Esc then Tab leaves the editor</span>
          </span>
          <button type="button" className="clearout" onClick={onClearOutput}>
            Clear output
          </button>
        </div>

        <div className="output" ref={outRef} aria-live="polite" aria-label="Output">
          {output.length === 0 ? (
            <div className="line sys">
              {active.lang === 'sql' ? 'Results appear here as a table.' : 'Output from print() and input() appears here.'}
            </div>
          ) : (
            output.map((l, i) => (
              <div key={i} className={`line ${l.kind}`}>
                {l.text}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
