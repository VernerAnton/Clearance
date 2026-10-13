// The output panel's content: coloured pieces of text, and SQL result tables.
import type { SqlTable } from '../sql/protocol';
import { tableText } from './sqlText';

export type OutputKind = 'out' | 'err' | 'sys' | 'input';

export interface TextSegment {
  kind: OutputKind;
  text: string;
}

export interface TableSegment {
  kind: 'table';
  table: SqlTable;
}

export type Segment = TextSegment | TableSegment;

/** A segment's text as the tutor sees it. */
export function segmentText(seg: Segment): string {
  return seg.kind === 'table' ? tableText(seg.table) : seg.text;
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
  if (kind === 'sys' && last && last.kind !== 'table' && !last.text.endsWith('\n')) text = '\n' + text;
  if (last && last.kind === kind) out[out.length - 1] = { kind, text: last.text + text };
  else out.push({ kind, text });
  return trim(out, cap);
}

/** Add a SQL result table to the output. */
export function appendTable(segments: Segment[], table: SqlTable): Segment[] {
  return [...segments, { kind: 'table', table }];
}

const size = (seg: Segment) => (seg.kind === 'table' ? 0 : seg.text.length);

/** Drop the oldest text once the total goes over the cap. (Tables are capped by row count instead.) */
function trim(out: Segment[], cap: number): Segment[] {
  let total = out.reduce((n, s) => n + size(s), 0);
  if (total <= cap) return out;
  const head = out[0];
  if (head && head.kind !== 'table' && head.text === TRIMMED) {
    total -= head.text.length;
    out.shift();
  }
  while (total > cap - TRIMMED.length && out.length) {
    const seg = out[0];
    if (seg.kind === 'table') {
      out.shift();
      continue;
    }
    const first = seg.text;
    const over = total - (cap - TRIMMED.length);
    // Cut at a line end so the first line shown isn't half a line.
    const newline = first.indexOf('\n', over);
    const cut = first.length <= over || newline === -1 ? Math.min(over, first.length) : newline + 1;
    if (cut >= first.length) out.shift();
    else out[0] = { ...seg, text: first.slice(cut) };
    total -= Math.min(cut, first.length);
  }
  return [{ kind: 'sys', text: TRIMMED }, ...out];
}

/** The output as plain text, at most `max` characters from the end. */
export function outputText(segments: Segment[], max = TUTOR_OUTPUT_CHARS): string {
  const text = segments.map(segmentText).join('');
  return text.length > max ? text.slice(-max) : text;
}
