import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_TOKENS, complete } from './openrouter.ts';

const env = { OPENROUTER_API_KEY: 'k' };
const msgs = [{ role: 'user' as const, content: 'hi' }];
const reply = (content: string | null, finish_reason = 'stop') =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason }] }));

describe('complete', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for short thinking and leaves room for the answer', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply('Hello'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await complete(env, 'm', msgs)).toBe('Hello');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ model: 'm', max_tokens: MAX_TOKENS, reasoning: { effort: 'low', exclude: true } });
  });

  it('retries once when the reply comes back empty', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply(''));
    fetchMock.mockResolvedValueOnce(reply('', 'length')).mockResolvedValueOnce(reply('Second try'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await complete(env, 'm', msgs)).toBe('Second try');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry, naming the model and why', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(null, 'length')));
    await expect(complete(env, 'z-ai/glm-5.3', msgs)).rejects.toThrow(/z-ai\/glm-5\.3\) sent an empty reply\. It spent its whole answer length thinking/);
  });
});
