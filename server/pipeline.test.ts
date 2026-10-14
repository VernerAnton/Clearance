import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '../shared/api.ts';
import type { ModelMessage } from './messages.ts';
import { FALLBACK_REPLY, runGuarded, type PipelineDeps } from './pipeline.ts';
import { chatJudge } from './judge.ts';
import { CLEARANCE_RULES, RETRY_NOTE } from './prompts.generated.ts';
import { parseClearanceRules } from './rules.ts';

const request = (over: Partial<ChatRequest> = {}): ChatRequest => ({
  mode: 'debug',
  level: 1,
  message: 'why?',
  history: [],
  activeTab: { title: 't.py', lang: 'python', code: 'x = 1', fromMission: false },
  lastRun: null,
  ...over,
});

/** A fake model: the tutor gives the drafts in order, the judge flags drafts containing "LEAK". */
function fakeDeps(drafts: string[], judgeRaw?: string) {
  const calls: { model: string; messages: ModelMessage[] }[] = [];
  const complete: PipelineDeps['complete'] = async (model, messages) => {
    calls.push({ model, messages });
    if (model === 'judge') {
      const draft = messages[1].content.split('Draft reply:\n')[1];
      return judgeRaw ?? JSON.stringify({ leaks: draft.includes('LEAK'), why: 'Gives the fix.' });
    }
    return drafts.shift() ?? 'out of drafts';
  };
  const deps: PipelineDeps = {
    complete,
    tutorModel: 'tutor',
    judge: chatJudge(complete, 'judge', 'JUDGE'),
    prompts: { tutorSystem: 'TUTOR', retryNote: RETRY_NOTE },
    rules: parseClearanceRules(CLEARANCE_RULES),
  };
  return { deps, calls };
}

describe('runGuarded', () => {
  it('passes a clean draft on the first attempt, checked by the judge', async () => {
    const { deps, calls } = fakeDeps(['What does line 1 do?']);
    const res = await runGuarded(request(), deps);
    expect(res).toMatchObject({ reply: 'What does line 1 do?', attempts: 1, intercepted: [], fallback: false });
    expect(calls.map((c) => c.model)).toEqual(['tutor', 'judge']);
    expect(res.debug.judgeChecks).toHaveLength(1);
  });

  it('blocks a code block, tells the tutor why, and uses the retry', async () => {
    const { deps, calls } = fakeDeps(['Here:\n```python\nprint(1)\n```', 'Which line?']);
    const res = await runGuarded(request(), deps);
    expect(res).toMatchObject({ reply: 'Which line?', attempts: 2, fallback: false });
    expect(res.intercepted).toEqual([expect.objectContaining({ attempt: 1, step: 'code-check' })]);
    // The code check fails before the judge is asked, so the judge only sees the second draft.
    expect(calls.map((c) => c.model)).toEqual(['tutor', 'tutor', 'judge']);
    const retry = calls[1].messages;
    expect(retry.at(-2)).toEqual({ role: 'assistant', content: 'Here:\n```python\nprint(1)\n```' });
    expect(retry.at(-1)?.role).toBe('system');
    expect(retry.at(-1)?.content).toMatch(/^Your previous draft was rejected\. It contained a code block.*Rewrite it strictly at Clearance 1: One guiding question/);
  });

  it('blocks a draft the judge flags', async () => {
    const { deps } = fakeDeps(['LEAK: change >= to >', 'Which comparison?']);
    const res = await runGuarded(request({ level: 2 }), deps);
    expect(res).toMatchObject({ reply: 'Which comparison?', attempts: 2 });
    expect(res.intercepted[0]).toMatchObject({ step: 'judge', why: 'Gives the fix.' });
  });

  it('falls back to the app message after 3 failed attempts', async () => {
    const { deps, calls } = fakeDeps(['LEAK 1', '```\ncode\n```', 'LEAK 3', 'never used']);
    const res = await runGuarded(request(), deps);
    expect(res).toMatchObject({ reply: FALLBACK_REPLY, attempts: 3, fallback: true });
    expect(res.intercepted.map((i) => i.step)).toEqual(['judge', 'code-check', 'judge']);
    expect(calls.filter((c) => c.model === 'tutor')).toHaveLength(3);
  });

  it('lets a draft through when the judge answer is unreadable, and logs it', async () => {
    const { deps } = fakeDeps(['LEAK but judge is broken'], 'no idea');
    const logged: string[] = [];
    const res = await runGuarded(request(), { ...deps, log: (m) => logged.push(m) });
    expect(res).toMatchObject({ attempts: 1, fallback: false });
    expect(res.debug.judgeChecks[0].verdict.parsed).toBe(false);
    expect(logged[0]).toMatch(/unreadable/);
  });

  it('skips the judge at Clearance 3-5 and in Explain mode', async () => {
    for (const over of [{ level: 3 }, { level: 5 }, { mode: 'explain' as const, level: 1 }]) {
      const { deps, calls } = fakeDeps(['```pseudo\nloop\n```']);
      const res = await runGuarded(request(over), deps);
      expect(res.fallback).toBe(false);
      expect(calls.every((c) => c.model === 'tutor')).toBe(true);
    }
  });

  it('takes a mission out in Challenge mode and checks only the rest', async () => {
    const mission = '```python\n# Mission: Evens\n# Print the even numbers.\n\n# Your code below\n```';
    const { deps, calls } = fakeDeps([`Mission ready.\n${mission}`]);
    const res = await runGuarded(request({ mode: 'challenge' }), deps);
    expect(res).toMatchObject({ reply: 'Mission ready.', attempts: 1, fallback: false });
    expect(res.mission).toMatchObject({ title: 'Evens', lang: 'python' });
    // The judge sees the reply without the mission.
    expect(calls[1].messages[1].content.endsWith('Draft reply:\nMission ready.')).toBe(true);
  });

  it('still blocks other code next to a mission', async () => {
    const leak = 'Mission:\n```python\n# Mission: Evens\n```\nHint:\n```python\nprint(2)\n```';
    const { deps } = fakeDeps([leak, 'Try it.']);
    const res = await runGuarded(request({ mode: 'challenge' }), deps);
    expect(res).toMatchObject({ reply: 'Try it.', attempts: 2, mission: null });
    expect(res.intercepted[0].step).toBe('code-check');
  });

  it('treats a mission block as ordinary code outside Challenge mode', async () => {
    const { deps } = fakeDeps(['```python\n# Mission: Evens\n```', 'Which line?']);
    const res = await runGuarded(request({ mode: 'debug' }), deps);
    expect(res).toMatchObject({ reply: 'Which line?', mission: null, attempts: 2 });
  });
});
