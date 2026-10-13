// The guard pipeline every tutor reply goes through before the learner sees it:
// draft → code check → judge (Clearance 1-2) → up to 2 retries → app fallback.
import { modeById } from '../shared/clearance.ts';
import type { ChatRequest, ChatResponse, Intercepted, JudgeCheck } from '../shared/api.ts';
import { codeCheck } from './guard.ts';
import { buildJudgeMessages, parseJudgeReply } from './judge.ts';
import { buildTutorMessages, ruleFor, type ModelMessage } from './messages.ts';
import type { ClearanceRules } from './rules.ts';

export const MAX_RETRIES = 2;

/** The app's own reply when every draft was blocked. */
export const FALLBACK_REPLY = 'Transmission blocked. What did you expect to happen, and what happened instead?';

export interface PipelineDeps {
  /** Ask a model; returns its reply text. */
  complete: (model: string, messages: ModelMessage[]) => Promise<string>;
  tutorModel: string;
  judgeModel: string;
  prompts: { tutorSystem: string; judgeSystem: string; retryNote: string };
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

    let step: Intercepted['step'] = 'code-check';
    let why = codeCheck(draft, req.level, hasLevels);

    if (!why && useJudge) {
      const judgeMessages = buildJudgeMessages(deps.prompts.judgeSystem, {
        level: req.level,
        learnerMessage: req.message,
        code: req.activeTab.code,
        lang: req.activeTab.lang,
        draft,
      });
      const raw = await deps.complete(deps.judgeModel, judgeMessages);
      const verdict = parseJudgeReply(raw);
      if (!verdict.parsed) deps.log?.(`Judge answer unreadable, draft let through: ${raw.slice(0, 300)}`);
      judgeChecks.push({ attempt, messages: judgeMessages, raw, verdict });
      if (verdict.leaks) {
        step = 'judge';
        why = verdict.why;
      }
    }

    if (!why) {
      return { reply: draft, attempts: attempt, intercepted, fallback: false, mission: null, debug: { tutorMessages: messages, judgeChecks } };
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
