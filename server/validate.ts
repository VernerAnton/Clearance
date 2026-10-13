// Checks a POST /api/chat body. The level is validated here, on the server:
// the browser picks it, but nothing that arrives is trusted blindly.
import { MODES, type ModeId } from '../shared/clearance.ts';
import { LIMITS, type ChatRequest, type HistoryMessage } from '../shared/api.ts';

export type Validated = { ok: true; value: ChatRequest } | { ok: false; error: string };

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const fail = (error: string): Validated => ({ ok: false, error });

export function validateChatRequest(body: unknown): Validated {
  if (!isObject(body)) return fail('The request must be a JSON object.');
  const { mode, level, message, history, activeTab, lastRun } = body;

  if (typeof mode !== 'string' || !MODES.some((m) => m.id === mode)) return fail(`Unknown mode: ${String(mode)}.`);
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 5) {
    return fail('The level must be a whole number from 1 to 5.');
  }
  if (typeof message !== 'string' || !message.trim()) return fail('The message is empty.');
  if (message.length > LIMITS.message) return fail(`The message is longer than ${LIMITS.message} characters.`);

  if (!Array.isArray(history)) return fail('The history must be a list.');
  const cleanHistory: HistoryMessage[] = [];
  for (const h of history) {
    if (!isObject(h) || (h.role !== 'user' && h.role !== 'assistant') || typeof h.content !== 'string') {
      return fail('Each history message needs a role (user or assistant) and text.');
    }
    cleanHistory.push({ role: h.role, content: h.content.slice(0, LIMITS.historyContent) });
  }

  if (!isObject(activeTab)) return fail('The open tab is missing.');
  const { title, lang, code, fromMission } = activeTab;
  if (typeof title !== 'string' || (lang !== 'python' && lang !== 'sql') || typeof code !== 'string') {
    return fail('The open tab needs a title, a language (python or sql) and code.');
  }
  if (code.length > LIMITS.code) return fail(`The open tab has more than ${LIMITS.code} characters of code.`);

  let cleanRun: ChatRequest['lastRun'] = null;
  if (lastRun !== null && lastRun !== undefined) {
    if (!isObject(lastRun) || typeof lastRun.output !== 'string' || typeof lastRun.endedWithError !== 'boolean') {
      return fail('The last run needs its output and whether it ended with an error.');
    }
    cleanRun = { output: lastRun.output.slice(-LIMITS.output), endedWithError: lastRun.endedWithError };
  }

  return {
    ok: true,
    value: {
      mode: mode as ModeId,
      level,
      message,
      // Only the most recent part of a long chat is sent on, to keep requests small.
      history: cleanHistory.slice(-LIMITS.historyMessages),
      activeTab: { title: title.slice(0, LIMITS.title), lang, code, fromMission: fromMission === true },
      lastRun: cleanRun,
    },
  };
}
