// Builds the messages sent to the tutor model: the system prompt, the chat so far,
// and the new message with the app's context header in front of it.
import { modeById } from '../shared/clearance.ts';
import type { ChatRequest } from '../shared/api.ts';
import type { ClearanceRules } from './rules.ts';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A Markdown fence longer than any run of backticks inside the text, so the code can't break out. */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The rule line for this mode and level, as in the header and in retry notes. */
export function ruleFor(req: Pick<ChatRequest, 'mode' | 'level'>, rules: ClearanceRules): string {
  return modeById(req.mode).hasLevels ? `Clearance ${req.level}: ${rules.levels[req.level]}` : rules.explain;
}

/** The context header the app puts in front of the learner's message. */
export function contextHeader(req: ChatRequest, rules: ClearanceRules): string {
  const mode = modeById(req.mode);
  const tab = req.activeTab;
  const lines = [`[Mode: ${mode.label} | ${ruleFor(req, rules)}]`];
  lines.push(`[Open tab: ${tab.title} (${tab.lang}${tab.fromMission ? ', mission' : ''})]`);
  const fence = fenceFor(tab.code);
  lines.push(`${fence}${tab.lang}\n${tab.code.replace(/\n+$/, '')}\n${fence}`);
  if (req.lastRun) {
    lines.push(`[Last run output${req.lastRun.endedWithError ? ' (ended with an error)' : ''}]`);
    lines.push(req.lastRun.output.replace(/\n+$/, '') || '(no output)');
  } else {
    lines.push('[Not run yet]');
  }
  return lines.join('\n');
}

export function buildTutorMessages(req: ChatRequest, systemPrompt: string, rules: ClearanceRules): ModelMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    // Older turns go without their headers: only the current turn carries code and output.
    ...req.history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: `${contextHeader(req, rules)}\n\n${req.message}` },
  ];
}
