// Handles one tutor message: validate it, run it through the guard pipeline, answer.
import type { ChatError, ChatResponse } from '../shared/api.ts';
import { modeById } from '../shared/clearance.ts';
import { ApiError, complete, type Env } from './openrouter.ts';
import { runGuarded } from './pipeline.ts';
import { CLEARANCE_RULES, JUDGE_SYSTEM, RETRY_NOTE, TUTOR_SYSTEM } from './prompts.generated.ts';
import { parseClearanceRules } from './rules.ts';
import { validateChatRequest } from './validate.ts';

const rules = parseClearanceRules(CLEARANCE_RULES);

const json = (body: ChatResponse | ChatError, status = 200) => Response.json(body, { status });

export async function handleChat(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: { kind: 'bad-request', message: 'The request was not valid JSON.' } }, 400);
  }
  const checked = validateChatRequest(body);
  if (!checked.ok) return json({ error: { kind: 'bad-request', message: checked.error } }, 400);
  const req = checked.value;

  if (!env.TUTOR_MODEL) {
    return json({ error: { kind: 'config', message: "TUTOR_MODEL is not set. Add it in the Worker's Settings → Variables and Secrets on Cloudflare (or in .dev.vars when running locally)." } }, 500);
  }

  const needsJudge = modeById(req.mode).hasLevels && req.level <= 2;
  if (needsJudge && !env.JUDGE_MODEL) {
    return json({ error: { kind: 'config', message: "JUDGE_MODEL is not set. Add it in the Worker's Settings → Variables and Secrets on Cloudflare (or in .dev.vars when running locally)." } }, 500);
  }

  try {
    const response = await runGuarded(req, {
      complete: (model, messages) => complete(env, model, messages),
      tutorModel: env.TUTOR_MODEL,
      judgeModel: env.JUDGE_MODEL ?? '',
      prompts: { tutorSystem: TUTOR_SYSTEM, judgeSystem: JUDGE_SYSTEM, retryNote: RETRY_NOTE },
      rules,
      log: (message) => console.log(message),
    });
    return json(response);
  } catch (err) {
    if (err instanceof ApiError) return json({ error: { kind: err.kind, message: err.message } }, err.status);
    console.error('chat failed', err);
    return json({ error: { kind: 'upstream', message: 'Something went wrong on the server. Try again.' } }, 500);
  }
}
