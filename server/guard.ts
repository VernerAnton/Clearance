// The free, always-on part of the guard: looking for code blocks a draft isn't allowed to have.

export interface Fence {
  /** The word after the opening backticks, e.g. "python" or "pseudo" ("" if none). */
  lang: string;
  /** Where the block starts and ends in the text (end is just after the closing fence). */
  start: number;
  end: number;
  /** The lines between the fences. */
  body: string;
}

const OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[^\n]*$/;

/** Finds the fenced code blocks in Markdown text. An unclosed block runs to the end. */
export function findFences(text: string): Fence[] {
  const fences: Fence[] = [];
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(OPEN);
    if (!open) {
      offset += lines[i].length + 1;
      continue;
    }
    const marker = open[1];
    const start = offset;
    offset += lines[i].length + 1;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const close = lines[j].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      offset += lines[j].length + 1;
      if (close && close[1][0] === marker[0] && close[1].length >= marker.length) break;
      body.push(lines[j]);
    }
    fences.push({ lang: open[2].toLowerCase(), start, end: Math.min(offset, text.length), body: body.join('\n') });
    i = j;
  }
  return fences;
}

/**
 * The code check. Returns why the draft fails, or null if it passes.
 * Clearance 1-2: no code blocks at all. Clearance 3: only blocks tagged `pseudo`.
 * Clearance 4-5 and Explain mode: anything goes.
 */
export function codeCheck(draft: string, level: number, hasLevels: boolean): string | null {
  if (!hasLevels || level >= 4) return null;
  const fences = findFences(draft);
  if (level <= 2 && fences.length > 0) return `It contained a code block, and Clearance ${level} allows no code at all.`;
  if (level === 3 && fences.some((f) => f.lang !== 'pseudo')) {
    return 'It contained a code block not tagged pseudo, and Clearance 3 allows pseudocode only.';
  }
  return null;
}
