// The judge: a second model that reads a draft at Clearance 1-2 and says whether it gives too much away.
import { fenceFor, type ModelMessage } from './messages.ts';

export interface JudgeInput {
  level: number;
  learnerMessage: string;
  code: string;
  lang: string;
  draft: string;
}

export interface Verdict {
  leaks: boolean;
  why: string;
  /** False when the judge's answer couldn't be read (it then counts as a pass). */
  parsed: boolean;
}

export function buildJudgeMessages(systemPrompt: string, input: JudgeInput): ModelMessage[] {
  const codeFence = fenceFor(input.code);
  const user = [
    `Clearance: ${input.level}`,
    '',
    "Learner's message:",
    input.learnerMessage,
    '',
    "Learner's code:",
    `${codeFence}${input.lang}\n${input.code.replace(/\n+$/, '')}\n${codeFence}`,
    '',
    'Draft reply:',
    input.draft,
  ].join('\n');
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: user },
  ];
}

/**
 * Reads the judge's answer, expected as {"leaks": true/false, "why": "..."}.
 * Tolerates extra text and ```json fences around it. Anything unreadable counts as a pass:
 * the code check still runs, and a broken judge shouldn't block every reply.
 */
export function parseJudgeReply(raw: string): Verdict {
  const unreadable: Verdict = { leaks: false, why: "The judge's answer couldn't be read, so the draft was let through.", parsed: false };
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return unreadable;
  let data: unknown;
  try {
    data = JSON.parse(match[0]);
  } catch {
    return unreadable;
  }
  if (!data || typeof data !== 'object') return unreadable;
  const { leaks, why } = data as Record<string, unknown>;
  const flag = leaks === true || leaks === 'true' ? true : leaks === false || leaks === 'false' ? false : null;
  if (flag === null) return unreadable;
  return { leaks: flag, why: typeof why === 'string' && why.trim() ? why.trim() : flag ? 'The judge found a leak.' : '', parsed: true };
}

/** What one judge check produced: what was sent, the raw answer, and how it was read. */
export interface JudgeResult {
  messages: { role: string; content: string }[];
  raw: string;
  verdict: Verdict;
}

/** Any judge: a chat model (below) or Jev (jev.ts). */
export type Judge = (input: JudgeInput) => Promise<JudgeResult>;

/** A judge that asks a chat model with prompts/judge-system.md and reads its JSON answer. */
export function chatJudge(
  complete: (model: string, messages: ModelMessage[]) => Promise<string>,
  model: string,
  systemPrompt: string,
): Judge {
  return async (input) => {
    const messages = buildJudgeMessages(systemPrompt, input);
    const raw = await complete(model, messages);
    return { messages, raw, verdict: parseJudgeReply(raw) };
  };
}
