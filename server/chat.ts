// Handles one tutor message: validate, build the request, ask the model, answer.
import type { ChatError, ChatResponse } from '../shared/api.ts';
import { buildTutorMessages } from './messages.ts';
import { ApiError, complete, type Env } from './openrouter.ts';
import { CLEARANCE_RULES, TUTOR_SYSTEM } from './prompts.generated.ts';
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
    return json({ error: { kind: 'config', message: 'TUTOR_MODEL is not set. Add it to .dev.vars (see .dev.vars.example).' } }, 500);
  }

  try {
    const tutorMessages = buildTutorMessages(req, TUTOR_SYSTEM, rules);
    const reply = await complete(env, env.TUTOR_MODEL, tutorMessages);
    return json({
      reply,
      attempts: 1,
      intercepted: [],
      fallback: false,
      mission: null,
      debug: { tutorMessages, judgeChecks: [] },
    });
  } catch (err) {
    if (err instanceof ApiError) return json({ error: { kind: err.kind, message: err.message } }, err.status);
    console.error('chat failed', err);
    return json({ error: { kind: 'upstream', message: 'Something went wrong on the server. Try again.' } }, 500);
  }
}
