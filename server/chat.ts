// Handles one tutor message: validate it, run it through the guard pipeline, answer.
import type { ChatError, ChatResponse } from '../shared/api.ts';
import { modeById } from '../shared/clearance.ts';
import type { JevEnv } from './jev.ts';
import { makeJudge } from './judges.ts';
import { ApiError, complete, type Env } from './openrouter.ts';
import { runGuarded } from './pipeline.ts';
import { CLEARANCE_RULES, RETRY_NOTE, TUTOR_SYSTEM } from './prompts.generated.ts';
import { parseClearanceRules } from './rules.ts';
import { validateChatRequest } from './validate.ts';

const rules = parseClearanceRules(CLEARANCE_RULES);

const json = (body: ChatResponse | ChatError, status = 200) => Response.json(body, { status });

export async function handleChat(request: Request, env: Env & JevEnv): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: { kind: 'bad-request', message: 'The request was not valid JSON.' } }, 400);
  }
  const checked = validateChatRequest(body);
  if (!checked.ok) return json({ error: { kind: 'bad-request', message: checked.error } }, 400);
  const req = checked.value;

  // A model picked in Settings wins; otherwise the server's default.
  const tutorModel = req.models?.tutor || env.TUTOR_MODEL;
  const judgeModel = req.models?.judge || env.JUDGE_MODEL;

  if (!tutorModel) {
    return json({ error: { kind: 'config', message: "No tutor model: pick one in Settings, or set TUTOR_MODEL. Add it in the Worker's Settings → Variables and Secrets on Cloudflare (or in .dev.vars when running locally)." } }, 500);
  }

  const needsJudge = modeById(req.mode).hasLevels && req.level <= 2;
  if (needsJudge && !judgeModel) {
    return json({ error: { kind: 'config', message: "No judge model: pick one in Settings, or set JUDGE_MODEL. Add it in the Worker's Settings → Variables and Secrets on Cloudflare (or in .dev.vars when running locally)." } }, 500);
  }

  try {
    const response = await runGuarded(req, {
      complete: (model, messages) => complete(env, model, messages),
      tutorModel,
      judge: makeJudge(env, judgeModel ?? ''),
      prompts: { tutorSystem: TUTOR_SYSTEM, retryNote: RETRY_NOTE },
      rules,
      log: (message) => console.log(message),
    });
    response.debug.models = { tutor: tutorModel, judge: needsJudge ? (judgeModel ?? null) : null };
    return json(response);
  } catch (err) {
    if (err instanceof ApiError) return json({ error: { kind: err.kind, message: err.message } }, err.status);
    console.error('chat failed', err);
    return json({ error: { kind: 'upstream', message: 'Something went wrong on the server. Try again.' } }, 500);
  }
}
