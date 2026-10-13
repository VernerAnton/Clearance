// User settings, saved in localStorage. Phase 7 adds the debug panel toggle here.

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  /** Underline syntax errors while typing. */
  liveLinting: boolean;
  /** Suggest names and keywords while typing. */
  autocomplete: boolean;
  /** Typing ( [ { " or ' also types the closing one. */
  closeBrackets: boolean;
  /** Follow the computer's setting, or force light or dark. */
  theme: Theme;
}

const STORAGE_KEY = 'clearance.settings.v1';

// Editor helpers start off: typing brackets and names yourself is good practice early on.
export const DEFAULT_SETTINGS: Settings = {
  liveLinting: false,
  autocomplete: false,
  closeBrackets: false,
  theme: 'system',
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
