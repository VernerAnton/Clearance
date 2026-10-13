// Missions: in Challenge mode the tutor writes a new exercise as one code block
// tagged python or sql whose first line is "# Mission: <title>" (or "-- Mission: <title>").
// The app takes that block out of the reply and opens it in a new tab.
import type { Mission } from '../shared/api.ts';
import { findFences } from './guard.ts';

const TITLE_LINE = { python: /^#\s*Mission:\s*(.+?)\s*$/i, sql: /^--\s*Mission:\s*(.+?)\s*$/i };

export interface Extracted {
  mission: Mission;
  /** The reply without the mission block. This is what the guard checks and the chat shows. */
  rest: string;
}

export function extractMission(reply: string): Extracted | null {
  for (const fence of findFences(reply)) {
    const lang = fence.lang === 'python' || fence.lang === 'sql' ? fence.lang : null;
    if (!lang) continue;
    const firstLine = fence.body.split('\n').find((line) => line.trim()) ?? '';
    const title = firstLine.trim().match(TITLE_LINE[lang])?.[1];
    if (!title) continue;
    const rest = (reply.slice(0, fence.start) + reply.slice(fence.end))
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const code = fence.body.replace(/^\s*\n/, '').replace(/\s+$/, '') + '\n';
    return { mission: { title: title.slice(0, 60), lang, code }, rest };
  }
  return null;
}
