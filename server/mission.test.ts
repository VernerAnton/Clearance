import { describe, expect, it } from 'vitest';
import { extractMissions } from './mission.ts';

const py = (title: string) => `\`\`\`python\n# Mission: ${title}\n# Count the words.\n\n# Your code below\n\`\`\``;

describe('extractMissions', () => {
  it('takes a Python mission out of the reply', () => {
    const reply = 'Mission ready in a new tab.\n```python\n# Mission: Word counter\n# Count the words.\n\nsentence = "a b"\n\n# Your code below\n```';
    expect(extractMissions(reply)).toEqual({
      missions: [{ title: 'Word counter', lang: 'python', code: '# Mission: Word counter\n# Count the words.\n\nsentence = "a b"\n\n# Your code below\n' }],
      skipped: 0,
      rest: 'Mission ready in a new tab.',
    });
  });

  it('takes a SQL mission, and keeps the text around it', () => {
    const reply = 'Here you go.\n\n```sql\n-- Mission: Busy departments\nCREATE TABLE e (d TEXT);\n```\n\nRun it when ready.';
    const got = extractMissions(reply);
    expect(got?.missions[0]).toMatchObject({ title: 'Busy departments', lang: 'sql' });
    expect(got?.rest).toBe('Here you go.\n\nRun it when ready.');
  });

  it('takes every mission, in order, and keeps the text between them', () => {
    const got = extractMissions(`Three for you.\n${py('One')}\nThen:\n${py('Two')}\n${py('Three')}\nHave fun.`);
    expect(got?.missions.map((m) => m.title)).toEqual(['One', 'Two', 'Three']);
    expect(got?.rest).toBe('Three for you.\nThen:\nHave fun.');
  });

  it('keeps at most the limit and counts the rest as skipped', () => {
    const reply = Array.from({ length: 13 }, (_, i) => py(`M${i + 1}`)).join('\n');
    const got = extractMissions(reply, 10);
    expect(got?.missions).toHaveLength(10);
    expect(got?.missions.at(-1)?.title).toBe('M10');
    expect(got?.skipped).toBe(3);
    expect(got?.rest).toBe('');
  });

  it('ignores blocks without a mission title line, or with the wrong comment style', () => {
    expect(extractMissions('```python\nprint(1)\n```')).toBeNull();
    expect(extractMissions('```sql\n# Mission: wrong comment\n```')).toBeNull();
    expect(extractMissions('```pseudo\n# Mission: not a language\n```')).toBeNull();
  });

  it('leaves ordinary code blocks next to missions in the reply', () => {
    const got = extractMissions(`${py('One')}\nHint:\n\`\`\`python\nprint(2)\n\`\`\``);
    expect(got?.missions).toHaveLength(1);
    expect(got?.rest).toBe('Hint:\n```python\nprint(2)\n```');
  });
});
