import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { levelInfo, modeById, type Level, type ModeId } from '../../shared/clearance';
import { Markdown } from './Markdown';

export type ChatMessage =
  | {
      id: number;
      role: 'user';
      text: string;
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
  onSend: (text: string) => void;
}

export function Chat({ mode, level, activeTitle, hasLastRun, messages, waiting, onSend }: Props) {
  const [draft, setDraft] = useState('');
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
    <section className="chat" aria-label="Tutor chat">
      <div className="topbar">
        <div className="status">
          <span aria-hidden="true">{m.icon}</span> {m.label}
          <small>{m.hasLevels ? `next reply at Clearance ${level}: ${levelInfo(level).name}` : 'no clearance levels'}</small>
        </div>
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
          <button className="btn primary" type="submit" disabled={waiting}>
            Send
          </button>
        </div>
        <span className="attachnote">
          Sent with your message: “{activeTitle}” and {hasLastRun ? 'its last output' : 'no output yet (press Run first)'}.
        </span>
      </form>
    </section>
  );
}
