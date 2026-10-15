import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { modeById, type Level, type ModeId } from '../shared/clearance';
import { DEFAULT_LAYOUT, LIMITS, loadLayout, saveLayout, type Layout } from './lib/layout';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import { loadTabs, newId, nextScratchTitle, saveTabs, uniqueTitle, type Lang, type Tab, type TabsState } from './lib/tabs';
import { Chat, type ChatMessage } from './components/Chat';
import { Rail } from './components/Rail';
import { SettingsDialog } from './components/SettingsDialog';
import { Splitter } from './components/Splitter';
import { Workspace } from './components/Workspace';
import { useAppUpdate } from './hooks/useAppUpdate';
import { useCodeRunner } from './hooks/useCodeRunner';
import { UpdatePrompt } from './components/UpdatePrompt';
import { ChatFailed, sendChat } from './lib/api';
import { LIMITS as API_LIMITS, type HistoryMessage } from '../shared/api';
import type { DebugInfo } from './components/Inspector';

const WELCOME =
  "Pick a mode and ask away. I can see the tab you have open and its last output, so there's no need to paste code.\n\n" +
  'Choose how much help you want on the left. It goes back to Clearance 1 after every message.';

let msgSeq = 0;
const welcome = (): ChatMessage[] => [{ id: ++msgSeq, role: 'tutor', text: WELCOME }];

