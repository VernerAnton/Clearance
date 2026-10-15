// Calls OpenRouter's OpenAI-compatible chat API. Only ever runs on the server,
// so the API key never reaches the browser.
import type { ChatError } from '../shared/api.ts';
import type { ModelMessage } from './messages.ts';

export interface Env {
  OPENROUTER_API_KEY?: string;
  TUTOR_MODEL?: string;
  JUDGE_MODEL?: string;
  /** Only for testing against a fake server. Defaults to OpenRouter. */
  OPENROUTER_BASE_URL?: string;
}

/** An error with a message that's fine to show the learner. */
export class ApiError extends Error {
  readonly kind: ChatError['error']['kind'];
  readonly status: number;
  constructor(kind: ChatError['error']['kind'], message: string, status = 502) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

const TIMEOUT_MS = 60_000;

function errorFor(status: number, detail: string): ApiError {
  if (status === 401 || status === 403) {
    return new ApiError('auth', "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in the Worker's Settings → Variables and Secrets on Cloudflare (or in .dev.vars when running locally).", 500);
  }
  if (status === 402) return new ApiError('credits', 'The OpenRouter account is out of credits (or hit its spending limit).');
  if (status === 429) return new ApiError('rate-limit', 'Too many requests right now. Wait a moment and try again.', 429);
  if (status === 400 || status === 404) {
    return new ApiError('config', `OpenRouter couldn't handle the request. Is the model name right? (${detail})`, 500);
  }
  return new ApiError('upstream', `The model service had a problem (${status}). Try again in a moment.`);
}

/**
 * The models we use "think" before answering, and that thinking counts toward
 * max_tokens. With a tight limit the thinking can use it all up, leaving an
 * empty answer. So: ask for short thinking, and leave plenty of room. The limit
 * is only a ceiling; you pay for the tokens actually used.
 */
export const MAX_TOKENS = 8000;
export const REASONING = { effort: 'low', exclude: true } as const;

/** How many times an empty reply is retried before giving up. */
const EMPTY_RETRIES = 1;

/** Sends messages to a model and returns its reply text. */
export async function complete(env: Env, model: string, messages: ModelMessage[], maxTokens = MAX_TOKENS): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const { content, finishReason } = await requestOnce(env, model, messages, maxTokens);
    if (content.trim()) return content;
    console.log(`Empty reply from ${model} (finish_reason: ${finishReason})`);
    if (attempt >= EMPTY_RETRIES) {
      const why = finishReason === 'length' ? ' It spent its whole answer length thinking.' : '';
      throw new ApiError('upstream', `The model (${model}) sent an empty reply.${why} Try again.`);
    }
  }
}

async function requestOnce(env: Env, model: string, messages: ModelMessage[], maxTokens: number) {
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new ApiError('config', "OPENROUTER_API_KEY is not set. Add it as a secret in the Worker's Settings → Variables and Secrets on Cloudflare (or in .dev.vars when running locally).", 500);
  const base = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Clearance' },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, reasoning: REASONING }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new ApiError('upstream', timedOut ? 'The model took too long to answer. Try again.' : 'Could not reach OpenRouter. Check the internet connection.');
  }

  type Completion = {
    choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    error?: { code?: number; message?: string };
  };
  let data: Completion;
  try {
    data = (await res.json()) as Completion;
  } catch {
    throw errorFor(res.status, 'the response was not JSON');
  }
  // OpenRouter sometimes reports errors inside a 200 response.
  if (!res.ok || data.error) throw errorFor(data.error?.code ?? res.status, data.error?.message ?? res.statusText);

  const choice = data.choices?.[0];
  const content = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  return { content, finishReason: choice?.finish_reason ?? 'unknown' };
}
