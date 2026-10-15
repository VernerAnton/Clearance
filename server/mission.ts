// Missions: in Challenge mode the tutor writes each new exercise as a code block
// tagged python or sql whose first line is "# Mission: <title>" (or "-- Mission: <title>").
// The app takes those blocks out of the reply and opens each one in a new tab.
import { LIMITS, type Mission } from '../shared/api.ts';
import { findFences } from './guard.ts';

const TITLE_LINE = { python: /^#\s*Mission:\s*(.+?)\s*$/i, sql: /^--\s*Mission:\s*(.+?)\s*$/i };

export interface Extracted {
  /** Up to LIMITS.missions missions, in the order the tutor wrote them. */
  missions: Mission[];
  /** Missions beyond the limit, left out. */
  skipped: number;
  /** The reply without the mission blocks. This is what the guard checks and the chat shows. */
  rest: string;
}

/** Takes every mission block out of a reply. Returns null if there are none. */
export function extractMissions(reply: string, max = LIMITS.missions): Extracted | null {
  const missions: Mission[] = [];
  const cut: { start: number; end: number }[] = [];
  let skipped = 0;
  for (const fence of findFences(reply)) {
    const lang = fence.lang === 'python' || fence.lang === 'sql' ? fence.lang : null;
    if (!lang) continue;
    const firstLine = fence.body.split('\n').find((line) => line.trim()) ?? '';
    const title = firstLine.trim().match(TITLE_LINE[lang])?.[1];
    if (!title) continue;
    cut.push(fence);
    if (missions.length >= max) {
      skipped++;
      continue;
    }
    const code = fence.body.replace(/^\s*\n/, '').replace(/\s+$/, '') + '\n';
    missions.push({ title: title.slice(0, 60), lang, code });
  }
  if (cut.length === 0) return null;

  let rest = '';
  let at = 0;
  for (const { start, end } of cut) {
    rest += reply.slice(at, start);
    at = end;
  }
  rest += reply.slice(at);
  return { missions, skipped, rest: rest.replace(/\n{3,}/g, '\n\n').trim() };
}
