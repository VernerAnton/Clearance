import type { ChatResponse, Intercepted } from '../../shared/api';

export interface DebugInfo {
  debug: ChatResponse['debug'];
  intercepted: Intercepted[];
}

const show = (messages: { role: string; content: string }[]) =>
  messages.map((m) => `── ${m.role} ──\n${m.content}`).join('\n\n');

/** "What the tutor receives": the last requests to the tutor and judge, and blocked drafts. */
export function Inspector({ info }: { info: DebugInfo | null }) {
  if (!info) {
    return (
      <section className="inspector" id="inspector" aria-label="What the tutor receives">
        <p>Send a message to see what the tutor receives.</p>
      </section>
    );
  }
  const { debug, intercepted } = info;
  return (
    <section className="inspector" id="inspector" aria-label="What the tutor receives">
      <h3>Last request to the tutor model</h3>
      <p>The app adds the mode, the clearance rule, your open tab and its last output to your message.</p>
      <pre>{show(debug.tutorMessages)}</pre>

      <h3>Judge checks</h3>
      {debug.judgeChecks.length === 0 ? (
        <p>The judge only reads drafts at Clearance 1 and 2.</p>
      ) : (
        debug.judgeChecks.map((check) => (
          <details key={check.attempt}>
            <summary>
              Attempt {check.attempt}: {check.verdict.leaks ? 'leak' : 'pass'}
              {!check.verdict.parsed && ' (answer unreadable, let through)'}
              {check.verdict.why && ` — ${check.verdict.why}`}
            </summary>
            <pre>{show(check.messages)}</pre>
            <pre>{`── judge answered ──\n${check.raw}`}</pre>
          </details>
        ))
      )}

      <h3>Spoilers intercepted</h3>
      {intercepted.length === 0 ? (
        <p>No drafts were blocked for this reply.</p>
      ) : (
        intercepted.map((i) => (
          <details key={i.attempt}>
            <summary>
              Attempt {i.attempt}, blocked by the {i.step === 'judge' ? 'judge' : 'code check'}: {i.why}
            </summary>
            <pre>{i.draft}</pre>
          </details>
        ))
      )}
    </section>
  );
}
