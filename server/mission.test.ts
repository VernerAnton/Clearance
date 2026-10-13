import { describe, expect, it } from 'vitest';
import { extractMission } from './mission.ts';

describe('extractMission', () => {
  it('takes a Python mission out of the reply', () => {
    const reply = 'Mission ready in a new tab.\n```python\n# Mission: Word counter\n# Count the words.\n\nsentence = "a b"\n\n# Your code below\n```';
    expect(extractMission(reply)).toEqual({
      mission: { title: 'Word counter', lang: 'python', code: '# Mission: Word counter\n# Count the words.\n\nsentence = "a b"\n\n# Your code below\n' },
      rest: 'Mission ready in a new tab.',
    });
  });

  it('takes a SQL mission, and keeps the text around it', () => {
    const reply = 'Here you go.\n\n```sql\n-- Mission: Busy departments\nCREATE TABLE e (d TEXT);\n```\n\nRun it when ready.';
    const got = extractMission(reply);
    expect(got?.mission).toMatchObject({ title: 'Busy departments', lang: 'sql' });
    expect(got?.rest).toBe('Here you go.\n\nRun it when ready.');
  });

  it('ignores blocks without a mission title line, or with the wrong comment style', () => {
    expect(extractMission('```python\nprint(1)\n```')).toBeNull();
    expect(extractMission('```sql\n# Mission: wrong comment\n```')).toBeNull();
    expect(extractMission('```pseudo\n# Mission: not a language\n```')).toBeNull();
  });

  it('only takes the first mission; other blocks stay in the reply', () => {
    const reply = '```python\n# Mission: One\n```\n```python\n# Mission: Two\n```';
    const got = extractMission(reply);
    expect(got?.mission.title).toBe('One');
    expect(got?.rest).toBe('```python\n# Mission: Two\n```');
  });
});
