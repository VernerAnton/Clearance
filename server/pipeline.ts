// The guard pipeline every tutor reply goes through before the learner sees it:
// draft → (mission taken out) → code check → judge (Clearance 1-2) → up to 2 retries → app fallback.
import { modeById } from '../shared/clearance.ts';
import type { ChatRequest, ChatResponse, Intercepted, JudgeCheck } from '../shared/api.ts';
import { codeCheck } from './guard.ts';
import type { Judge } from './judge.ts';
import { extractMission } from './mission.ts';
import { buildTutorMessages, ruleFor, type ModelMessage } from './messages.ts';
import type { ClearanceRules } from './rules.ts';

export const MAX_RETRIES = 2;

/** The app's own reply when every draft was blocked. */
export const FALLBACK_REPLY = 'Transmission blocked. What did you expect to happen, and what happened instead?';

export interface PipelineDeps {
  /** Ask the tutor model; returns its reply text. */
  complete: (model: string, messages: ModelMessage[]) => Promise<string>;
  tutorModel: string;
  /** Checks a draft at Clearance 1-2 (a chat model or Jev, see judges.ts). */
  judge: Judge;
  prompts: { tutorSystem: string; retryNote: string };
  rules: ClearanceRules;
  log?: (message: string) => void;
}

export async function runGuarded(req: ChatRequest, deps: PipelineDeps): Promise<ChatResponse> {
  const { hasLevels } = modeById(req.mode);
  const useJudge = hasLevels && req.level <= 2;
  const rule = ruleFor(req, deps.rules);
  let messages = buildTutorMessages(req, deps.prompts.tutorSystem, deps.rules);
  const intercepted: Intercepted[] = [];
  const judgeChecks: JudgeCheck[] = [];

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const draft = await deps.complete(deps.tutorModel, messages);

    // In Challenge mode a mission block is allowed: it's a new exercise, not an answer.
    // It's taken out, and the rest of the reply is checked as usual.
    const extracted = req.mode === 'challenge' ? extractMission(draft) : null;
    const shown = extracted ? extracted.rest : draft;

    let step: Intercepted['step'] = 'code-check';
    let why = codeCheck(shown, req.level, hasLevels);

    if (!why && useJudge) {
      const { messages: judgeMessages, raw, verdict } = await deps.judge({
        level: req.level,
        learnerMessage: req.message,
        code: req.activeTab.code,
        lang: req.activeTab.lang,
        draft: shown,
      });
      if (!verdict.parsed) deps.log?.(`Judge answer unreadable, draft let through: ${raw.slice(0, 300)}`);
      judgeChecks.push({ attempt, messages: judgeMessages, raw, verdict });
      if (verdict.leaks) {
        step = 'judge';
        why = verdict.why;
      }
    }

    if (!why) {
      return {
        reply: shown,
        attempts: attempt,
        intercepted,
        fallback: false,
        mission: extracted?.mission ?? null,
        debug: { tutorMessages: messages, judgeChecks },
      };
    }

    intercepted.push({ attempt, step, why, draft });
    if (attempt <= MAX_RETRIES) {
      const note = deps.prompts.retryNote.replace('{why}', why).replace('{rule}', rule);
      messages = [...messages, { role: 'assistant', content: draft }, { role: 'system', content: note }];
    }
  }

  return {
    reply: FALLBACK_REPLY,
    attempts: MAX_RETRIES + 1,
    intercepted,
    fallback: true,
    mission: null,
    debug: { tutorMessages: messages, judgeChecks },
  };
}
