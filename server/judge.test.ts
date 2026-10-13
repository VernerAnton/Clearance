import { describe, expect, it } from 'vitest';
import { buildJudgeMessages, parseJudgeReply } from './judge.ts';

describe('parseJudgeReply', () => {
  it('reads plain JSON', () => {
    expect(parseJudgeReply('{"leaks": true, "why": "States the fix."}')).toEqual({ leaks: true, why: 'States the fix.', parsed: true });
    expect(parseJudgeReply('{"leaks": false, "why": "Asks a question."}')).toMatchObject({ leaks: false, parsed: true });
  });

  it('reads JSON wrapped in a code fence or in extra text', () => {
    expect(parseJudgeReply('```json\n{"leaks": true, "why": "x"}\n```')).toMatchObject({ leaks: true, parsed: true });
    expect(parseJudgeReply('Sure! {"leaks": false, "why": "fine"} Hope that helps.')).toMatchObject({ leaks: false, parsed: true });
    expect(parseJudgeReply('{"leaks": "true", "why": "x"}')).toMatchObject({ leaks: true, parsed: true });
  });

  it('fills in a reason when the judge flags a leak without one', () => {
    expect(parseJudgeReply('{"leaks": true}').why).toBe('The judge found a leak.');
  });

  it('treats anything unreadable as a pass, and says so', () => {
    for (const raw of ['', 'I think it is fine', '{"leaks": maybe}', '{"verdict": "leak"}', '[true]']) {
      expect(parseJudgeReply(raw)).toMatchObject({ leaks: false, parsed: false });
    }
  });
});

describe('buildJudgeMessages', () => {
  it('sends the level, the learner message, the code and the draft', () => {
    const [system, user] = buildJudgeMessages('JUDGE', { level: 2, learnerMessage: 'help', code: 'x = 1\n', lang: 'python', draft: 'Hmm?' });
    expect(system).toEqual({ role: 'system', content: 'JUDGE' });
    expect(user.content).toBe("Clearance: 2\n\nLearner's message:\nhelp\n\nLearner's code:\n```python\nx = 1\n```\n\nDraft reply:\nHmm?");
  });
});
