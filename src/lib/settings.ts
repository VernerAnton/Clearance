// User settings, saved in localStorage.
import { THINKING_LEVELS, type Thinking } from '../../shared/api';
import { isJudgeModel, isTutorModel } from '../../shared/models';

export type Theme = 'system' | 'light' | 'dark';
/** Auto: the side-panel layout when the window is narrow. Full / Side panel: always that one. */
export type LayoutMode = 'auto' | 'full' | 'side';
export const LAYOUT_MODES: LayoutMode[] = ['auto', 'full', 'side'];

export interface Settings {
  /** Underline syntax errors while typing. */
  liveLinting: boolean;
  /** Suggest names and keywords while typing. */
  autocomplete: boolean;
  /** Typing ( [ { " or ' also types the closing one. */
  closeBrackets: boolean;
  /** Follow the computer's setting, or force light or dark. */
  theme: Theme;
  /** Show the "What the tutor receives" panel, with blocked drafts. */
  debugPanel: boolean;
  /** Model IDs picked in Settings; "" means the server's default. */
  tutorModel: string;
  judgeModel: string;
  /** How hard the tutor thinks before answering. More: slower, costlier, more careful and varied. */
  thinking: Thinking;
  /** Full three-column layout, or the narrow side-panel layout for next to a course site. */
  layoutMode: LayoutMode;
}

const STORAGE_KEY = 'clearance.settings.v1';

// Editor helpers start off: typing brackets and names yourself is good practice early on.
export const DEFAULT_SETTINGS: Settings = {
  liveLinting: false,
  autocomplete: false,
  closeBrackets: false,
  theme: 'system',
  debugPanel: false,
  tutorModel: '',
  judgeModel: '',
  thinking: 'low',
  layoutMode: 'auto',
};

/** Read saved settings, keeping only values that make sense and defaulting the rest. */
export function parseSettings(raw: string | null): Settings {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch {
    // Broken JSON: use the defaults.
  }
  const bool = (key: keyof Settings) =>
    typeof data[key] === 'boolean' ? (data[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);
  const theme = data.theme === 'light' || data.theme === 'dark' ? data.theme : 'system';
  return {
    liveLinting: bool('liveLinting'),
    autocomplete: bool('autocomplete'),
    closeBrackets: bool('closeBrackets'),
    theme,
    debugPanel: bool('debugPanel'),
    // A model that's no longer on the list falls back to the server's default.
    tutorModel: typeof data.tutorModel === 'string' && isTutorModel(data.tutorModel) ? data.tutorModel : '',
    judgeModel: typeof data.judgeModel === 'string' && isJudgeModel(data.judgeModel) ? data.judgeModel : '',
    thinking: THINKING_LEVELS.includes(data.thinking as Thinking) ? (data.thinking as Thinking) : 'low',
    layoutMode: LAYOUT_MODES.includes(data.layoutMode as LayoutMode) ? (data.layoutMode as LayoutMode) : 'auto',
  };
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not saved; the setting still applies for this visit.
  }
}