export function App() {
  const [tabsState, setTabsState] = useState<TabsState>(loadTabs);
  const [mode, setMode] = useState<ModeId>('debug');
  const [level, setLevel] = useState<Level>(1);
  const [resetNote, setResetNote] = useState('');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [messages, setMessages] = useState<ChatMessage[]>(welcome);
  const [focusTick, setFocusTick] = useState(0);
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const appRef = useRef<HTMLDivElement>(null);
  const resetTimer = useRef<number | undefined>(undefined);

  const { tabs, activeId } = tabsState;
  const active = tabs.find((t) => t.id === activeId)!;
  const runner = useCodeRunner();
  // Registers the service worker and offers a reload when a newer build is deployed.
  const update = useAppUpdate();
  const { clearErrorLine } = runner;
  // Ctrl+Enter inside the editor reads the tab through this ref, so it always gets the latest one.
  const activeRef = useRef(active);
  activeRef.current = active;

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
    (code: string) => {
      setTabsState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === s.activeId ? { ...t, code } : t)) }));
      clearErrorLine(activeRef.current.id); // An edit clears the error marker.
    },
    [clearErrorLine],
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
    runner.forgetTab(id);
  };

  const { start } = runner;
  const run = useCallback(() => void start(activeRef.current), [start]);

  const chooseMode = (m: ModeId) => {
    setMode(m);
    setLevel(1);
  };

  const [waiting, setWaiting] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);

  /** The chat so far, as the tutor sees it: no welcome text, no failed messages, no errors. */
  const historyFor = (msgs: ChatMessage[]): HistoryMessage[] =>
    msgs.flatMap((msg): HistoryMessage[] => {
      if (msg.role === 'user' && !msg.failed) return [{ role: 'user', content: msg.text }];
      if (msg.role === 'tutor' && msg.history !== undefined) return [{ role: 'assistant', content: msg.history }];
      return [];
    });

  const send = async (text: string) => {
    if (waiting) return;
    const m = modeById(mode);
    const sentLevel = level;
    const tab = active;
    const lastRun = runner.lastRuns[tab.id] ?? null;
    const userMsg: ChatMessage = {
      id: ++msgSeq,
      role: 'user',
      text,
      attached: tab.title + (lastRun ? ' + last output' : ''),
    };
    const history = historyFor(messages);
    setMessages((ms) => [...ms, userMsg]);
    setWaiting(true);

    // The level is for one message only: it goes back to 1 as soon as a message is sent.
    if (m.hasLevels && sentLevel !== 1) {
      setResetNote('Clearance reset: back to 1 for your next message.');
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setResetNote(''), 3000);
    }
    setLevel(1);

    try {
      const res = await sendChat({
        mode,
        level: m.hasLevels ? sentLevel : 1,
        message: text,
        history,
        activeTab: { title: tab.title, lang: tab.lang, code: tab.code, fromMission: tab.fromMission },
        lastRun,
        models: { tutor: settings.tutorModel, judge: settings.judgeModel },
        thinking: settings.thinking,
      });
      setDebugInfo({ debug: res.debug, intercepted: res.intercepted });
      const where = m.hasLevels ? `${m.label}, Clearance ${sentLevel}` : m.label;
      const chips: { text: string; tone?: 'fallback' | 'mission' | 'guard' }[] = [{ text: where }];
      if (res.fallback) {
        chips.push({ text: "Transmission blocked: the tutor kept giving too much away, so the app is asking instead", tone: 'fallback' });
      } else if (res.intercepted.length > 0) {
        const n = res.intercepted.length;
        chips.push({ text: `Spoiler intercepted: ${n} draft${n > 1 ? 's' : ''} blocked before you saw ${n > 1 ? 'them' : 'it'}`, tone: 'guard' });
      }
      let remembered = res.reply;
      if (res.missions.length > 0) {
        // The only way model output reaches the editor: missions, each in a brand-new tab.
        const { missions } = res;
        setTabsState((s) => {
          const added: Tab[] = [];
          for (const mission of missions) {
            added.push({
              id: newId(),
              title: uniqueTitle([...s.tabs, ...added], mission.title),
              lang: mission.lang,
              code: mission.code,
              fromMission: true,
            });
          }
          // Show the first new mission.
          return { tabs: [...s.tabs, ...added], activeId: added[0].id };
        });
        const titles = missions.map((m) => m.title);
        chips.push({
          text:
            missions.length === 1
              ? `Mission opened in a new tab: ${titles[0]}`
              : `${missions.length} missions opened in new tabs: ${titles.join(', ')}`,
          tone: 'mission',
        });
        if (res.missionsSkipped > 0) {
          chips.push({ text: `${res.missionsSkipped} more left out: up to ${API_LIMITS.missions} missions per message`, tone: 'guard' });
        }
        remembered = `${res.reply}\n\n[Opened in new tabs: ${titles.map((t) => `"${t}"`).join(', ')}]`.trim();
      }
      const reply: ChatMessage = { id: ++msgSeq, role: 'tutor', text: res.reply, history: remembered, chips };
      setMessages((ms) => [...ms, reply]);
    } catch (err) {
      const message = err instanceof ChatFailed ? err.message : 'Something went wrong. Try again.';
      setMessages((ms) => [
        ...ms.map((msg) => (msg.id === userMsg.id ? { ...userMsg, failed: true } : msg)),
        { id: ++msgSeq, role: 'error', text: message },
      ]);
    } finally {
      setWaiting(false);
    }
  };

  const newMission = () => {
    if (waiting) return;
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
        onMode={chooseMode}
        onLevel={setLevel}
        onNewMission={newMission}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {update.needRefresh && <UpdatePrompt onReload={update.updateApp} onDismiss={update.dismiss} />}
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onSettings={setSettings}
        onResetLayout={() => setLayout({ ...DEFAULT_LAYOUT })}
        onClose={() => setSettingsOpen(false)}
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
        output={runner.outputs[activeId] ?? []}
        errorLine={runner.errorLines[activeId] ?? null}
        run={runner.run}
        interactiveInput={runner.interactive}
        stdinText={runner.stdinTexts[activeId] ?? ''}
        onStdinText={(text) => runner.setStdinText(activeId, text)}
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
        onStop={runner.stop}
        onInput={runner.provideInput}
        onClearOutput={() => runner.clearOutput(activeId)}
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
      <Chat
        mode={mode}
        level={level}
        activeTitle={active.title}
        hasLastRun={activeId in runner.lastRuns}
        messages={messages}
        waiting={waiting}
        debugPanel={settings.debugPanel}
        debugInfo={debugInfo}
        onSend={send}
      />
    </div>
  );
}
