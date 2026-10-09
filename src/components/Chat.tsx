import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { levelInfo, modeById, type Level, type ModeId } from '../../shared/clearance';

export interface ChatMessage {
  id: number;
  role: 'user' | 'tutor';
  text: string;
  /** For user messages: what the app sent along, e.g. "Filter positives". */
  attached?: string;
  /** Small labels above a tutor reply, e.g. "Debug, Clearance 3". */
  chips?: string[];
}

interface Props {
  mode: ModeId;
  level: Level;
  activeTitle: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export function Chat({ mode, level, activeTitle, messages, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const m = modeById(mode);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
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
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="msg user">
              {msg.text}
              {msg.attached && <span className="attached">📎 {msg.attached}</span>}
            </div>
          ) : (
            <div key={msg.id} className="msg bot">
              {msg.chips?.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
              {msg.text.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ),
        )}
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
          <button className="btn primary" type="submit">
            Send
          </button>
        </div>
        <span className="attachnote">Sent with your message: “{activeTitle}” and its last output (once it has run).</span>
      </form>
    </section>
  );
}
