import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { levelInfo, modeById, type Level, type ModeId } from '../shared/clearance';
import { DEFAULT_LAYOUT, LIMITS, loadLayout, saveLayout, type Layout } from './lib/layout';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import { loadTabs, newId, nextScratchTitle, saveTabs, type Lang, type TabsState } from './lib/tabs';
import { Chat, type ChatMessage } from './components/Chat';
import { Rail } from './components/Rail';
import { Splitter } from './components/Splitter';
import { Workspace, type OutputLine } from './components/Workspace';

const WELCOME =
  "Pick a mode and ask away. I can see the tab you have open and its last output, so there's no need to paste code.\n\n" +
  "(The tutor isn't connected yet. Replies are placeholders until Phase 4.)";

let msgSeq = 0;
const welcome = (): ChatMessage[] => [{ id: ++msgSeq, role: 'tutor', text: WELCOME }];

export function App() {
  const [tabsState, setTabsState] = useState<TabsState>(loadTabs);
  const [outputs, setOutputs] = useState<Record<string, OutputLine[]>>({});
  const [mode, setMode] = useState<ModeId>('debug');
  const [level, setLevel] = useState<Level>(1);
  const [resetNote, setResetNote] = useState('');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [messages, setMessages] = useState<ChatMessage[]>(welcome);
  const [focusTick, setFocusTick] = useState(0);
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const appRef = useRef<HTMLDivElement>(null);
  const resetTimer = useRef<number | undefined>(undefined);

  const { tabs, activeId } = tabsState;
  const active = tabs.find((t) => t.id === activeId)!;

  // Save tabs a moment after the last change, not on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => saveTabs(tabsState), 300);
    return () => window.clearTimeout(timer);
  }, [tabsState]);

  useEffect(() => saveSettings(settings), [settings]);

  // Light / dark: no attribute means "follow the computer's setting".
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveLayout(layout), 300);
    return () => window.clearTimeout(timer);
  }, [layout]);

  const resize = (patch: Partial<Layout>) => setLayout((l) => ({ ...l, ...patch }));
  // A column can grow until the editor column is down to its minimum width.
  const columnBounds = (key: 'railWidth' | 'chatWidth') => () => {
    const total = appRef.current?.clientWidth ?? window.innerWidth;
    const other = key === 'railWidth' ? layout.chatWidth : layout.railWidth;
    return { min: LIMITS[key].min, max: Math.min(LIMITS[key].max, total - other - LIMITS.minWorkWidth) };
  };

  const updateCode = useCallback(
    (code: string) =>
      setTabsState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === s.activeId ? { ...t, code } : t)) })),
    [],
  );

  const newTab = (lang: Lang) => {
    const tab = { id: newId(), title: nextScratchTitle(tabs, lang), lang, code: '', fromMission: false };
    setTabsState((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
    setFocusTick((n) => n + 1);
  };

  const closeTab = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab || tabs.length === 1) return;
    if (tab.code.trim() && !window.confirm(`Close “${tab.title}”? Its code will be deleted.`)) return;
    setTabsState((s) => {
      const i = s.tabs.findIndex((t) => t.id === id);
      const rest = s.tabs.filter((t) => t.id !== id);
      const activeId = s.activeId === id ? rest[Math.max(0, i - 1)].id : s.activeId;
      return { tabs: rest, activeId };
    });
    setOutputs(({ [id]: _closed, ...rest }) => rest);
  };

  // Placeholder until the runners exist (Python in Phase 2, SQL in Phase 3).
  // Reads the tab through a ref so Ctrl+Enter inside the editor always sees the latest one.
  const activeRef = useRef(active);
  activeRef.current = active;
  const run = useCallback(() => {
    const tab = activeRef.current;
    const runner = tab.lang === 'sql' ? 'SQL runner arrives in Phase 3' : 'Python runner arrives in Phase 2';
    const lines: OutputLine[] = [
      { kind: 'sys', text: `▶ ${tab.title}` },
      { kind: 'sys', text: `Nothing ran: the ${runner}.` },
    ];
    setOutputs((o) => ({ ...o, [tab.id]: lines }));
  }, []);

  const chooseMode = (m: ModeId) => {
    setMode(m);
    setLevel(1);
  };

  const send = (text: string) => {
    const m = modeById(mode);
    const user: ChatMessage = { id: ++msgSeq, role: 'user', text, attached: active.title };
    const where = m.hasLevels ? `${m.label}, Clearance ${level}: ${levelInfo(level).name}` : m.label;
    const reply: ChatMessage = {
      id: ++msgSeq,
      role: 'tutor',
      chips: [where],
      text:
        `Placeholder reply: the tutor connects in Phase 4.\n\n` +
        `Your message would be sent in ${where}, together with “${active.title}”.`,
    };
    setMessages((ms) => [...ms, user, reply]);

    // The level is for one message only. It always goes back to 1 after sending.
    if (m.hasLevels && level !== 1) {
      setResetNote('Clearance reset: back to 1 for your next message.');
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setResetNote(''), 3000);
    }
    setLevel(1);
  };

  const newMission = () => {
    setMessages(welcome());
    setLevel(1);
  };

  return (
    <div
      className="app"
      ref={appRef}
      style={{ '--rail-w': `${layout.railWidth}px`, '--chat-w': `${layout.chatWidth}px` } as CSSProperties}
    >
      <Rail
        mode={mode}
        level={level}
        resetNote={resetNote}
        settings={settings}
        onMode={chooseMode}
        onLevel={setLevel}
        onNewMission={newMission}
        onSettings={setSettings}
      />
      <Splitter
        axis="x"
        className="col-splitter rail-splitter"
        label="Resize left panel"
        value={layout.railWidth}
        grow={1}
        bounds={columnBounds('railWidth')}
        onChange={(railWidth) => resize({ railWidth })}
        onReset={() => resize({ railWidth: DEFAULT_LAYOUT.railWidth })}
      />
      <Workspace
        tabs={tabs}
        activeId={activeId}
        output={outputs[activeId] ?? []}
        helpers={settings}
        focusTick={focusTick}
        outputHeight={layout.outputHeight}
        onOutputHeight={(outputHeight) => resize({ outputHeight })}
        onOutputReset={() => resize({ outputHeight: DEFAULT_LAYOUT.outputHeight })}
        onSelect={(id) => setTabsState((s) => ({ ...s, activeId: id }))}
        onClose={closeTab}
        onNew={newTab}
        onCode={updateCode}
        onRun={run}
        onClearOutput={() => setOutputs((o) => ({ ...o, [activeId]: [] }))}
      />
      <Splitter
        axis="x"
        className="col-splitter chat-splitter"
        label="Resize chat panel"
        value={layout.chatWidth}
        grow={-1}
        bounds={columnBounds('chatWidth')}
        onChange={(chatWidth) => resize({ chatWidth })}
        onReset={() => resize({ chatWidth: DEFAULT_LAYOUT.chatWidth })}
      />
      <Chat mode={mode} level={level} activeTitle={active.title} messages={messages} onSend={send} />
    </div>
  );
}
