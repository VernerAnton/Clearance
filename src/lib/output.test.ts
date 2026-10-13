import { describe, expect, it } from 'vitest';
import { appendOutput, outputText, type Segment } from './output';

const build = (...parts: [Segment['kind'], string][]) =>
  parts.reduce<Segment[]>((segs, [kind, text]) => appendOutput(segs, kind, text), []);

describe('appendOutput', () => {
  it('joins text of the same kind and keeps different kinds apart', () => {
    expect(build(['out', 'a'], ['out', 'b\n'], ['err', 'oops\n'])).toEqual([
      { kind: 'out', text: 'ab\n' },
      { kind: 'err', text: 'oops\n' },
    ]);
  });

  it('puts app messages on their own line', () => {
    expect(build(['out', 'no newline'], ['sys', 'Stopped.\n'])).toEqual([
      { kind: 'out', text: 'no newline' },
      { kind: 'sys', text: '\nStopped.\n' },
    ]);
  });

  it('keeps an input() prompt and the typed answer on one line', () => {
    expect(outputText(build(['out', 'Name? '], ['input', 'Ada\n'], ['out', 'Hi Ada\n']))).toBe('Name? Ada\nHi Ada\n');
  });

  it('drops the oldest text once over the cap, and says so once', () => {
    let segs: Segment[] = [];
    for (let i = 0; i < 50; i++) segs = appendOutput(segs, i % 2 ? 'out' : 'err', `${i}`.padStart(10, '-') + '\n', 100);
    const text = outputText(segs, 10_000);
    expect(text.length).toBeLessThanOrEqual(100);
    expect(text.startsWith('[earlier output trimmed]\n')).toBe(true);
    expect(text.match(/trimmed/g)).toHaveLength(1);
    expect(text.endsWith('--------49\n')).toBe(true);
    // Every line after the notice is a whole line.
    expect(text.split('\n').slice(1, -1).every((l) => l.length === 10)).toBe(true);
  });
});

describe('outputText', () => {
  it('returns the end of long output', () => {
    expect(outputText([{ kind: 'out', text: 'abcdef' }], 3)).toBe('def');
  });
});
