// Modes and clearance levels. Shared by the browser and (from Phase 4) the server,
// so both sides agree on which values exist.

export const MODES = [
  { id: 'debug', label: 'Debug', icon: '🐛', plain: 'Your code is broken', hasLevels: true },
  { id: 'planning', label: 'Planning', icon: '📋', plain: 'You have a goal, not a start', hasLevels: true },
  { id: 'review', label: 'Review', icon: '🔍', plain: 'It works; make it better', hasLevels: true },
  { id: 'explain', label: 'Explain', icon: '💡', plain: 'Understand some code', hasLevels: false },
  { id: 'challenge', label: 'Challenge', icon: '🎯', plain: 'Get a mission to practise', hasLevels: true },
] as const;

export type ModeId = (typeof MODES)[number]['id'];
export type Mode = (typeof MODES)[number];

export const LEVELS = [
  { level: 1, name: 'Probe', plain: 'One guiding question' },
  { level: 2, name: 'Intel', plain: 'Names the concepts you need' },
  { level: 3, name: 'Blueprint', plain: 'Pseudocode, no real syntax' },
  { level: 4, name: 'Simulation', plain: 'Working code for a different problem' },
  { level: 5, name: 'Root access', plain: 'Full solution' },
] as const;

export type Level = (typeof LEVELS)[number]['level'];

export function modeById(id: ModeId): Mode {
  return MODES.find((m) => m.id === id)!;
}

export function levelInfo(level: Level) {
  return LEVELS[level - 1];
}
