import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { levelInfo, modeById, type Level, type ModeId } from '../../shared/clearance';
import { Inspector, type DebugInfo } from './Inspector';
import { Markdown } from './Markdown';
import { paneAttrs, type PaneProps } from './pane';

export type ChatMessage =
  | {
      id: number;
      role: 'user';
      text: string;
      /** What the tutor got instead of `text`, if different (the Review button sends a fuller sentence). */
      prompt?: string;
      /** What the app sent along, e.g. "Filter positives + last output". */
      attached: string;
      /** The request failed, so this message is left out of the history sent to the tutor. */
      failed?: boolean;
    }
  | {
      id: number;
      role: 'tutor';
      text: string;
      /** Small labels above the reply, e.g. "Debug, Clearance 3". */
      chips?: { text: string; tone?: 'fallback' | 'mission' | 'guard' }[];
      /** What goes into the history for later messages. Missing for the welcome text. */
      history?: string;
    }
  | { id: number; role: 'error'; text: string };

interface Props {
  mode: ModeId;
  level: Level;
  activeTitle: string;
  hasLastRun: boolean;
  messages: ChatMessage[];
  waiting: boolean;
  /** Show the debug panel button (a setting, off by default). */
  debugPanel: boolean;
  debugInfo: DebugInfo | null;
  onSend: (text: string) => void;
  /** The Review button: asks the tutor to look at the current tab, without typing. */
  onReview: () => void;
  /** False while the current tab is empty: nothing to review. */
  canReview: boolean;
  /** Set in the side-panel layout. */
  pane?: PaneProps;
  /** A reply arrived while the chat was the small pane. */
  unread?: boolean;
}

export function Chat(props: Props) {
  const { mode, level, activeTitle, hasLastRun, messages, waiting, debugPanel, debugInfo, onSend, onReview, canReview, pane, unread } = props;
  const [draft, setDraft] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const m = modeById(mode);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, waiting]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || waiting) return;
    onSend(text);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section className="chat" aria-label="Tutor chat" {...paneAttrs(pane)}>
      {unread && (
        <span className="unread" role="status">
          New reply
        </span>
      )}
      <div className="topbar">
        <div className="status">
          <span aria-hidden="true">{m.icon}</span> {m.label}
          <small>{m.hasLevels ? `next reply at Clearance ${level}: ${levelInfo(level).name}` : 'no clearance levels'}</small>
        </div>
        {debugPanel && (
          <button
            type="button"
            className="btn small"
            aria-expanded={inspecting}
            aria-controls="inspector"
            onClick={() => setInspecting((v) => !v)}
          >
            What the tutor receives
          </button>
        )}
      </div>

      <div className="log" ref={logRef} aria-live="polite">
        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className={`msg user${msg.failed ? ' failed' : ''}`}>
                {msg.text}
                <span className="attached">📎 {msg.attached}</span>
              </div>
            );
          }
          if (msg.role === 'error') {
            return (
              <div key={msg.id} className="msg error" role="alert">
                <strong>Couldn’t get a reply.</strong> <Markdown text={msg.text} />
              </div>
            );
          }
          return (
            <div key={msg.id} className="msg bot">
              {msg.chips?.map((c) => (
                <span key={c.text} className={`chip${c.tone ? ` ${c.tone}` : ''}`}>
                  {c.text}
                </span>
              ))}
              <Markdown text={msg.text} />
            </div>
          );
        })}
        {waiting && <div className="msg bot thinking">Drafting a reply…</div>}
      </div>

      {debugPanel && inspecting && <Inspector info={debugInfo} />}

      <form className="composer" onSubmit={submit}>
        <div className="row">
          <label htmlFor="chat-input" className="sr">
            Message
          </label>
          <textarea
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask about your code. Enter sends, Shift+Enter adds a line."
          />
          <div className="send-actions">
            <button className="btn primary" type="submit" disabled={waiting}>
              Send
            </button>
            {/* Leaves whatever you've typed in the box alone. */}
            <button
              className="btn review-btn"
              type="button"
              disabled={waiting || !canReview}
              onClick={onReview}
              title="Ask the tutor to review your current tab and its last output"
            >
              Review
            </button>
          </div>
        </div>
        <span className="attachnote">
          Sent with your message: “{activeTitle}” and {hasLastRun ? 'its last output' : 'no output yet (press Run first)'}.
        </span>
      </form>
    </section>
  );
}
