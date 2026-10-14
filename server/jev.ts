// The judge, done by TypeSafe's Jev instead of a chat model. Jev answers true/false
// statements about a "state" with probabilities (https://docs.typesafe.ai), so the
// app asks one statement per way a draft can leak and blocks the draft if any is likely.
import type { JudgeInput, JudgeResult, Verdict } from './judge.ts';
import { ApiError } from './openrouter.ts';

export interface JevQuestions {
  context: string;
  questions: { id: string; statement: string }[];
}

/** A draft leaks when any statement's probability reaches this. */
export const JEV_THRESHOLD = 0.5;

export interface JevEnv {
  TYPESAFE_API_KEY?: string;
  /** Only for testing against a fake server. Defaults to TypeSafe. */
  TYPESAFE_BASE_URL?: string;
}

/** Reads prompts/jev-questions.md: a `context:` line and one `id: statement` line per question. */
export function parseJevQuestions(markdown: string): JevQuestions {
  let context = '';
  const questions: { id: string; statement: string }[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^([a-z][a-z0-9_]*):\s*(.+)$/);
    if (!m) continue;
    if (m[1] === 'context') context = m[2].trim();
    else questions.push({ id: m[1], statement: m[2].trim() });
  }
  if (questions.length === 0) throw new Error('prompts/jev-questions.md has no questions');
  return { context, questions };
}

export function buildJevRequest(model: string, input: JudgeInput, qs: JevQuestions) {
  return {
    model,
    state: {
      context: qs.context,
      clearance: input.level,
      learner_message: input.learnerMessage,
      learner_code_language: input.lang,
      learner_code: input.code,
      draft: input.draft,
    },
    questions: Object.fromEntries(qs.questions.map((q) => [q.id, { type: 'noul', instructions: q.statement }])),
  };
}

/**
 * Turns Jev's answers into a verdict. Missing or odd answers make the verdict
 * unreadable, which counts as a pass (the same rule as for the chat judge).
 */
export function jevVerdict(data: unknown, qs: JevQuestions, threshold = JEV_THRESHOLD): Verdict {
  const unreadable: Verdict = { leaks: false, why: "Jev's answer couldn't be read, so the draft was let through.", parsed: false };
  const answers = (data as { answers?: Record<string, { noul?: unknown }> } | null)?.answers;
  if (!answers || typeof answers !== 'object') return unreadable;
  const tripped: string[] = [];
  for (const q of qs.questions) {
    const p = answers[q.id]?.noul;
    if (typeof p !== 'number' || Number.isNaN(p)) return unreadable;
    if (p >= threshold) tripped.push(q.statement);
  }
  return { leaks: tripped.length > 0, why: tripped.join(' '), parsed: true };
}

function errorFor(status: number, detail: string): ApiError {
  if (status === 401 || status === 403) {
    return new ApiError('auth', "TypeSafe rejected the API key. Check TYPESAFE_API_KEY in the Worker's Settings → Variables and Secrets on Cloudflare (or in .dev.vars when running locally).", 500);
  }
  if (status === 402) return new ApiError('credits', 'The TypeSafe account is out of credits.');
  if (status === 429) return new ApiError('rate-limit', 'Too many requests to TypeSafe right now. Wait a moment and try again.', 429);
  if (status >= 400 && status < 500) return new ApiError('config', `TypeSafe couldn't handle the judge request. Is the Jev model name right? (${detail})`, 500);
  return new ApiError('upstream', `TypeSafe had a problem (${status}). Try again in a moment.`);
}

/** A judge that asks Jev. `model` is the Jev model name, e.g. "jev-latest". */
export function jevJudge(env: JevEnv, model: string, qs: JevQuestions) {
  return async (input: JudgeInput): Promise<JudgeResult> => {
    const key = env.TYPESAFE_API_KEY;
    if (!key) {
      throw new ApiError('config', "JUDGE_MODEL uses Jev, but TYPESAFE_API_KEY is not set. Add it as a secret in the Worker's Settings → Variables and Secrets on Cloudflare (or in .dev.vars when running locally).", 500);
    }
    const body = buildJevRequest(model, input, qs);
    let res: Response;
    try {
      res = await fetch(`${env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai'}/v1/systemone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new ApiError('upstream', timedOut ? 'Jev took too long to answer. Try again.' : 'Could not reach TypeSafe. Check the internet connection.');
    }
    const text = await res.text();
    if (!res.ok) throw errorFor(res.status, text.slice(0, 200));
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Unreadable: jevVerdict reports it.
    }
    return {
      messages: [{ role: 'jev request', content: JSON.stringify(body, null, 2) }],
      raw: text,
      verdict: jevVerdict(data, qs),
    };
  };
}
