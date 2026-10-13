// Reads prompts/clearance-rules.md: one rule line per level, plus one for Explain.

export interface ClearanceRules {
  levels: Record<number, string>;
  explain: string;
}

export function parseClearanceRules(markdown: string): ClearanceRules {
  const levels: Record<number, string> = {};
  let explain = '';
  for (const line of markdown.split('\n')) {
    const match = line.match(/^([1-5]|explain):\s*(.+)$/);
    if (!match) continue;
    if (match[1] === 'explain') explain = match[2].trim();
    else levels[Number(match[1])] = match[2].trim();
  }
  for (let level = 1; level <= 5; level++) {
    if (!levels[level]) throw new Error(`prompts/clearance-rules.md has no rule for level ${level}`);
  }
  if (!explain) throw new Error('prompts/clearance-rules.md has no "explain:" line');
  return { levels, explain };
}
