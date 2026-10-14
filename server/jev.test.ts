import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildJevRequest, jevJudge, jevVerdict, parseJevQuestions } from './jev.ts';
import { makeJudge } from './judges.ts';
import { JEV_QUESTIONS } from './prompts.generated.ts';

const qs = parseJevQuestions(JEV_QUESTIONS);
const input = { level: 1, learnerMessage: 'why 0?', code: 'if n >= 0:', lang: 'python', draft: 'Change >= to >.' };
const answers = (nouls: Record<string, number>) => ({ answers: Object.fromEntries(Object.entries(nouls).map(([k, v]) => [k, { type: 'noul', noul: v }])) });
const allLow = Object.fromEntries(qs.questions.map((q) => [q.id, 0.1]));

describe('parseJevQuestions', () => {
  it('reads the context and one question per leak type from prompts/jev-questions.md', () => {
    expect(qs.context).toMatch(/coding tutor/);
    expect(qs.questions.map((q) => q.id)).toEqual(['has_code', 'states_change', 'line_and_bug', 'all_steps', 'explains_error']);
  });
});

describe('buildJevRequest', () => {
  it('sends the state and one noul question per statement', () => {
    const body = buildJevRequest('jev-latest', input, qs);
    expect(body.model).toBe('jev-latest');
    expect(body.state).toMatchObject({ clearance: 1, learner_message: 'why 0?', learner_code: 'if n >= 0:', draft: 'Change >= to >.' });
    expect(body.questions.states_change).toEqual({ type: 'noul', instructions: qs.questions[1].statement });
  });
});

describe('jevVerdict', () => {
  it('passes when every statement is unlikely', () => {
    expect(jevVerdict(answers(allLow), qs)).toEqual({ leaks: false, why: '', parsed: true });
  });

  it('blocks when a statement reaches the threshold, and gives that statement as the reason', () => {
    const v = jevVerdict(answers({ ...allLow, states_change: 0.97 }), qs);
    expect(v).toMatchObject({ leaks: true, parsed: true });
    expect(v.why).toBe(qs.questions[1].statement);
    expect(jevVerdict(answers({ ...allLow, has_code: 0.5 }), qs).leaks).toBe(true);
    expect(jevVerdict(answers({ ...allLow, has_code: 0.49 }), qs).leaks).toBe(false);
  });

  it('treats missing or odd answers as unreadable (a pass)', () => {
    for (const data of [null, {}, { answers: {} }, answers({ ...allLow, all_steps: Number.NaN }), { answers: { has_code: { noul: 'yes' } } }]) {
      expect(jevVerdict(data, qs)).toMatchObject({ leaks: false, parsed: false });
    }
  });
});

describe('jevJudge', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks TypeSafe and reads the answers', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(answers({ ...allLow, states_change: 0.9 }))));
    vi.stubGlobal('fetch', fetchMock);
    const result = await jevJudge({ TYPESAFE_API_KEY: 'k' }, 'jev-latest', qs)(input);
    expect(result.verdict).toMatchObject({ leaks: true, parsed: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  });

  it('explains a missing key or a rejected key', async () => {
    await expect(jevJudge({}, 'jev-latest', qs)(input)).rejects.toThrow(/TYPESAFE_API_KEY is not set/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    await expect(jevJudge({ TYPESAFE_API_KEY: 'bad' }, 'jev-latest', qs)(input)).rejects.toThrow(/rejected the API key/);
  });
});

describe('makeJudge', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses Jev for "typesafe:" models and OpenRouter otherwise', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(answers(allLow))));
    vi.stubGlobal('fetch', fetchMock);
    await makeJudge({ TYPESAFE_API_KEY: 'k' }, 'typesafe:jev-latest')(input);
    expect(fetchMock.mock.calls[0][0]).toContain('api.typesafe.ai');

    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"leaks": false, "why": "ok"}' } }] })));
    const chat = await makeJudge({ OPENROUTER_API_KEY: 'k' }, 'z-ai/glm-5.3-flash')(input);
    expect(fetchMock.mock.calls[1][0]).toContain('openrouter.ai');
    expect(chat.verdict).toMatchObject({ leaks: false, parsed: true });
  });
});
