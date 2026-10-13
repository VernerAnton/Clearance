// The output panel's content: a list of coloured pieces of text.

export type OutputKind = 'out' | 'err' | 'sys' | 'input';

export interface Segment {
  kind: OutputKind;
  text: string;
}

/** Keep at most this many characters, so a runaway print loop can't freeze the page. */
export const OUTPUT_CAP = 100_000;
/** How much of the last run the tutor gets to see. */
export const TUTOR_OUTPUT_CHARS = 1500;

const TRIMMED = '[earlier output trimmed]\n';

/**
 * Add text to the output. Joins it onto the last piece when the colour matches,
 * starts app messages ("sys") on their own line, and drops the oldest text
 * once the total goes over the cap.
 */
export function appendOutput(segments: Segment[], kind: OutputKind, text: string, cap = OUTPUT_CAP): Segment[] {
  if (!text) return segments;
  const out = segments.slice();
  const last = out[out.length - 1];
  if (kind === 'sys' && last && !last.text.endsWith('\n')) text = '\n' + text;
  if (last && last.kind === kind) out[out.length - 1] = { kind, text: last.text + text };
  else out.push({ kind, text });

  let total = out.reduce((n, s) => n + s.text.length, 0);
  if (total <= cap) return out;
  if (out[0]?.text === TRIMMED) {
    total -= out[0].text.length;
    out.shift();
  }
  while (total > cap - TRIMMED.length && out.length) {
    const first = out[0].text;
    const over = total - (cap - TRIMMED.length);
    // Cut at a line end so the first line shown isn't half a line.
    const newline = first.indexOf('\n', over);
    const cut = first.length <= over || newline === -1 ? Math.min(over, first.length) : newline + 1;
    if (cut >= first.length) out.shift();
    else out[0] = { ...out[0], text: first.slice(cut) };
    total -= Math.min(cut, first.length);
  }
  return [{ kind: 'sys', text: TRIMMED }, ...out];
}

/** The output as plain text, at most `max` characters from the end. */
export function outputText(segments: Segment[], max = TUTOR_OUTPUT_CHARS): string {
  const text = segments.map((s) => s.text).join('');
  return text.length > max ? text.slice(-max) : text;
}
